# Cardex — Design System

> Robinhood-aligned trading terminal applied to trading cards. Pure black backgrounds, bright neon up/down with triangle indicators, sparkline-per-ticker right rail, big portfolio-header numbers. Earned familiarity (every retail trader knows this layout) over distinction.

## Note on the impeccable critique

An earlier draft picked a "confident dark, properly done" direction that explicitly avoided the bright-green-on-black ticker aesthetic. That direction was correct by impeccable's anti-cliché rules but wrong for this user: Cardex is a tool the operator will use themselves, and replicating Robinhood's affordances cuts learning cost to zero. We accept the category-reflex "cost" and lean into it.

What we keep from the impeccable pass: state-driven motion only, no decorative cascades, full component-state vocabulary, OKLCH color values, empty states that teach, no em dashes in copy, density as affordance, predictable grids.

## Color strategy

**Restrained.** Tinted neutrals carry 90%+ of every surface; the accent appears for primary actions, current selection, and status indicators only. Up / down semantics are muted (we are not a Robinhood casino) and exist alongside, not as, the brand.

All values OKLCH. None are pure black or white — chroma 0.005–0.012 keeps neutrals breathing without becoming "tinted dark mode" parody.

```
--bg:           oklch(13% 0.006 250);   /* page background — cool neutral */
--panel:        oklch(16% 0.007 250);   /* one elevation up */
--panel-2:      oklch(19% 0.008 250);   /* hover / two-up */
--border:       oklch(24% 0.009 250);   /* default 1px border */
--border-2:     oklch(32% 0.012 250);   /* emphasis border (current selection, focus) */

--fg:           oklch(95% 0.005 250);   /* primary text */
--fg-2:         oklch(78% 0.005 250);   /* secondary text */
--muted:        oklch(60% 0.006 250);   /* tertiary, table chrome */
--muted-2:      oklch(45% 0.005 250);   /* quietest, disabled */

--accent:       oklch(80% 0.16 80);     /* saffron — single brand pop */
--accent-quiet: oklch(80% 0.16 80 / 0.12);  /* tinted background for selected rows */

--up:           oklch(70% 0.12 145);    /* gain — desaturated emerald */
--up-quiet:     oklch(40% 0.10 145 / 0.18);
--down:         oklch(65% 0.16 25);     /* loss — desaturated red-orange */
--down-quiet:   oklch(38% 0.14 25 / 0.18);
--warn:         oklch(75% 0.14 80);     /* parked at saffron for warnings */
--info:         oklch(70% 0.10 240);    /* sparingly: hyperlinks, raw-grade indicator */
```

**Accent budget:** ≤10% of any rendered surface. If a page looks "saffron-y" overall, we have over-spent it.

**Up / down rules:** color-coded sparingly. Never the only signal — always paired with a leading sign (+ / −) or arrow, so colorblind users and the page-as-a-whole never depend on hue.

## Typography

**One family for everything readable: Inter (variable).** One mono for tabular figures and identifiers: JetBrains Mono.

No display font. No serif. Product UIs don't earn the contrast.

Fixed rem scale (no `clamp`). Modular ratio 1.125 between steps:

```
text-xs:    11px   uppercase tracking, mono usually  (--font-mono)
text-sm:    13px   secondary copy, table chrome
text-base:  15px   body default
text-md:    17px   emphasized inline text
text-lg:    19px   section subhead
text-xl:    23px   page heading subtext
text-2xl:   30px   h1
```

Line height: `1.5` body, `1.2` headings. Tabular figures (`font-variant-numeric: tabular-nums`) on every number — no jiggling digits when they tick.

Letter-spacing for the "label" register only — `text-xs` set in mono, uppercase, with `0.08em` tracking. Used for table headers and section eyebrows. Nothing else.

## Spacing & rhythm

4 px grid (Tailwind default). Panel padding standard is `12 16` (3/4) — denser than typical SaaS. Section gaps `40 px` (`mb-10`) between major blocks; `12 px` between row siblings.

**Cards are not the default container.** Tables and bordered sections are. We use a card only when an item must be lifted from a list (rare on this product).

## Surfaces & shape

Borders, not shadows. Box-shadows almost never. Rounded corners disabled at `0` for data containers, `2 px` for inputs / buttons (a single anti-fatigue concession). Sticky top bar over `bg/85 backdrop-blur` is the ONE allowed glass usage.

## Motion

State-driven only. Nothing animates on page-load except the natural HTML render. No staggered cascades, no count-up tickers, no "intro choreography".

```
--dur-fast:   120 ms      /* micro-feedback (button press, color shift) */
--dur:        180 ms      /* standard hover / focus / disclosure */
--dur-med:    240 ms      /* drawer / modal entry */
--ease-out:   cubic-bezier(0.25, 1, 0.5, 1)   /* ease-out-quart, default */
--ease-in:    cubic-bezier(0.7, 0, 0.84, 0)   /* leave-only */
```

Only `transform` and `opacity` are animated. Never `width`, `height`, `top`, `left`. Accordions use `grid-template-rows: 0fr → 1fr`.

`prefers-reduced-motion: reduce` disables all transitions globally and replaces any motion-driven reveals with crossfades.

## Components

| Component | Notes |
|---|---|
| **Button** | One primary + one secondary + one ghost. All `h-8` (32 px). Primary: `bg-accent text-bg`. Secondary: `bg-panel-2 border-border`. Ghost: text-only with hover bg. |
| **Input** | `h-8`, panel-2 background, 1px border, `2 px` rounded. Focus ring is `2px` accent at low opacity, not glow. |
| **Table row** | Default text-sm. Header row in `text-xs` mono uppercase. Hover `bg-panel-2`. Selected `bg-accent-quiet`. Click target = whole row when navigation. |
| **Pill / badge** | `text-xs` mono uppercase, `px-1.5 py-0.5`, border + tinted bg. Used for RC, grade tier, source, etc. |
| **KPI strip (replacing tile template)** | Inline `text-sm` figures separated by `·`, in the page header subtitle. e.g. "3 watching · 413 sales · last sync 2m ago" |
| **Empty state** | Centered, max-w-md, with a *next action* — button to add cards, run a refresh, etc. Never "nothing here". |
| **Skeleton** | `bg-panel-2` block at the same dimensions as the eventual content; pulses opacity 0.6 → 0.9 at 1.4s ease-in-out. |

State vocabulary required on every interactive: `default · hover · focus · active · disabled · loading · error`. Missing any = unfinished.

## Anti-patterns (Cardex-specific, on top of impeccable's bans)

- **No big-number / small-label tiles** for KPIs. Inline status strip instead.
- **No emerald-on-black ticker aesthetic.** Up/down colors are desaturated; the brand accent is warm gold, not finance-screen green.
- **No row striping.** Hover is the differentiator, not zebra background.
- **No card images as decoration.** When we eventually render them, they're identity, not ornament. Today: no images, no placeholder ghosts.
- **No icons-by-default.** Every icon must replace text more efficiently than the text. Most can't, so most pages have none.

## File map

- Tokens live in `app/globals.css` (Tailwind v4 `@theme` block).
- Component primitives live in `components/ui/`.
- Mock data fixtures (MVP) live in `lib/mock.ts`.
