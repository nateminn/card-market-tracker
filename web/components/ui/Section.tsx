// Section header — the "eyebrow + heading" pattern used on most page sections.
// Keeps spacing and type rhythm consistent across pages.

import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  /** Right-side slot — typically a link, button, or status text. */
  action?: ReactNode;
  className?: string;
};

export default function Section({ eyebrow, title, action, className }: Props) {
  return (
    <div className={`mb-3 flex items-end justify-between gap-4 ${className ?? ""}`}>
      <div>
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h2 className="text-lg text-fg">{title}</h2>
      </div>
      {action ? <div className="text-sm text-muted">{action}</div> : null}
    </div>
  );
}
