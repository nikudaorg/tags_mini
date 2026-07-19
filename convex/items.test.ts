/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const asUser = (t: ReturnType<typeof convexTest>, userId: string) =>
  t.withIdentity({ subject: `${userId}|session` });

test('items and links are isolated per user', async () => {
  const t = convexTest(schema, modules);
  const userA = await t.run((ctx) => ctx.db.insert('users', {}));
  const userB = await t.run((ctx) => ctx.db.insert('users', {}));
  const asA = asUser(t, userA);
  const asB = asUser(t, userB);

  const noteA = await asA.mutation(api.items.createNote, { name: 'A note', text: 'secret A' });
  const noteB = await asB.mutation(api.items.createNote, { name: 'B note', text: 'secret B' });

  const allA = await asA.query(api.items.all, {});
  expect(allA.items.map((i) => i.id)).toEqual([noteA]);

  const allB = await asB.query(api.items.all, {});
  expect(allB.items.map((i) => i.id)).toEqual([noteB]);

  // reading another user's note is treated as not-found, not an error
  expect(await asB.query(api.items.getNote, { id: noteA })).toBeNull();

  // writing to another user's note is rejected
  await expect(
    asB.mutation(api.items.setText, { id: noteA, text: 'hacked' }),
  ).rejects.toThrow();

  // signed-out calls see nothing and can't write
  expect(await t.query(api.items.all, {})).toEqual({ items: [], links: [] });
  await expect(t.mutation(api.items.createNote, { name: 'x', text: 'y' })).rejects.toThrow();
});

test('links across two users cannot be created even with valid ids', async () => {
  const t = convexTest(schema, modules);
  const userA = await t.run((ctx) => ctx.db.insert('users', {}));
  const userB = await t.run((ctx) => ctx.db.insert('users', {}));
  const asA = asUser(t, userA);
  const asB = asUser(t, userB);

  const tagA = await asA.mutation(api.items.createTag, { level: 1, name: 'tagA', metadata: '' });
  const noteB = await asB.mutation(api.items.createNote, { name: 'B note', text: '' });

  // B tries to tag their own note with A's tag id
  await asB.mutation(api.items.applyLinks, { add: [{ tagId: tagA, itemId: noteB }], remove: [] });

  const allB = await asB.query(api.items.all, {});
  expect(allB.links).toEqual([]);
});
