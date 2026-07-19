import { matches, termIds, type Token } from './predicate';
import { type GraphAccess, type Item, type ItemId } from './graph';

// Where the user is: the first screen (root index) or a two-pane browse window
// into the level chain. `topLevel` is where the chain was entered — everything
// at that level is visible; below it, each level is filtered by the predicate
// one level up. Left pane shows `leftLevel`, right pane `leftLevel - 1`.
export type Predicates = ReadonlyMap<number, readonly Token[]>;

export type BrowseView = {
  readonly kind: 'browse';
  readonly topLevel: number;
  readonly leftLevel: number;
  readonly predicates: Predicates;
};

export type View = { readonly kind: 'root' } | BrowseView;

export const rootView: View = { kind: 'root' };

export const predicateAt = (view: BrowseView, level: number): readonly Token[] =>
  view.predicates.get(level) ?? [];

export const visibleAt = (g: GraphAccess, view: BrowseView, level: number): readonly Item[] => {
  const bucket = g.itemsAt(level);
  if (level >= view.topLevel) return bucket;
  const tokens = predicateAt(view, level + 1);
  if (tokens.length === 0) return bucket;
  return bucket.filter((it) => matches(tokens, g.taggersOf(it.id)));
};

// The cascade rule: a predicate at level k may only use tags visible at level
// k. Walk top-down; dropping a predicate only widens visibility below, so one
// pass settles the chain. Terms pointing at deleted tags drop the predicate
// too (visibility of a nonexistent tag is false).
export const sanitize = (view: View, g: GraphAccess): View => {
  if (view.kind === 'root') return view;
  if (g.itemsAt(view.topLevel).length === 0) return rootView;
  const predicates = new Map<number, readonly Token[]>();
  let changed = false;
  for (const level of [...view.predicates.keys()].sort((a, b) => b - a)) {
    const tokens = view.predicates.get(level) ?? [];
    if (level > view.topLevel || level < 1 || tokens.length === 0) {
      changed = changed || tokens.length > 0;
      continue;
    }
    const scratch: BrowseView = { ...view, predicates };
    const visibleIds = new Set(visibleAt(g, scratch, level).map((it) => it.id));
    const usable = [...termIds(tokens)].every((id) => visibleIds.has(id as ItemId));
    if (usable) predicates.set(level, tokens);
    else changed = true;
  }
  const leftLevel = Math.min(Math.max(view.leftLevel, 1), view.topLevel);
  if (!changed && leftLevel === view.leftLevel) return view;
  return { kind: 'browse', topLevel: view.topLevel, leftLevel, predicates };
};

export const withPredicate = (view: BrowseView, level: number, tokens: readonly Token[]): BrowseView => {
  const predicates = new Map(view.predicates);
  if (tokens.length === 0) predicates.delete(level);
  else predicates.set(level, tokens);
  return { ...view, predicates };
};
