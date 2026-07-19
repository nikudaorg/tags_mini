# Product

## Register

product

## Platform

web

## Users

A single knowledge-keeper — a researcher, writer, or engineer — organizing a personal
corpus of notes with a strict hierarchy of tags: level-1 tags tag notes, level-2 tags tag
level-1 tags, and so on. They are keyboard-fluent, comfortable with boolean algebra, and
use the app in long focused sessions at a desk. (The user delegated product definition;
this profile is inferred from the mechanism itself, which assumes fluency with predicates
and keybindings.)

## Product Purpose

Strata is a notes app whose entire access model is relational filtering: you never browse
folders, you compose boolean predicates over tags, level by level, until you reach the
notes. Success is reaching any note through a formula in seconds, restructuring tags
without fear (every action is undoable within a session), and never losing the thread of
where you are in the level chain.

## Positioning

The only notes app where navigation *is* a boolean formula — filtering, tagging, and
moving between tag levels are one continuous keyboard gesture.

## Brand Personality

Precise, quiet, instrumental. The interface is a lab instrument: it shows its state
exactly (the formula is always visible, verbatim), reacts instantly, and never decorates.
Emotionally it should evoke calm command — the feeling of an expert tool that trusts you.

## Anti-references

- Notion-style friendly-soft aesthetics: no greys-on-cream, no emoji-first rows, no
  hover-toolbars appearing everywhere.
- Terminal-cosplay dark hacker UI: monospace-everything, glow, and scanlines would be
  costume, not instrument.
- Tag-cloud whimsy: tags here are operands in algebra, not decorative pills in six
  pastel colors.

## Design Principles

1. **The formula is the ground truth.** The predicate is rendered verbatim, always
   visible, exactly as it evaluates. Nothing is summarized or paraphrased.
2. **Every action reverses.** Undo/redo covers data and navigation alike; destructive
   actions need no confirmation dialogs because reversal is total (within a session).
3. **Keyboard first, mouse equal.** Every core gesture (select, operator, level move,
   selection) has both a key and a pointer path.
4. **State is worn on the surface.** Selection origin (shown vs. previously hidden),
   partial tagging, pending operators — each has one unambiguous visual encoding.
5. **Density over ceremony.** No onboarding choreography, no decorative motion; 150–250ms
   state transitions only.

## Accessibility & Inclusion

Target WCAG 2.1 AA: body text ≥ 4.5:1, focus-visible on every interactive element, full
keyboard operability, `prefers-reduced-motion` honored, color encodings doubled with a
non-color cue (icon, underline, or label) for the tri-state tag colors.
