// Hybrid parallel resolver - title parsing wins, CardSight name is fallback.
//
// Why this exists: CardSight's `parallel_name` is sometimes specific
// ("Pink Refractor", "Mojo Refractor") and sometimes a fuzzy umbrella
// category ("Rookie Color Run Gimmicks", "Hype") that groups multiple
// visually-distinct parallels under one label. The eBay listing title
// usually tells us the specific parallel the buyer was looking at -
// "Paul Skenes Green Refractor /99" is unambiguous even when CardSight's
// parallel_name says "Rookie Color Run Gimmicks".
//
// The previous title-only regex was flagged as inaccurate because it
// matched on color alone (e.g. "Red Bull Stadium" → tagged "Red"). This
// version is conservative: it only fires when a color is PAIRED with
// a known parallel-category keyword (refractor / prizm / wave / etc.).
// Two-word matches only.
//
// Resolution order:
//   1. Title contains a specific paired pattern → use that  (highest trust)
//   2. Title contains a known stand-alone keyword (Mojo, Sapphire,
//      Superfractor, X-fractor, Atomic) → use that
//   3. CardSight parallel_name is non-null AND not in the noisy bucket
//      → use it
//   4. CardSight parallel_name in the noisy bucket → use it but mark
//      `source: 'cardsight-generic'` so we can render it differently
//   5. Nothing matches → "Base"

const NOISY_CARDSIGHT_LABELS = new Set([
  "Rookie Color Run Gimmicks",
  "Hype",
  "Variations",
  "Inserts",
]);

// Color × category pairings. Each entry is (regex, normalized label).
// The regex requires both parts within a short window so we don't match
// "Red Stadium Refractor Subway Series" → "Red Refractor".
const COLOR_PARALLELS: Array<[RegExp, string]> = [
  // Refractors
  [/\bgreen[\s-]+refractor\b/i, "Green Refractor"],
  [/\bblue[\s-]+refractor\b/i, "Blue Refractor"],
  [/\bred[\s-]+refractor\b/i, "Red Refractor"],
  [/\bpink[\s-]+refractor\b/i, "Pink Refractor"],
  [/\borange[\s-]+refractor\b/i, "Orange Refractor"],
  [/\bpurple[\s-]+refractor\b/i, "Purple Refractor"],
  [/\bgold[\s-]+refractor\b/i, "Gold Refractor"],
  [/\bblack[\s-]+refractor\b/i, "Black Refractor"],
  [/\bsepia[\s-]+refractor\b/i, "Sepia Refractor"],
  [/\bnegative[\s-]+refractor\b/i, "Negative Refractor"],
  [/\baqua[\s-]+refractor\b/i, "Aqua Refractor"],
  [/\bteal[\s-]+refractor\b/i, "Teal Refractor"],
  [/\bmojo[\s-]+refractor\b/i, "Mojo Refractor"],
  [/\batomic[\s-]+refractor\b/i, "Atomic Refractor"],
  [/\bmini[\s-]*diamond[\s-]+refractor\b/i, "Mini-Diamond Refractor"],
  // Prizms
  [/\bsilver[\s-]+prizm\b/i, "Silver Prizm"],
  [/\bred[\s-]+prizm\b/i, "Red Prizm"],
  [/\bblue[\s-]+prizm\b/i, "Blue Prizm"],
  [/\bgreen[\s-]+prizm\b/i, "Green Prizm"],
  [/\bgold[\s-]+prizm\b/i, "Gold Prizm"],
  [/\bpink[\s-]+prizm\b/i, "Pink Prizm"],
  [/\bblack[\s-]+prizm\b/i, "Black Prizm"],
  [/\bcamo[\s-]+prizm\b/i, "Camo Prizm"],
  [/\bpink[\s-]+pulsar(?:[\s-]+prizm)?\b/i, "Pink Pulsar Prizm"],
  [/\bred[\s-]+pulsar(?:[\s-]+prizm)?\b/i, "Red Pulsar Prizm"],
  [/\borange[\s-]+pulsar(?:[\s-]+prizm)?\b/i, "Orange Pulsar Prizm"],
  [/\bgreen[\s-]+pulsar(?:[\s-]+prizm)?\b/i, "Green Pulsar Prizm"],
  // Waves / Ice / Other branded patterns
  [/\bblue[\s-]+wave\b/i, "Blue Wave"],
  [/\bred[\s-]+wave\b/i, "Red Wave"],
  [/\bblue[\s-]+ice\b/i, "Blue Ice"],
  [/\bpink[\s-]+ice\b/i, "Pink Ice"],
  [/\bpurple[\s-]+ice\b/i, "Purple Ice"],
  [/\bruby[\s-]+wave\b/i, "Ruby Wave"],
];

// Stand-alone keywords that don't need a color partner.
const STANDALONE_PARALLELS: Array<[RegExp, string]> = [
  [/\bsuperfractor\b/i, "Superfractor"],
  [/\bgold\s+vinyl\b/i, "Gold Vinyl"],
  [/\bx[\s-]?fractor\b/i, "X-Fractor"],
  [/\bsapphire\b/i, "Sapphire"],
  [/\bvintage\s+stock\b/i, "Vintage Stock"],
  [/\bnegative\b(?!\s+refractor)/i, "Negative"],
  [/\bblack\s+(?:label|prizm|refractor)\b/i, "Black"],
  [/\b1\/1\b|\b1\s+of\s+1\b/i, "1/1"],
];

export type ParallelResolution = {
  label: string;
  isBase: boolean;
  /** Where the label came from - useful for QA. Not exposed in normal UI. */
  source: "title" | "cardsight" | "cardsight-generic" | "inferred-base";
};

/** Try title-based resolution. Returns label or null. */
function fromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  for (const [re, label] of COLOR_PARALLELS) {
    if (re.test(title)) return label;
  }
  for (const [re, label] of STANDALONE_PARALLELS) {
    if (re.test(title)) return label;
  }
  return null;
}

/** Resolve a sale or active listing's parallel. Title parsing wins; CardSight's
 *  field is fallback; "Base" is the default. */
export function resolveParallel(args: {
  parallel_name: string | null | undefined;
  external_title: string | null | undefined;
}): ParallelResolution {
  const titleHit = fromTitle(args.external_title);
  if (titleHit) {
    return { label: titleHit, isBase: false, source: "title" };
  }
  if (args.parallel_name) {
    if (NOISY_CARDSIGHT_LABELS.has(args.parallel_name)) {
      return { label: args.parallel_name, isBase: false, source: "cardsight-generic" };
    }
    return { label: args.parallel_name, isBase: false, source: "cardsight" };
  }
  return { label: "Base", isBase: true, source: "inferred-base" };
}
