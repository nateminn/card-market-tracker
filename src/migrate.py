"""Cardex migrations runner.

Applies numbered SQL files in src/migrations/ in order. Tracks applied
migrations in a `_migrations` table so re-runs are safe.

Convention:
    src/migrations/NNN_name.sql  — three-digit prefix, snake_case name
    Files are applied alphabetically. Each file should be idempotent
    if at all possible (use `IF NOT EXISTS`, `IF EXISTS`, etc.).

Usage:
    python src/migrate.py status     # show what's applied / pending
    python src/migrate.py up         # apply all pending migrations
    python src/migrate.py up <name>  # apply one specific migration
    python src/migrate.py mark <name>  # mark applied without running
                                       # (use when you ran it manually
                                       # in the Supabase SQL Editor)

Connection: needs DATABASE_URL in .env. Get it from Supabase Dashboard →
Project Settings → Database → Connection string → URI (use the "Session
pooler" or "Transaction pooler" — either works for migrations). Format:
    postgresql://postgres.PROJECT:PASSWORD@HOST:PORT/postgres
"""

from __future__ import annotations

import hashlib
import os
import sys
import time
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
MIGRATIONS_DIR = ROOT / "src" / "migrations"


def get_connection():
    load_dotenv(ROOT / ".env")
    url = os.environ.get("DATABASE_URL")
    if not url:
        print(
            "ERROR: DATABASE_URL is not set in .env.\n\n"
            "Get the connection string from Supabase:\n"
            "  Dashboard → Project Settings → Database → Connection string\n"
            "  Choose 'Session pooler' (or 'Transaction pooler') → URI tab\n"
            "  Copy the string, replace [YOUR-PASSWORD] with your DB password,\n"
            "  and add it to .env as:\n"
            "    DATABASE_URL=postgresql://postgres.xxxxx:PWD@host:5432/postgres\n"
        )
        sys.exit(2)
    return psycopg.connect(url, autocommit=False)


def ensure_migrations_table(conn) -> None:
    """Bootstrap the _migrations tracking table on first run."""
    with conn.cursor() as cur:
        cur.execute(
            """
            create table if not exists _migrations (
                id          serial primary key,
                name        text not null unique,
                checksum    text,
                applied_at  timestamptz not null default now()
            )
            """
        )
    conn.commit()


def list_migration_files() -> list[Path]:
    if not MIGRATIONS_DIR.is_dir():
        return []
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def applied_set(conn) -> dict[str, str]:
    """{migration_name: checksum} of already-applied migrations."""
    with conn.cursor() as cur:
        cur.execute("select name, checksum from _migrations")
        return {row[0]: row[1] for row in cur.fetchall()}


def checksum(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def apply_one(conn, path: Path) -> None:
    sql = path.read_text()
    cs = checksum(sql)
    name = path.name
    started = time.time()
    with conn.cursor() as cur:
        # Run migration body inside a transaction so a failure rolls back.
        # SQL files can contain multiple statements separated by semicolons —
        # psycopg handles that fine when we pass the whole file as one query.
        cur.execute(sql)
        cur.execute(
            "insert into _migrations (name, checksum) values (%s, %s)",
            (name, cs),
        )
    conn.commit()
    print(f"  ✓ {name}  ({time.time() - started:.2f}s)")


def cmd_status(conn) -> int:
    files = list_migration_files()
    applied = applied_set(conn)
    print(f"Migrations dir: {MIGRATIONS_DIR}")
    print(f"  files:   {len(files)}")
    print(f"  applied: {len(applied)}")
    print()
    for f in files:
        cs = checksum(f.read_text())
        prior_cs = applied.get(f.name)
        if prior_cs is None:
            print(f"  ◌ {f.name:50s}  pending")
        elif prior_cs != cs:
            print(f"  ⚠ {f.name:50s}  applied (checksum drift!)")
        else:
            print(f"  ✓ {f.name:50s}  applied")
    return 0


def cmd_up(conn, only: str | None) -> int:
    files = list_migration_files()
    applied = applied_set(conn)
    pending = [f for f in files if f.name not in applied]
    if only:
        pending = [f for f in pending if f.name == only or f.stem == only]
        if not pending:
            print(f"No pending migration matches '{only}'.")
            return 1
    if not pending:
        print("Nothing to apply.")
        return 0
    print(f"Applying {len(pending)} migration(s)...")
    for f in pending:
        try:
            apply_one(conn, f)
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            print(f"  ✗ {f.name}  FAILED: {exc}")
            return 1
    return 0


def cmd_mark(conn, name: str) -> int:
    """Record a migration as applied without running its SQL.

    Use this when you've already run the SQL manually in the Supabase SQL
    Editor (the historical workflow before this runner existed).
    """
    files = list_migration_files()
    match = [f for f in files if f.name == name or f.stem == name]
    if not match:
        print(f"No migration file matches '{name}'.")
        print("Available files:")
        for f in files:
            print(f"  {f.name}")
        return 1
    f = match[0]
    cs = checksum(f.read_text())
    with conn.cursor() as cur:
        cur.execute(
            "insert into _migrations (name, checksum) values (%s, %s) "
            "on conflict (name) do update set checksum = excluded.checksum",
            (f.name, cs),
        )
    conn.commit()
    print(f"  ✓ marked {f.name} as applied")
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    cmd = sys.argv[1]
    rest = sys.argv[2:]
    with get_connection() as conn:
        ensure_migrations_table(conn)
        if cmd == "status":
            return cmd_status(conn)
        if cmd == "up":
            return cmd_up(conn, rest[0] if rest else None)
        if cmd == "mark":
            if not rest:
                print("Usage: python src/migrate.py mark <migration_name>")
                return 2
            return cmd_mark(conn, rest[0])
        print(f"Unknown command: {cmd}")
        print(__doc__)
        return 2


if __name__ == "__main__":
    sys.exit(main())
