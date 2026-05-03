"use client";

// Mobile-only nav button. On desktop the nav is inline in the header; on
// small viewports we collapse to a single button that opens a panel below.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

type Item = { href: string; label: string };

export default function MobileNav({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="size-9 inline-flex items-center justify-center rounded-md border border-border text-fg-2 hover:text-fg hover:border-border-2 transition-colors duration-150"
      >
        {open ? <X size={16} /> : <Menu size={16} />}
      </button>

      {open ? (
        <>
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-14 z-30 bg-bg/70 backdrop-blur-sm"
            aria-hidden
          />
          <nav
            className="fixed top-14 left-0 right-0 z-40 bg-panel-2 border-b border-border-2 shadow-xl"
            aria-label="Primary"
          >
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-6 py-4 text-base text-fg-2 hover:text-fg hover:bg-panel transition-colors duration-150 border-b border-border last:border-b-0"
              >
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="block w-full text-left px-6 py-4 text-base text-fg hover:bg-panel transition-colors duration-150"
            >
              Account
            </button>
          </nav>
        </>
      ) : null}
    </>
  );
}
