/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

// convex-test derives tokenIdentifier as `${issuer}|${subject}`, which is
// what the functions key ownership on — distinct subjects, distinct owners.
const asUser = (t: ReturnType<typeof convexTest>, subject: string) =>
  t.withIdentity({ subject });

test('items and links are isolated per user', async () => {
  const t = convexTest(schema, modules);
  const asA = asUser(t, 'user_a');
  const asB = asUser(t, 'user_b');

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
  const asA = asUser(t, 'user_a');
  const asB = asUser(t, 'user_b');

  const tagA = await asA.mutation(api.items.createTag, { level: 1, name: 'tagA', metadata: '' });
  const noteB = await asB.mutation(api.items.createNote, { name: 'B note', text: '' });

  // B tries to tag their own note with A's tag id
  await asB.mutation(api.items.applyLinks, { add: [{ tagId: tagA, itemId: noteB }], remove: [] });

  const allB = await asB.query(api.items.all, {});
  expect(allB.links).toEqual([]);
});
