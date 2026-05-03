// Parallel detection from eBay listing titles.
//
// Why this exists: CardSight ties every parallel sale (Silver Prizm, Red
// Pulsar, Mojo, etc.) to the BASE card's UUID. When you query
// `/pricing/{base_card_id}` you get the full mix back — base + every
// parallel under one card_id. Without parsing the title there's no way
// to tell a $1.25 base sale from a $30 Mojo sale, which makes the
// headline analytics misleading.
//
// This helper returns a parallel label (e.g. "Silver Prizm", "Red Pulsar",
// "Mojo", "Refractor") or `null` if the title looks like a true base sale.
//
// Limitations:
//   - Title parsing is heuristic. Titles vary by seller; some omit the
//     parallel name, others abbreviate. We only catch what's explicitly
//     written.
//   - The keyword list is Panini-Prizm / Topps-Chrome heavy because that's
//     90% of our current catalog. Adding new sets means adding keywords.
//   - We err on the side of "looks like a parallel" — a sale tagged "Base"
//     should be highly likely to be base. A sale tagged with a parallel
//     name might still be base if the seller mentioned the parallel set
//     elsewhere in the title.

const PARALLELS: Array<{ pattern: RegExp; label: string }> = [
  // High-value / numbered first so they win when multiple keywords match
  { pattern: /\bgold vinyl\b/i, label: "Gold Vinyl" },
  { pattern: /\bblack (label|prizm|refractor)?\b/i, label: "Black" },
  { pattern: /\bsuperfractor\b/i, label: "Superfractor" },
  { pattern: /\b1\/1\b|\b1 of 1\b|\bone of one\b/i, label: "1/1" },

  // Numbered parallels
  { pattern: /\bgold (prizm|refractor)?\b(?!\s*vinyl)/i, label: "Gold" },
  { pattern: /\bmojo\b/i, label: "Mojo" },
  { pattern: /\bgreen (pulsar|prizm|refractor)?\b/i, label: "Green" },
  { pattern: /\borange (pulsar|prizm|refractor)?\b/i, label: "Orange" },
  { pattern: /\bred (pulsar|prizm|refractor|wave)?\b/i, label: "Red" },
  { pattern: /\bblue (ice|prizm|refractor|wave)?\b/i, label: "Blue" },
  { pattern: /\bpurple (ice|prizm|refractor)?\b/i, label: "Purple" },
  { pattern: /\bpink (prizm|refractor)?\b/i, label: "Pink" },
  { pattern: /\bcamo (prizm)?\b/i, label: "Camo" },
  { pattern: /\bwhite sparkle\b/i, label: "White Sparkle" },
  { pattern: /\batomic refractor\b/i, label: "Atomic Refractor" },
  { pattern: /\bxfractor\b/i, label: "X-fractor" },
  { pattern: /\bshimmer\b/i, label: "Shimmer" },
  { pattern: /\bsilver (prizm|refractor|wave)?\b/i, label: "Silver" },
  { pattern: /\bpulsar\b/i, label: "Pulsar" },

  // Generic refractor catch-all (lowest priority among matchable)
  { pattern: /\brefractor\b/i, label: "Refractor" },
];

export type Parallel = { label: string; isBase: false } | { label: "Base"; isBase: true };

/** Detect the parallel from an eBay title. Returns "Base" for unmatched. */
export function detectParallel(title: string | null | undefined): Parallel {
  if (!title) return { label: "Base", isBase: true };
  for (const { pattern, label } of PARALLELS) {
    if (pattern.test(title)) return { label, isBase: false };
  }
  return { label: "Base", isBase: true };
}

/** Quick boolean — is this sale a base-card sale? */
export function isBaseSale(title: string | null | undefined): boolean {
  return detectParallel(title).isBase;
}
