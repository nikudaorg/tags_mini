import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';

const linkPair = v.object({ tagId: v.id('items'), itemId: v.id('items') });

// The whole graph in one subscription. The dataset is a personal corpus;
// filtering and predicate evaluation happen client-side over this snapshot.
export const all = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db
      .query('items')
      .withIndex('by_deleted', (q) => q.eq('deleted', false))
      .collect();
    const links = await ctx.db.query('links').collect();
    const alive = new Set(items.map((i) => i._id));
    return {
      items: items.map((i) => ({
        id: i._id,
        level: i.level,
        name: i.name,
        text: i.text ?? '',
        metadata: i.metadata ?? '',
      })),
      links: links
        .filter((l) => alive.has(l.tagId) && alive.has(l.itemId))
        .map((l) => ({ tagId: l.tagId, itemId: l.itemId })),
    };
  },
});

export const getNote = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const normalized = ctx.db.normalizeId('items', id);
    if (normalized === null) return null;
    const doc = await ctx.db.get(normalized);
    if (doc === null || doc.deleted || doc.level !== 0) return null;
    return { id: doc._id, name: doc.name, text: doc.text ?? '' };
  },
});

export const createNote = mutation({
  args: { name: v.string(), text: v.string() },
  handler: async (ctx, { name, text }) =>
    ctx.db.insert('items', { level: 0, name, text, deleted: false }),
});

export const createTag = mutation({
  args: { level: v.number(), name: v.string(), metadata: v.string() },
  handler: async (ctx, { level, name, metadata }) => {
    if (!Number.isInteger(level) || level < 1) throw new Error(`invalid tag level ${level}`);
    return ctx.db.insert('items', { level, name, metadata, deleted: false });
  },
});

// Soft-deletes the item and hard-deletes its links in both directions
// ("deleting a tag removes the tag from all items"). Returns the removed
// links so the client can build the inverse action.
export const remove = mutation({
  args: { id: v.id('items') },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (doc === null || doc.deleted) return { links: [] };
    await ctx.db.patch(id, { deleted: true });
    const asTag = await ctx.db
      .query('links')
      .withIndex('by_tag', (q) => q.eq('tagId', id))
      .collect();
    const asItem = await ctx.db
      .query('links')
      .withIndex('by_item', (q) => q.eq('itemId', id))
      .collect();
    const removed: Array<{ tagId: Id<'items'>; itemId: Id<'items'> }> = [];
    for (const l of [...asTag, ...asItem]) {
      removed.push({ tagId: l.tagId, itemId: l.itemId });
      await ctx.db.delete(l._id);
    }
    return { links: removed };
  },
});

export const restore = mutation({
  args: { id: v.id('items'), links: v.array(linkPair) },
  handler: async (ctx, { id, links }) => {
    await ctx.db.patch(id, { deleted: false });
    for (const pair of links) {
      const tag = await ctx.db.get(pair.tagId);
      const item = await ctx.db.get(pair.itemId);
      if (tag === null || item === null || tag.deleted || item.deleted) continue;
      await ctx.db.insert('links', pair);
    }
  },
});

// One transition for a whole tagging edit (single or bulk apply): removals
// and additions succeed together. Duplicate links are refused; level shape
// (tag.level === item.level + 1) is enforced here, not trusted from the UI.
export const applyLinks = mutation({
  args: { add: v.array(linkPair), remove: v.array(linkPair) },
  handler: async (ctx, { add, remove }) => {
    for (const pair of remove) {
      const rows = await ctx.db
        .query('links')
        .withIndex('by_tag', (q) => q.eq('tagId', pair.tagId))
        .collect();
      for (const row of rows) {
        if (row.itemId === pair.itemId) await ctx.db.delete(row._id);
      }
    }
    for (const pair of add) {
      const tag = await ctx.db.get(pair.tagId);
      const item = await ctx.db.get(pair.itemId);
      if (tag === null || item === null || tag.deleted || item.deleted) continue;
      if (tag.level !== item.level + 1)
        throw new Error(`link level mismatch: tag ${tag.level} over item ${item.level}`);
      const existing = await ctx.db
        .query('links')
        .withIndex('by_tag', (q) => q.eq('tagId', pair.tagId))
        .collect();
      if (existing.some((l) => l.itemId === pair.itemId)) continue;
      await ctx.db.insert('links', pair);
    }
  },
});

export const setText = mutation({
  args: { id: v.id('items'), text: v.string() },
  handler: async (ctx, { id, text }) => {
    await ctx.db.patch(id, { text });
  },
});

export const setName = mutation({
  args: { id: v.id('items'), name: v.string() },
  handler: async (ctx, { id, name }) => {
    await ctx.db.patch(id, { name });
  },
});

export const setMetadata = mutation({
  args: { id: v.id('items'), metadata: v.string() },
  handler: async (ctx, { id, metadata }) => {
    await ctx.db.patch(id, { metadata });
  },
});
