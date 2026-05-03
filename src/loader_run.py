"""Loader run tracking — context manager that records every loader script
invocation in the `loader_runs` table.

Usage:
    from loader_run import LoaderRun

    with LoaderRun("refresh_watchlist_prices.py", source="cardsight",
                   params={"window_days": 30}) as run:
        # do work...
        run.add_rows_written(42)
        run.add_api_calls(1)
        # On normal exit: status = 'succeeded', finished_at set.
        # On exception:   status = 'failed',    error_message captured,
        #                 then exception re-raised so the caller still sees it.

Pass `run.id` to your inserts to set `loader_run_id` on every row written —
gives you full audit-trail traceability later.
"""

from __future__ import annotations

import json
import os
import traceback
from contextlib import AbstractContextManager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client


def _get_client():
    load_dotenv(Path(__file__).parent.parent / ".env")
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


class LoaderRun(AbstractContextManager):
    """Context manager that creates / updates a loader_runs row."""

    def __init__(
        self,
        script_name: str,
        source: str | None = None,
        params: dict[str, Any] | None = None,
        notes: str | None = None,
    ):
        self.script_name = script_name
        self.source = source
        self.params = params or {}
        self.notes = notes
        self.id: str | None = None
        self.rows_written = 0
        self.rows_read = 0
        self.api_calls = 0
        self._sb = None

    # ------------------------------------------------------------------
    def __enter__(self) -> "LoaderRun":
        self._sb = _get_client()
        try:
            r = (
                self._sb.table("loader_runs")
                .insert(
                    {
                        "script_name": self.script_name,
                        "source_system": self.source,
                        "status": "running",
                        "params": self.params,
                        "notes": self.notes,
                    }
                )
                .execute()
            )
            self.id = r.data[0]["id"] if r.data else None
        except Exception as exc:  # noqa: BLE001
            # If the loader_runs table doesn't exist yet (migration 002
            # hasn't been applied), don't crash the loader — just log and
            # continue with id=None. Provenance won't be recorded, but the
            # loader still does its job.
            if "loader_runs" in str(exc) and (
                "does not exist" in str(exc) or "Could not find" in str(exc)
            ):
                print(
                    "[loader_run] WARNING: loader_runs table missing; "
                    "run `python src/migrate.py up` to enable audit trail."
                )
                self.id = None
            else:
                raise
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        if self.id is None:
            return False  # don't suppress exception
        update = {
            "status": "failed" if exc_type else "succeeded",
            "finished_at": "now()",  # works as a literal here? PostgREST coerces strings;
            # Use ISO timestamp instead so PostgREST treats it as a datetime literal.
            "rows_written": self.rows_written,
            "rows_read": self.rows_read,
            "api_calls": self.api_calls,
        }
        # Use Python now() since PostgREST won't interpret raw SQL.
        from datetime import datetime, timezone
        update["finished_at"] = datetime.now(timezone.utc).isoformat()
        if exc_type:
            update["error_message"] = (
                f"{exc_type.__name__}: {exc_val}\n\n"
                + "".join(traceback.format_tb(exc_tb))[-2000:]  # tail
            )
        try:
            self._sb.table("loader_runs").update(update).eq("id", self.id).execute()
        except Exception as exc:  # noqa: BLE001
            print(f"[loader_run] WARNING: failed to finalize loader_runs row: {exc}")
        return False  # let exceptions propagate

    # ------------------------------------------------------------------
    # counters (called by the loader to keep totals accurate)
    def add_rows_written(self, n: int) -> None:
        self.rows_written += n

    def add_rows_read(self, n: int) -> None:
        self.rows_read += n

    def add_api_calls(self, n: int = 1) -> None:
        self.api_calls += n

    def stamp(self) -> dict[str, Any]:
        """Convenience: returns provenance fields to merge into row inserts."""
        if self.id is None:
            return {}
        out: dict[str, Any] = {"loader_run_id": self.id}
        if self.source:
            out["source_system"] = self.source
        return out
