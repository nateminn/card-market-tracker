// Skeleton block - used for loading states. Uses the .skeleton class from
// globals.css (opacity pulse, respects prefers-reduced-motion).

import { clsx } from "./clsx";

type Props = {
  className?: string;
  /** Number of stacked rows to render. */
  rows?: number;
};

export default function Skeleton({ className, rows = 1 }: Props) {
  if (rows <= 1) return <div className={clsx("skeleton", className)} />;
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={clsx("skeleton", className)} />
      ))}
    </div>
  );
}
