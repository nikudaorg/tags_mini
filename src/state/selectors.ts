import {
  access,
  emptySet,
  visibleAt,
  type Graph,
  type Item,
  type ItemId,
  type View,
} from '../domain';
import type { TagEditMode } from './store';

export const leftItemsOf = (graph: Graph, view: View): readonly Item[] =>
  view.kind === 'browse' ? visibleAt(access(graph), view, view.leftLevel) : [];

export const rightItemsOf = (graph: Graph, view: View): readonly Item[] =>
  view.kind === 'browse' ? visibleAt(access(graph), view, view.leftLevel - 1) : [];

export const editTargetsOf = (
  mode: TagEditMode,
  selection: ReadonlySet<ItemId>,
): readonly ItemId[] => (mode.bulk ? [...selection] : mode.frozenTargets);

// Effective tri-state of a left tag in tag-edit mode, pending overrides applied.
export const editStatusOf = (
  graph: Graph,
  mode: TagEditMode,
  targets: readonly ItemId[],
  tagId: ItemId,
): 'all' | 'some' | 'none' => {
  const override = mode.overrides.get(tagId);
  if (override === 'on') return 'all';
  if (override === 'off') return 'none';
  if (targets.length === 0) return 'none';
  let count = 0;
  for (const t of targets) if ((graph.taggersOf.get(t) ?? emptySet).has(tagId)) count++;
  return count === 0 ? 'none' : count === targets.length ? 'all' : 'some';
};

// Left rows in tag-edit mode: previously-shown tags plus hidden tags that tag
// at least one of the targets.
export const editLeftItemsOf = (
  graph: Graph,
  view: View,
  mode: TagEditMode,
  targets: readonly ItemId[],
): readonly Item[] => {
  if (view.kind !== 'browse') return [];
  const level = view.leftLevel;
  const wanted = new Set(mode.baseLeft);
  for (const t of targets) {
    for (const tagId of graph.taggersOf.get(t) ?? emptySet) {
      const tag = graph.items.get(tagId);
      if (tag !== undefined && tag.level === level) wanted.add(tagId);
    }
  }
  return (graph.byLevel.get(level) ?? []).filter((it) => wanted.has(it.id));
};
