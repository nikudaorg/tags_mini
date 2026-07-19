import { internalMutation } from './_generated/server';

// Dev utility: `npx convex run seed:demo` fills an empty deployment with a
// small corpus for trying the predicate flows. No-op if data already exists.
export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query('items')
      .withIndex('by_deleted', (q) => q.eq('deleted', false))
      .collect();
    if (existing.length > 1) return 'already seeded';

    const tag = (level: number, name: string, metadata = '') =>
      ctx.db.insert('items', { level, name, metadata, deleted: false });
    const note = (name: string, text: string) =>
      ctx.db.insert('items', { level: 0, name, text, deleted: false });

    const projects = await tag(1, 'projects', 'active workstreams');
    const reading = await tag(1, 'reading', '');
    const cooking = await tag(1, 'cooking', '');
    const travel = await tag(1, 'travel', '');
    const done = await tag(1, 'done', 'finished things');
    const work = await tag(2, 'work', '');
    const personal = await tag(2, 'personal', '');

    const migration = await note(
      'Convex migration plan',
      'Move the sync layer to Convex components.\n\n1. Schema first\n2. Then the mutations',
    );
    const readingList = await note('Reading list 2026', 'Piranesi, The Maniac, Exhalation');
    const gricia = await note(
      'Pasta alla gricia',
      'Guanciale, pecorino, black pepper, rigatoni. No garlic, no onion, no cream.',
    );
    const kyoto = await note('Kyoto packing list', 'Rail pass, camera, one good jacket');
    const review = await note('Quarterly review', 'Ship the migration, close the beta');
    const dune = await note('Dune notes', 'Fear is the mind-killer.');
    await note('Scratch', 'Unfiled thoughts land here.');

    const link = (tagId: typeof projects, itemId: typeof migration) =>
      ctx.db.insert('links', { tagId, itemId });

    await link(work, projects);
    await link(personal, reading);
    await link(personal, cooking);
    await link(personal, travel);

    await link(projects, migration);
    await link(projects, review);
    await link(reading, readingList);
    await link(reading, dune);
    await link(cooking, gricia);
    await link(travel, kyoto);
    await link(done, gricia);
    await link(done, review);
    await link(done, dune);
    return 'seeded';
  },
});
