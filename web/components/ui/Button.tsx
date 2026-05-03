// Button — primary, secondary, ghost. Single h-8 default size.
// Focus ring: 2px accent ring at low opacity (NOT a glow).

import type { ButtonHTMLAttributes } from "react";
import { clsx } from "./clsx";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-bg hover:bg-accent/90 active:bg-accent/80 disabled:bg-accent/40 disabled:text-bg/60",
  secondary:
    "bg-panel-2 text-fg border border-border hover:border-border-2 hover:bg-panel-2 active:bg-panel disabled:opacity-50",
  ghost:
    "bg-transparent text-fg-2 hover:text-fg hover:bg-panel-2 active:bg-panel disabled:opacity-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-sm",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export default function Button({
  className,
  variant = "secondary",
  size = "md",
  ...rest
}: Props) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2",
        "rounded-[2px]",
        "font-medium tracking-tight",
        "transition-[background,border-color,color] duration-150 ease-[cubic-bezier(0.25,1,0.5,1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-0",
        "disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    />
  );
}
