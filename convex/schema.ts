import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// One table for every item in the level hierarchy. level 0 = note (has text),
// level >= 1 = tag (has metadata). Items are soft-deleted so undo/redo can
// revive them under a stable id; links are hard rows keyed by the two ids.
export default defineSchema({
  items: defineTable({
    level: v.number(),
    name: v.string(),
    text: v.optional(v.string()),
    metadata: v.optional(v.string()),
    deleted: v.boolean(),
  }).index('by_deleted', ['deleted']),
  links: defineTable({
    tagId: v.id('items'), // tag at level n
    itemId: v.id('items'), // item at level n - 1
  })
    .index('by_tag', ['tagId'])
    .index('by_item', ['itemId']),
});
