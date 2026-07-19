import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';
import { v } from 'convex/values';

// One table for every item in the level hierarchy. level 0 = note (has text),
// level >= 1 = tag (has metadata). Items are soft-deleted so undo/redo can
// revive them under a stable id; links are hard rows keyed by the two ids.
// userId is optional so pre-auth rows (if any) stay valid under this schema;
// they're simply invisible — every query filters by the caller's userId.
export default defineSchema({
  ...authTables,
  items: defineTable({
    userId: v.optional(v.id('users')),
    level: v.number(),
    name: v.string(),
    text: v.optional(v.string()),
    metadata: v.optional(v.string()),
    deleted: v.boolean(),
  }).index('by_user_deleted', ['userId', 'deleted']),
  links: defineTable({
    userId: v.optional(v.id('users')),
    tagId: v.id('items'), // tag at level n
    itemId: v.id('items'), // item at level n - 1
  })
    .index('by_user', ['userId'])
    .index('by_tag', ['tagId'])
    .index('by_item', ['itemId']),
});
