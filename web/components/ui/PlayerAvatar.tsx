// PlayerAvatar - circular placeholder used on the player detail header.
// Initials in saffron on a tinted-dark circle. When we have real headshots,
// this swaps to an <img>.

import { clsx } from "./clsx";

type Props = {
  player: string;
  src?: string | null;
  size?: number;
  className?: string;
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

export default function PlayerAvatar({
  player,
  src,
  size = 48,
  className,
}: Props) {
  if (src) {
    return (
      <img
        src={src}
        alt={player}
        width={size}
        height={size}
        className={clsx(
          "rounded-full object-cover bg-panel-2 shrink-0",
          className
        )}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={player}
      className={clsx(
        "rounded-full inline-flex items-center justify-center select-none shrink-0",
        "bg-gradient-to-br from-panel-2 to-panel border border-border-2",
        "text-accent font-mono uppercase tracking-tight",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
      }}
    >
      {initials(player) || "-"}
    </div>
  );
}
