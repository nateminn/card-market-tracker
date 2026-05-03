// Empty state — never "nothing here". Always teach the next action.

import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  /** A button or link explaining what to do next. */
  action?: ReactNode;
};

export default function EmptyState({ title, description, action }: Props) {
  return (
    <div className="border border-border bg-panel/40 px-6 py-14">
      <div className="max-w-md mx-auto text-center">
        <p className="text-base text-fg">{title}</p>
        {description ? (
          <p className="mt-2 text-sm text-muted">{description}</p>
        ) : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}
