import type { Id } from '../../convex/_generated/dataModel';

export type ItemId = Id<'items'>;

export type Item = {
  readonly id: ItemId;
  readonly level: number;
  readonly name: string;
  readonly text: string;
  readonly metadata: string;
};

export type LinkPair = { readonly tagId: ItemId; readonly itemId: ItemId };

export type Graph = {
  readonly items: ReadonlyMap<ItemId, Item>;
  readonly byLevel: ReadonlyMap<number, readonly Item[]>;
  readonly taggersOf: ReadonlyMap<ItemId, ReadonlySet<ItemId>>;
  readonly targetsOf: ReadonlyMap<ItemId, ReadonlySet<ItemId>>;
  readonly maxLevel: number;
};

export const emptySet: ReadonlySet<ItemId> = new Set();

export const buildGraph = (data: {
  readonly items: readonly Item[];
  readonly links: readonly LinkPair[];
}): Graph => {
  const items = new Map<ItemId, Item>();
  const byLevel = new Map<number, Item[]>();
  let maxLevel = 0;
  for (const item of data.items) {
    items.set(item.id, item);
    const bucket = byLevel.get(item.level);
    if (bucket === undefined) byLevel.set(item.level, [item]);
    else bucket.push(item);
    if (item.level > maxLevel) maxLevel = item.level;
  }
  for (const bucket of byLevel.values()) {
    bucket.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }
  const taggersOf = new Map<ItemId, Set<ItemId>>();
  const targetsOf = new Map<ItemId, Set<ItemId>>();
  for (const { tagId, itemId } of data.links) {
    if (!items.has(tagId) || !items.has(itemId)) continue;
    (taggersOf.get(itemId) ?? taggersOf.set(itemId, new Set()).get(itemId)!).add(tagId);
    (targetsOf.get(tagId) ?? targetsOf.set(tagId, new Set()).get(tagId)!).add(itemId);
  }
  return { items, byLevel, taggersOf, targetsOf, maxLevel };
};

// The first screen: items nothing tags, sectioned by level ascending.
export const untaggedByLevel = (graph: Graph): ReadonlyMap<number, readonly Item[]> => {
  const out = new Map<number, readonly Item[]>();
  for (const [level, bucket] of [...graph.byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const roots = bucket.filter((it) => (graph.taggersOf.get(it.id) ?? emptySet).size === 0);
    if (roots.length > 0) out.set(level, roots);
  }
  return out;
};

// A read view over the graph that can exclude items (mid-delete) and apply a
// pending link patch (tag-edit preview) without rebuilding maps.
export type GraphAccess = {
  readonly itemsAt: (level: number) => readonly Item[];
  readonly taggersOf: (id: ItemId) => ReadonlySet<ItemId>;
};

export const access = (
  graph: Graph,
  opts?: {
    readonly excluded?: ReadonlySet<ItemId>;
    readonly patch?: { readonly add: readonly LinkPair[]; readonly remove: readonly LinkPair[] };
  },
): GraphAccess => {
  const excluded = opts?.excluded ?? emptySet;
  const patch = opts?.patch;
  return {
    itemsAt: (level) => {
      const bucket = graph.byLevel.get(level) ?? [];
      return excluded.size === 0 ? bucket : bucket.filter((it) => !excluded.has(it.id));
    },
    taggersOf: (id) => {
      const base = graph.taggersOf.get(id) ?? emptySet;
      if (excluded.size === 0 && patch === undefined) return base;
      const out = new Set(base);
      if (patch !== undefined) {
        for (const p of patch.remove) if (p.itemId === id) out.delete(p.tagId);
        for (const p of patch.add) if (p.itemId === id) out.add(p.tagId);
      }
      for (const ex of excluded) out.delete(ex);
      return out;
    },
  };
};
