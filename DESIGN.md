# Design

Mood: a lepidopterist's index drawer under gallery light — white, exact, quietly
instrumented. Light theme only-by-default is deliberate: the app is a daytime desk
instrument for reading dense rows of names; pure white maximizes row legibility and lets
the three semantic hues (berry primary, red operators, blue brackets) read as ink stamps
on paper.

## Color

Strategy: **Restrained** — pure white surface, one berry-rose primary, and a small fixed
semantic vocabulary. The formula bar is the only place color concentrates.

```css
:root {
  --bg: oklch(1 0 0);                     /* pure white, no hidden warmth */
  --surface: oklch(0.965 0.004 350);      /* panels, headers */
  --surface-2: oklch(0.93 0.006 350);     /* pressed / rails */
  --line: oklch(0.87 0.008 350);          /* hairlines */
  --ink: oklch(0.21 0.02 350);            /* body text, ≥7:1 on bg */
  --muted: oklch(0.47 0.02 350);          /* secondary text, ≥4.5:1 */
  --primary: oklch(0.45 0.163 350);       /* berry-rose: selection, primary actions */
  --primary-tint: oklch(0.95 0.03 350);   /* selection wash */
  --accent: oklch(0.38 0.13 275);         /* indigo: previously-hidden tag state, links */
  --op: oklch(0.5 0.2 27);                /* boolean operators — the spec'd red */
  --bracket: oklch(0.49 0.16 255);        /* brackets — the spec'd blue */
  --partial: oklch(0.88 0.09 80);         /* pale amber fill: tags-on-some (bulk mode) */
  --danger: oklch(0.5 0.2 27);
}
```

White text on `--primary` and `--accent` fills; dark ink on `--partial` (pale fill).

## Typography

One sans family for UI (`system-ui` stack), one mono for the algebra
(`ui-monospace` stack). Tag/note names and the formula render in mono — names are
operands; the mono is semantic, not costume. Fixed rem scale, ratio ≈1.125:
12 / 13 / 15 / 17 / 20px. No fluid type.

## Components

- **Item rows** (not cards, not chips): full-width list rows, 32px tall, mono name +
  muted meta + count. Selection = primary-tint background + 2px inset primary bar-free
  full border. Formula-membership = small berry dot before the name.
- **Tri-state tag rows** (tagging modes): unselected (plain), tagging & previously shown
  (primary fill, white text, ✓), tagging & previously hidden (accent fill, white text, ✓
  plus "hidden" tick label), on-some (partial amber fill, ink text, ◐ glyph).
- **Formula bar**: fixed at the bottom, mono 15px; operators uppercase in `--op`,
  brackets in `--bracket`, terms in ink. Pending operator shown dimmed at the end.
- **Dialogs**: native `<dialog>`, 360px, hairline border, no backdrop blur.
- **Buttons**: 28px height, 6px radius; primary = filled berry, others = hairline ghost.

## Motion

150–200ms `cubic-bezier(0.22, 1, 0.36, 1)` on background/color state changes and dialog
fade-in only. No entrance choreography. `prefers-reduced-motion: reduce` → transitions
0ms.

## Layout

App shell: 44px top bar (wordmark, level breadcrumb, undo/redo, create buttons) →
two-pane split (left pane 44%, hairline divider, right pane 56%) → 44px formula bar.
Below 840px the panes stack vertically (left above right); the formula bar stays fixed.
