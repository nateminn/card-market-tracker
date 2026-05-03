// Tiny class-name joiner. Filters out false / null / undefined so you can write
//   clsx("base", isOpen && "open", maybeNull, "more")
// without having to mess about with template strings.
export function clsx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
