import { query, mutation, internalMutation, type QueryCtx, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';

const linkPair = v.object({ tagId: v.id('items'), itemId: v.id('items') });

// Ownership is keyed on the Clerk identity's tokenIdentifier
// ("<issuer>|<clerk user id>"), the canonical stable id Convex derives from
// the validated JWT.
const getUserId = async (ctx: QueryCtx | MutationCtx): Promise<string | null> => {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.tokenIdentifier ?? null;
};

const requireUserId = async (ctx: QueryCtx | MutationCtx): Promise<string> => {
  const userId = await getUserId(ctx);
  if (userId === null) throw new Error('Not authenticated');
  return userId;
};

// Loads an item and checks it belongs to the caller; returns null for
// missing, foreign, or deleted-and-not-expected items rather than leaking
// which id belongs to someone else.
const ownedItem = async (
  ctx: QueryCtx | MutationCtx,
  userId: string,
  id: Id<'items'>,
): Promise<Doc<'items'> | null> => {
  const doc = await ctx.db.get(id);
  if (doc === null || doc.userId !== userId) return null;
  return doc;
};

// The whole graph in one subscription, scoped to the caller. Filtering and
// predicate evaluation happen client-side over this snapshot.
export const all = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (userId === null) return { items: [], links: [] };
    const items = await ctx.db
      .query('items')
      .withIndex('by_user_deleted', (q) => q.eq('userId', userId).eq('deleted', false))
      .collect();
    const links = await ctx.db
      .query('links')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
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
    const userId = await getUserId(ctx);
    if (userId === null) return null;
    const normalized = ctx.db.normalizeId('items', id);
    if (normalized === null) return null;
    const doc = await ownedItem(ctx, userId, normalized);
    if (doc === null || doc.deleted || doc.level !== 0) return null;
    return { id: doc._id, name: doc.name, text: doc.text ?? '' };
  },
});

export const createNote = mutation({
  args: { name: v.string(), text: v.string() },
  handler: async (ctx, { name, text }) => {
    const userId = await requireUserId(ctx);
    return ctx.db.insert('items', { userId, level: 0, name, text, deleted: false });
  },
});

export const createTag = mutation({
  args: { level: v.number(), name: v.string(), metadata: v.string() },
  handler: async (ctx, { level, name, metadata }) => {
    const userId = await requireUserId(ctx);
    if (!Number.isInteger(level) || level < 1) throw new Error(`invalid tag level ${level}`);
    return ctx.db.insert('items', { userId, level, name, metadata, deleted: false });
  },
});

// Soft-deletes the item and hard-deletes its links in both directions
// ("deleting a tag removes the tag from all items"). Returns the removed
// links so the client can build the inverse action.
export const remove = mutation({
  args: { id: v.id('items') },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const doc = await ownedItem(ctx, userId, id);
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
    const userId = await requireUserId(ctx);
    const doc = await ownedItem(ctx, userId, id);
    if (doc === null) return;
    await ctx.db.patch(id, { deleted: false });
    for (const pair of links) {
      const tag = await ownedItem(ctx, userId, pair.tagId);
      const item = await ownedItem(ctx, userId, pair.itemId);
      if (tag === null || item === null || tag.deleted || item.deleted) continue;
      await ctx.db.insert('links', { userId, ...pair });
    }
  },
});

// One transition for a whole tagging edit (single or bulk apply): removals
// and additions succeed together. Duplicate links are refused; level shape
// (tag.level === item.level + 1) is enforced here, not trusted from the UI.
export const applyLinks = mutation({
  args: { add: v.array(linkPair), remove: v.array(linkPair) },
  handler: async (ctx, { add, remove }) => {
    const userId = await requireUserId(ctx);
    for (const pair of remove) {
      const rows = await ctx.db
        .query('links')
        .withIndex('by_tag', (q) => q.eq('tagId', pair.tagId))
        .collect();
      for (const row of rows) {
        if (row.itemId === pair.itemId && row.userId === userId) await ctx.db.delete(row._id);
      }
    }
    for (const pair of add) {
      const tag = await ownedItem(ctx, userId, pair.tagId);
      const item = await ownedItem(ctx, userId, pair.itemId);
      if (tag === null || item === null || tag.deleted || item.deleted) continue;
      if (tag.level !== item.level + 1)
        throw new Error(`link level mismatch: tag ${tag.level} over item ${item.level}`);
      const existing = await ctx.db
        .query('links')
        .withIndex('by_tag', (q) => q.eq('tagId', pair.tagId))
        .collect();
      if (existing.some((l) => l.itemId === pair.itemId)) continue;
      await ctx.db.insert('links', { userId, ...pair });
    }
  },
});

export const setText = mutation({
  args: { id: v.id('items'), text: v.string() },
  handler: async (ctx, { id, text }) => {
    const userId = await requireUserId(ctx);
    const doc = await ownedItem(ctx, userId, id);
    if (doc === null) throw new Error('Not found');
    await ctx.db.patch(id, { text });
  },
});

export const setName = mutation({
  args: { id: v.id('items'), name: v.string() },
  handler: async (ctx, { id, name }) => {
    const userId = await requireUserId(ctx);
    const doc = await ownedItem(ctx, userId, id);
    if (doc === null) throw new Error('Not found');
    await ctx.db.patch(id, { name });
  },
});

export const setMetadata = mutation({
  args: { id: v.id('items'), metadata: v.string() },
  handler: async (ctx, { id, metadata }) => {
    const userId = await requireUserId(ctx);
    const doc = await ownedItem(ctx, userId, id);
    if (doc === null) throw new Error('Not found');
    await ctx.db.patch(id, { metadata });
  },
});

// One-off cleanup for rows that predate the current auth setup: rows with no
// userId at all, and rows owned by the old Convex Auth users table (those ids
// never contain '|', while Clerk tokenIdentifiers always do). Run once via
// `npx convex run items:claimOrphans '{"userId":"<issuer>|<clerk user id>"}'`
// (copy the tokenIdentifier from the userId of any row you create after
// signing in with Clerk, via the dashboard's `items` table). No-op once every
// row has a Clerk owner.
export const claimOrphans = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const legacy = (owner: string | undefined) => owner === undefined || !owner.includes('|');
    const items = await ctx.db.query('items').collect();
    let claimed = 0;
    for (const item of items) {
      if (legacy(item.userId)) {
        await ctx.db.patch(item._id, { userId });
        claimed++;
      }
    }
    const links = await ctx.db.query('links').collect();
    for (const link of links) {
      if (legacy(link.userId)) await ctx.db.patch(link._id, { userId });
    }
    return `claimed ${claimed} item(s)`;
  },
});
