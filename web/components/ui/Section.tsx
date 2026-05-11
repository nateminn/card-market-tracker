// Section header - the "eyebrow + heading" pattern used on most page sections.
// Keeps spacing and type rhythm consistent across pages.

import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  /** Right-side slot - typically a link, button, or status text. */
  action?: ReactNode;
  className?: string;
};

export default function Section({ eyebrow, title, action, className }: Props) {
  // Stack on mobile (action drops below title), side-by-side on sm+.
  // Was: `flex items-end justify-between gap-4` which squeezed the eyebrow
  // column to ~76px on mobile when the action was a multi-item legend,
  // causing 11px uppercase eyebrows to wrap to 3 lines.
  return (
    <div
      className={`mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4 ${className ?? ""}`}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h2 className="text-lg text-fg">{title}</h2>
      </div>
      {action ? <div className="text-sm text-muted">{action}</div> : null}
    </div>
  );
}
