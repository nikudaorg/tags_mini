# Strata

A notes app whose access model is relational filtering: level-1 tags tag notes, level-2
tags tag level-1 tags, and so on. You reach notes by composing boolean formulas over
tags, level by level. Every action — predicate edits, navigation, tagging, creation,
deletion — is undoable within a session.

Built with React + Vite + TypeScript on [Convex](https://convex.dev); deploys to Vercel.

## The mechanism

- **Two panes.** The left pane shows level-*n* tags, the right pane level *n−1*. A
  formula over the left tags decides what the right pane shows; an empty formula shows
  everything.
- **Formula entry.** Click a tag, press `o` (OR), `a` (AND), or `n` (NOT), click the
  next tag, continue. Entry precedence is NOT > AND > OR; the bar at the bottom shows
  the result with explicit brackets (operators red, brackets blue):
  `A o B a C a n A` → `A OR (B AND C AND (NOT A))`.
- **Formula editing.** Click anywhere in the formula to place a caret (`←`/`→` move
  it). `⌫` removes the unit at the caret — a term takes its NOT prefix and the operator
  that bound it (its tighter-binding neighbor) along. The same `o`/`a`/`n` + tag-click
  gestures insert at the caret; an operator that can't stand alone yet waits dimmed at
  the caret and lands together with the next tag you click. `esc` puts the bar back in
  append mode. Each edit is one undo step.
- **Navigation.** Clicking a tag on the right drills in (that pane becomes the left
  one). `←`/`→` move the window between levels. If narrowing an upper formula hides
  tags a lower formula uses, the lower formula is removed — undoably.
- **First screen.** The Index lists everything not tagged by anything, sectioned by
  level, lowest first.
- **Notes.** Double-click (or `Enter`) opens a note in its own tab — an edit-only view
  with autosave; undo/redo there is the textarea's own. `⌘V` on the notes screen turns
  your clipboard into a new note after asking for a name.
- **Tagging.** With one item selected, *Add/remove tags* turns the left pane into a
  toggle list: berry = tagging & previously shown, indigo = tagging & previously
  hidden. *Bulk tag* does the same for a multi-selection, with amber = on some (a click
  adds it to all). Apply commits the whole edit as one undoable transition.
- **Selection.** Click, ⌘-click, shift-click, `↑`/`↓` (+shift), ⌘A, or a mouse
  rectangle. `Delete` removes the selection; deleting a tag detaches it everywhere.
  Everything reverses with `⌘Z` / `⇧⌘Z`.

## Development

```sh
pnpm install
pnpm dev:backend   # convex dev (creates .env.local; anonymous local mode works)
pnpm dev           # vite on http://localhost:5173
```

Every account gets its own notes and tags — sign in with Google to use the app. That
needs a Google OAuth client:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create
   an OAuth 2.0 Client ID (Web application). Authorized redirect URI:
   `<your Convex deployment's HTTP Actions URL>/api/auth/callback/google` — find that
   URL as `VITE_CONVEX_SITE_URL` in `.env.local` after running `pnpm dev:backend` once.
2. `npx convex env set AUTH_GOOGLE_ID <client id>`
3. `npx convex env set AUTH_GOOGLE_SECRET <client secret>`

Optional demo data for your account: find your `users._id` in the Convex dashboard after
signing in once, then `npx convex run seed:demo '{"userId":"<that id>"}'`.

Tests and checks: `pnpm test` (predicate parser/renderer/evaluator), `pnpm typecheck`,
`pnpm build`.

## Deploying (Vercel + Convex)

1. `npx convex login`, then `npx convex deploy` — creates the production deployment and
   prints its URL.
2. Repeat the Google OAuth setup above against production: a redirect URI for the prod
   `VITE_CONVEX_SITE_URL`, then `npx convex env set AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET
   <value> --prod`.
3. On Vercel, import this repo. Build command:
   `npx convex deploy --cmd 'pnpm build'` (this sets `VITE_CONVEX_URL` for the build),
   output directory `dist`. Add `CONVEX_DEPLOY_KEY` (from the Convex dashboard) as an
   environment variable.
4. `vercel.json` already rewrites all routes to `index.html` so `/note/:id` links work.

## Architecture notes

- `convex/schema.ts` — one `items` table for notes and tags (soft-deleted so undo can
  revive stable ids) and a `links` table for tag→item edges (level shape enforced in
  `applyLinks`), plus the Convex Auth tables. Every `items`/`links` row carries a
  `userId`; every query and mutation in `convex/items.ts` filters or checks ownership by
  the caller's `ctx.auth` identity, so accounts never see each other's data.
- `src/domain/` — pure predicate algebra (token stream → AST → render/eval) and the
  visibility/cascade rules. Unit-tested.
- `src/state/` — a small hand-rolled store: view state, selection, tag-edit modes, and
  an undo manager whose entries pair view snapshots with compensating Convex mutations.
- `src/ui/` — React components; no router dependency (the note editor tab is a
  path-matched second surface).
