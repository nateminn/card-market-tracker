"use client";

// Column-visibility dropdown. Click the button → checklist of columns →
// click a column to toggle. State persists in localStorage under the given
// storage key so each table keeps its own preferences.

import { useEffect, useRef, useState } from "react";
import { Settings2, Check } from "lucide-react";
import { clsx } from "./clsx";

export type ColumnDef = {
  id: string;
  label: string;
  /** Default visible. */
  default?: boolean;
  /** Pinned (cannot be hidden - always visible). */
  pinned?: boolean;
};

type Props = {
  columns: ColumnDef[];
  /** Externally-controlled visible set. */
  visible: Set<string>;
  /** Toggle a single column. */
  onToggle: (id: string) => void;
  /** Reset to defaults. */
  onReset: () => void;
  /** Optional: reorder columns by drag (drag id → drop target id). */
  onReorder?: (sourceId: string, targetId: string) => void;
};

function loadVisible(
  key: string,
  columns: ColumnDef[]
): Set<string> {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      const set = new Set(parsed);
      // Always include pinned columns
      for (const c of columns) if (c.pinned) set.add(c.id);
      return set;
    }
  } catch {}
  return new Set(columns.filter((c) => c.default !== false || c.pinned).map((c) => c.id));
}

export function useColumns(
  columns: ColumnDef[],
  storageKey: string
): {
  visible: Set<string>;
  toggle: (id: string) => void;
  reset: () => void;
  /** Order of column ids; reorder() mutates this. Preserves pinned at front. */
  order: string[];
  reorder: (sourceId: string, targetId: string) => void;
  /** Columns sorted by current order. */
  ordered: ColumnDef[];
} {
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.default !== false || c.pinned).map((c) => c.id))
  );
  const [order, setOrder] = useState<string[]>(() => columns.map((c) => c.id));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setVisible(loadVisible(storageKey, columns));
    try {
      const ord = localStorage.getItem(storageKey + ".order");
      if (ord) {
        const parsed = JSON.parse(ord) as string[];
        // Keep only ids that still exist; append any new columns to the end
        const known = new Set(columns.map((c) => c.id));
        const filtered = parsed.filter((id) => known.has(id));
        const missing = columns.map((c) => c.id).filter((id) => !filtered.includes(id));
        setOrder([...filtered, ...missing]);
      }
    } catch {}
    setHydrated(true);
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(Array.from(visible))
      );
    } catch {}
  }, [visible, hydrated, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey + ".order", JSON.stringify(order));
    } catch {}
  }, [order, hydrated, storageKey]);

  const toggle = (id: string) => {
    setVisible((cur) => {
      const next = new Set(cur);
      const col = columns.find((c) => c.id === id);
      if (col?.pinned) return cur;
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => {
    setVisible(
      new Set(
        columns.filter((c) => c.default !== false || c.pinned).map((c) => c.id)
      )
    );
    setOrder(columns.map((c) => c.id));
  };

  const reorder = (sourceId: string, targetId: string) => {
    const source = columns.find((c) => c.id === sourceId);
    const target = columns.find((c) => c.id === targetId);
    if (!source || !target || source.pinned || target.pinned) return;
    setOrder((cur) => {
      const next = cur.filter((id) => id !== sourceId);
      const targetIdx = next.indexOf(targetId);
      next.splice(targetIdx, 0, sourceId);
      return next;
    });
  };

  const orderedIds = order;
  const byId = new Map(columns.map((c) => [c.id, c]));
  const ordered = orderedIds
    .map((id) => byId.get(id))
    .filter((c): c is ColumnDef => Boolean(c));

  return { visible, toggle, reset, order, reorder, ordered };
}

export default function ColumnsControl({
  columns,
  visible,
  onToggle,
  onReset,
  onReorder,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "inline-flex items-center gap-1.5 h-7 px-2.5",
          "text-[11px] font-mono uppercase tracking-[0.06em]",
          "text-muted hover:text-fg",
          "border border-border hover:border-border-2",
          "rounded-[2px] bg-panel-2/40",
          "transition-colors duration-150"
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Settings2 size={12} />
        Columns
      </button>
      {open ? (
        <div
          role="menu"
          className={clsx(
            "absolute right-0 top-full mt-1 z-30",
            "min-w-[200px] py-1",
            "bg-panel border border-border-2 rounded-[2px]",
            "shadow-2xl"
          )}
        >
          {columns.map((c) => {
            const on = visible.has(c.id);
            const draggable = onReorder !== undefined && !c.pinned;
            const isDropTarget = dropTarget === c.id && dragId !== c.id;
            return (
              <div
                key={c.id}
                draggable={draggable}
                onDragStart={(e) => {
                  if (!draggable) return;
                  setDragId(c.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (!draggable || !dragId || dragId === c.id) return;
                  e.preventDefault();
                  setDropTarget(c.id);
                }}
                onDragLeave={() => {
                  if (dropTarget === c.id) setDropTarget(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== c.id && onReorder) {
                    onReorder(dragId, c.id);
                  }
                  setDragId(null);
                  setDropTarget(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropTarget(null);
                }}
                className={clsx(
                  "relative",
                  isDropTarget && "before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-accent"
                )}
              >
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  disabled={c.pinned}
                  onClick={() => onToggle(c.id)}
                  className={clsx(
                    "flex items-center gap-2 w-full px-3 py-1.5",
                    "text-sm text-left",
                    on ? "text-fg" : "text-muted",
                    c.pinned ? "opacity-60 cursor-not-allowed" : "hover:bg-panel-2 cursor-pointer",
                    dragId === c.id && "opacity-50"
                  )}
                >
                  {draggable ? (
                    <span
                      aria-hidden
                      className="text-muted-2 cursor-grab active:cursor-grabbing select-none"
                    >
                      ⋮⋮
                    </span>
                  ) : (
                    <span aria-hidden className="w-2.5" />
                  )}
                  <span
                    className={clsx(
                      "size-3.5 inline-flex items-center justify-center border rounded-[2px] shrink-0",
                      on
                        ? "bg-accent border-accent text-bg"
                        : "border-border-2 text-transparent"
                    )}
                  >
                    {on ? <Check size={10} strokeWidth={3} /> : null}
                  </span>
                  {c.label}
                  {c.pinned ? (
                    <span className="ml-auto text-[10px] text-muted-2 font-mono">
                      pinned
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}
          <div className="border-t border-border mt-1 pt-1 px-3 pb-1">
            <button
              type="button"
              onClick={() => {
                onReset();
                setOpen(false);
              }}
              className="text-[11px] text-muted hover:text-fg transition-colors duration-150"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
