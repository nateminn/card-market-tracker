"use client";

// ColumnSwitcher - table-header dropdown that lets the user swap a column's
// metric or time window without changing the visual structure of the table.
// Each instance persists its choice to localStorage so the picked view sticks
// across reloads.
//
// Visual: a small inline button styled like a header label, with a thin
// chevron. Clicking opens a popover anchored below. Click outside (or the
// chosen item) closes it.

import { useEffect, useRef, useState } from "react";
import { clsx } from "./clsx";

export type SwitcherOption<T extends string> = {
  id: T;
  label: string;
  /** Optional InfoTip-style hint shown next to the option. */
  hint?: string;
};

type Props<T extends string> = {
  options: SwitcherOption<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Aligns the popover; default left. */
  align?: "left" | "right";
  /** Optional sort indicator suffix (" ↑" / " ↓") to render after the label. */
  sortIndicator?: string;
  /** Click-handler bubbles UP a sort toggle for the active option. */
  onSortToggle?: () => void;
  className?: string;
};

export default function ColumnSwitcher<T extends string>({
  options,
  value,
  onChange,
  align = "left",
  sortIndicator = "",
  onSortToggle,
  className,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = options.find((o) => o.id === value) ?? options[0];

  return (
    <div ref={ref} className={clsx("relative inline-flex items-center", className)}>
      <button
        type="button"
        onClick={() => onSortToggle?.()}
        className="hover:text-fg transition-colors duration-150 cursor-pointer"
        title="Click to sort"
      >
        {active.label}
        <span className="text-fg-2">{sortIndicator}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={`Change ${active.label} view`}
        aria-expanded={open}
        className={clsx(
          "ml-1 size-3.5 inline-flex items-center justify-center rounded-sm",
          "text-muted-2 hover:text-fg hover:bg-panel-2 transition-colors duration-150",
          open && "bg-panel-2 text-fg"
        )}
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className={clsx(
            "absolute top-full mt-1 min-w-[160px] z-30",
            "bg-panel-2 border border-border-2 rounded-sm shadow-lg",
            "py-1",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {options.map((opt) => {
            const isActive = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                className={clsx(
                  "w-full px-3 py-1.5 text-left text-[12px] font-mono normal-case tracking-normal",
                  "flex items-center justify-between gap-3",
                  "hover:bg-panel transition-colors duration-150",
                  isActive ? "text-fg" : "text-fg-2"
                )}
              >
                <span>{opt.label}</span>
                {isActive ? (
                  <span aria-hidden className="text-accent text-[10px]">●</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** localStorage-backed state hook. SSR-safe: starts from defaultValue, then
 *  hydrates from storage in a useEffect - same pattern as useColumns. */
export function useStoredValue<T extends string>(
  key: string,
  defaultValue: T,
  allowed: readonly T[]
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored && allowed.includes(stored as T)) {
        setValue(stored as T);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = (v: T) => {
    setValue(v);
    try {
      window.localStorage.setItem(key, v);
    } catch {
      // ignore
    }
  };

  return [value, update];
}
