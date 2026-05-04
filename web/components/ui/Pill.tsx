// Pill / badge - small typed label.
// Used for RC, grade tier, confidence band, sport, listing source.

import { clsx } from "./clsx";

type Tone = "default" | "accent" | "up" | "down" | "info" | "muted";

const TONES: Record<Tone, string> = {
  default: "border-border text-fg-2 bg-panel-2",
  accent:  "border-accent/30 text-accent bg-accent-quiet",
  up:      "border-up/30 text-up bg-up-quiet",
  down:    "border-down/30 text-down bg-down-quiet",
  info:    "border-info/30 text-info bg-info/10",
  muted:   "border-border text-muted bg-bg",
};

type Props = {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
};

export default function Pill({ children, tone = "default", className }: Props) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-1.5 py-0.5",
        "font-mono text-[10px] uppercase tracking-[0.08em]",
        "border",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
