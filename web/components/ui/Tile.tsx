// Bordered surface - used to wrap tables and content blocks.
// NOT a hero-metric tile. Just a thin panel container.

import type { ComponentProps } from "react";
import { clsx } from "./clsx";

type Props = ComponentProps<"div"> & { tone?: "default" | "muted" };

export default function Tile({ className, tone = "default", ...rest }: Props) {
  return (
    <div
      className={clsx(
        "border border-border",
        tone === "default" ? "bg-panel" : "bg-panel/40",
        className
      )}
      {...rest}
    />
  );
}
