import { useSyncExternalStore } from 'react';
import type { ConvexReactClient } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  access,
  buildGraph,
  deleteUnit,
  emptySet,
  insertToken,
  isValidStream,
  matches,
  nextExpected,
  predicateAt,
  rootView,
  sanitize,
  visibleAt,
  withPredicate,
  type BinaryOp,
  type Graph,
  type Item,
  type ItemId,
  type LinkPair,
  type Token,
  type View,
} from '../domain';
import { editStatusOf, editTargetsOf, leftItemsOf, rightItemsOf } from './selectors';

// Tag-edit mode ("add/remove tag" for one item, or bulk for many). `baseLeft`
// freezes which left-pane tags were visible at entry — that is what separates
// the "previously shown" and "previously hidden" colors. `overrides` are the
// pending toggles, committed as one transition on Apply.
export type TagEditMode = {
  readonly kind: 'tagEdit';
  readonly bulk: boolean;
  readonly frozenTargets: readonly ItemId[]; // single mode; bulk follows live selection
  readonly baseLeft: ReadonlySet<ItemId>;
  readonly overrides: ReadonlyMap<ItemId, 'on' | 'off'>;
};

export type Mode = { readonly kind: 'normal' } | TagEditMode;

export type DialogState =
  | { readonly kind: 'none' }
  | { readonly kind: 'createNote'; readonly initialText: string; readonly fromPaste: boolean }
  | { readonly kind: 'createTag'; readonly level: number };

export type AppState = {
  readonly view: View;
  readonly mode: Mode;
  readonly selection: ReadonlySet<ItemId>;
  readonly cursor: ItemId | null;
  readonly anchor: ItemId | null;
  // caret position in the left level's token stream; null = appending at the end
  readonly formulaCursor: number | null;
  // operators typed at the caret, waiting for a term to insert atomically
  readonly formulaPending: readonly Token[];
  readonly dialog: DialogState;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hint: string | null;
  readonly graphVersion: number;
};

type UndoEntry = {
  readonly label: string;
  readonly undo: () => Promise<void>;
  readonly redo: () => Promise<void>;
};

export type Store = ReturnType<typeof createStore>;

export const createStore = (client: ConvexReactClient) => {
  let graph: Graph = buildGraph({ items: [], links: [] });
  let state: AppState = {
    view: rootView,
    mode: { kind: 'normal' },
    selection: emptySet,
    cursor: null,
    anchor: null,
    formulaCursor: null,
    formulaPending: [],
    dialog: { kind: 'none' },
    canUndo: false,
    canRedo: false,
    hint: null,
    graphVersion: 0,
  };
  const listeners = new Set<() => void>();
  const undoStack: UndoEntry[] = [];
  const redoStack: UndoEntry[] = [];
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let historyBusy = false;

  const emit = () => listeners.forEach((l) => l());
  const set = (patch: Partial<AppState>) => {
    state = {
      ...state,
      ...patch,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    };
    emit();
  };

  const flashHint = (hint: string) => {
    if (hintTimer !== undefined) clearTimeout(hintTimer);
    set({ hint });
    hintTimer = setTimeout(() => set({ hint: null }), 1800);
  };

  const push = (entry: UndoEntry) => {
    undoStack.push(entry);
    redoStack.length = 0;
  };

  // ---- derived reads shared with the UI via pure selectors ----

  const leftItems = (): readonly Item[] => leftItemsOf(graph, state.view);
  const rightItems = (): readonly Item[] => rightItemsOf(graph, state.view);
  const editTargets = (mode: TagEditMode): readonly ItemId[] =>
    editTargetsOf(mode, state.selection);
  const editStatus = (mode: TagEditMode, tagId: ItemId): 'all' | 'some' | 'none' =>
    editStatusOf(graph, mode, editTargets(mode), tagId);

  // ---- view transitions (all undoable via snapshots) ----

  const commitView = (label: string, next: View, nextFormulaCursor: number | null = null) => {
    const prev = state.view;
    const sanitized = sanitize(next, access(graph));
    if (sanitized === prev) {
      if (nextFormulaCursor !== state.formulaCursor) set({ formulaCursor: nextFormulaCursor });
      return;
    }
    const clear = {
      selection: emptySet,
      cursor: null,
      anchor: null,
      formulaCursor: null,
      formulaPending: [] as readonly Token[],
    };
    push({
      label,
      undo: async () => set({ view: prev, ...clear }),
      redo: async () => set({ view: sanitized, ...clear }),
    });
    set({ view: sanitized, ...clear, formulaCursor: nextFormulaCursor });
  };

  const editTokens = (
    label: string,
    mutate: (tokens: readonly Token[]) => readonly Token[],
    nextFormulaCursor: number | null = null,
  ) => {
    if (state.view.kind !== 'browse' || state.mode.kind !== 'normal') return;
    const level = state.view.leftLevel;
    const tokens = mutate(predicateAt(state.view, level));
    commitView(label, withPredicate(state.view, level, tokens), nextFormulaCursor);
  };

  // Caret clamped to the current stream; the stream shrinks under undo.
  const clampedCursor = (): number | null => {
    if (state.formulaCursor === null || state.view.kind !== 'browse') return null;
    const len = predicateAt(state.view, state.view.leftLevel).length;
    return Math.max(0, Math.min(state.formulaCursor, len));
  };

  // An operator typed at the caret that can't insert directly buffers until a
  // term arrives, then the whole run inserts atomically. Buffer only shapes a
  // term could complete (probed with a placeholder term).
  const bufferPending = (
    tokens: readonly Token[],
    at: number,
    token: Token,
    hint: string,
  ) => {
    const candidate: readonly Token[] = [...state.formulaPending, token];
    const probe = [
      ...tokens.slice(0, at),
      ...candidate,
      { kind: 'term', tagId: 'probe' } as Token,
      ...tokens.slice(at),
    ];
    if (!isValidStream(probe)) {
      flashHint(hint);
      return;
    }
    set({ formulaPending: candidate });
  };

  // ---- data transitions ----

  const runCreate = async (
    label: string,
    level: number,
    name: string,
    create: () => Promise<ItemId>,
  ): Promise<ItemId> => {
    const id = await create();
    push({
      label,
      undo: async () => {
        await client.mutation(api.items.remove, { id });
      },
      redo: async () => {
        await client.mutation(api.items.restore, { id, links: [] });
      },
    });
    set({});
    // A new item starts untagged; if the current window can't show it, say so.
    const v = state.view;
    if (v.kind === 'browse') {
      const shownLevels = [v.leftLevel, v.leftLevel - 1];
      const governs = (lvl: number): readonly Token[] =>
        lvl >= v.topLevel ? [] : predicateAt(v, lvl + 1);
      const visibleNow = shownLevels.includes(level) && matches(governs(level), emptySet);
      if (!visibleNow)
        flashHint(`Created “${name}” — it's outside the current formula. Find it on the Index.`);
    }
    return id;
  };

  const actions = {
    // -- root screen --
    openFromRoot: (item: Item) => {
      if (item.level === 0) return;
      commitView('open tag', {
        kind: 'browse',
        topLevel: item.level,
        leftLevel: item.level,
        predicates: new Map([[item.level, [{ kind: 'term', tagId: item.id } as Token]]]),
      });
    },
    browseAllNotes: () => {
      if (graph.byLevel.get(1) === undefined) {
        flashHint('Create a level-1 tag first — notes are reached through tags');
        return;
      }
      commitView('browse notes', {
        kind: 'browse',
        topLevel: 1,
        leftLevel: 1,
        predicates: new Map(),
      });
    },
    goRoot: () => commitView('to index', rootView),

    // -- level navigation (arrows) --
    goUp: () => {
      if (state.view.kind !== 'browse' || state.mode.kind !== 'normal') return;
      const next = state.view.leftLevel + 1;
      if (state.view.leftLevel < state.view.topLevel) {
        commitView('level up', { ...state.view, leftLevel: next });
      } else if ((graph.byLevel.get(next) ?? []).length > 0) {
        // raise the top of the chain: the new left level shows all its tags
        commitView('level up', {
          kind: 'browse',
          topLevel: next,
          leftLevel: next,
          predicates: state.view.predicates,
        });
      } else {
        commitView('to index', rootView);
      }
    },
    goDown: () => {
      if (state.view.kind !== 'browse' || state.mode.kind !== 'normal') return;
      if (state.view.leftLevel > 1)
        commitView('level down', { ...state.view, leftLevel: state.view.leftLevel - 1 });
    },

    // -- predicate entry (at the caret when one is placed, else appending) --
    pickTerm: (tagId: ItemId) => {
      if (state.view.kind !== 'browse' || state.mode.kind !== 'normal') return;
      const tokens = predicateAt(state.view, state.view.leftLevel);
      const at = clampedCursor();
      if (at === null) {
        if (nextExpected(tokens) !== 'term') {
          flashHint('Press o (OR), a (AND) or n (NOT) before the next tag');
          return;
        }
        editTokens('add term', (t) => [...t, { kind: 'term', tagId }]);
        return;
      }
      const seq: Token[] = [...state.formulaPending, { kind: 'term', tagId }];
      const next = [...tokens.slice(0, at), ...seq, ...tokens.slice(at)];
      if (!isValidStream(next)) {
        flashHint('Two tags need an operator between them — press o, a or n first');
        return;
      }
      editTokens('add term', () => next, at + seq.length);
    },
    pressOperator: (op: BinaryOp) => {
      if (state.view.kind !== 'browse' || state.mode.kind !== 'normal') return;
      const tokens = predicateAt(state.view, state.view.leftLevel);
      const at = clampedCursor();
      if (at === null) {
        if (nextExpected(tokens) !== 'operator') {
          flashHint('Select a tag first, then press o / a');
          return;
        }
        editTokens(op, (t) => [...t, { kind: 'op', op }]);
        return;
      }
      if (state.formulaPending.length === 0) {
        const edit = insertToken(tokens, at, { kind: 'op', op });
        if (edit !== null) {
          editTokens(op, () => edit.tokens, edit.cursor);
          return;
        }
      }
      bufferPending(tokens, at, { kind: 'op', op }, 'An operator goes right after a tag');
    },
    pressNot: () => {
      if (state.view.kind !== 'browse' || state.mode.kind !== 'normal') return;
      const tokens = predicateAt(state.view, state.view.leftLevel);
      const at = clampedCursor();
      if (at === null) {
        if (nextExpected(tokens) !== 'term') {
          flashHint('NOT goes before a tag — press o / a first');
          return;
        }
        editTokens('not', (t) => [...t, { kind: 'not' }]);
        return;
      }
      if (state.formulaPending.length === 0) {
        const edit = insertToken(tokens, at, { kind: 'not' });
        if (edit !== null) {
          editTokens('not', () => edit.tokens, edit.cursor);
          return;
        }
      }
      bufferPending(tokens, at, { kind: 'not' }, 'NOT goes before a tag, not after one');
    },
    clearPredicate: () => editTokens('clear predicate', () => []),

    // -- formula caret --
    setFormulaCursor: (at: number | null) => {
      if (at === null) {
        set({ formulaCursor: null, formulaPending: [] });
        return;
      }
      if (state.view.kind !== 'browse' || state.mode.kind !== 'normal') return;
      const len = predicateAt(state.view, state.view.leftLevel).length;
      set({ formulaCursor: Math.max(0, Math.min(at, len)), formulaPending: [] });
    },
    moveFormulaCursor: (delta: -1 | 1) => {
      const at = clampedCursor();
      if (at === null || state.view.kind !== 'browse') return;
      const len = predicateAt(state.view, state.view.leftLevel).length;
      set({ formulaCursor: Math.max(0, Math.min(at + delta, len)), formulaPending: [] });
    },
    deleteAtFormulaCursor: (dir: 'back' | 'forward') => {
      if (state.view.kind !== 'browse' || state.mode.kind !== 'normal') return;
      const at = clampedCursor();
      if (at === null) return;
      if (state.formulaPending.length > 0) {
        if (dir === 'back') set({ formulaPending: state.formulaPending.slice(0, -1) });
        return;
      }
      const tokens = predicateAt(state.view, state.view.leftLevel);
      const edit = deleteUnit(tokens, at, dir);
      if (edit === null) return;
      editTokens('remove from formula', () => edit.tokens, edit.cursor);
    },

    // Pressing a tag on the right (n > 0): that pane becomes the left one; if
    // its predicate is empty the pressed tag becomes the first term.
    promoteRight: (tagId: ItemId) => {
      if (state.view.kind !== 'browse' || state.mode.kind !== 'normal') return;
      const level = state.view.leftLevel - 1;
      if (level < 1) return;
      const tokens = predicateAt(state.view, level);
      const next =
        tokens.length === 0
          ? withPredicate({ ...state.view, leftLevel: level }, level, [{ kind: 'term', tagId }])
          : { ...state.view, leftLevel: level };
      commitView('open tag', next);
    },

    // -- right-pane selection --
    selectOnly: (id: ItemId) => set({ selection: new Set([id]), cursor: id, anchor: id }),
    toggleSelect: (id: ItemId) => {
      const selection = new Set(state.selection);
      if (selection.has(id)) selection.delete(id);
      else selection.add(id);
      set({ selection, cursor: id, anchor: id });
    },
    rangeSelectTo: (id: ItemId) => {
      const items = rightItems();
      const from = items.findIndex((it) => it.id === (state.anchor ?? id));
      const to = items.findIndex((it) => it.id === id);
      if (from === -1 || to === -1) return actions.selectOnly(id);
      const [lo, hi] = from < to ? [from, to] : [to, from];
      set({ selection: new Set(items.slice(lo, hi + 1).map((it) => it.id)), cursor: id });
    },
    setSelection: (ids: readonly ItemId[], additive: boolean) => {
      const selection = additive ? new Set([...state.selection, ...ids]) : new Set(ids);
      set({ selection, cursor: ids[ids.length - 1] ?? state.cursor });
    },
    selectAll: () => {
      const items = rightItems();
      set({ selection: new Set(items.map((it) => it.id)) });
    },
    clearSelection: () => set({ selection: emptySet, cursor: null, anchor: null }),
    moveCursor: (delta: -1 | 1, extend: boolean) => {
      const items = rightItems();
      if (items.length === 0) return;
      const idx = items.findIndex((it) => it.id === state.cursor);
      const next = items[Math.min(Math.max(idx + delta, 0), items.length - 1)];
      if (next === undefined) return;
      if (extend && state.anchor !== null) {
        set({ cursor: next.id });
        actions.rangeSelectTo(next.id);
      } else {
        set({ selection: new Set([next.id]), cursor: next.id, anchor: next.id });
      }
    },

    // -- creation --
    openCreateNote: (initialText: string, fromPaste: boolean) =>
      set({ dialog: { kind: 'createNote', initialText, fromPaste } }),
    openCreateTag: (level: number) => set({ dialog: { kind: 'createTag', level } }),
    closeDialog: () => set({ dialog: { kind: 'none' } }),
    createNote: async (name: string, text: string) => {
      set({ dialog: { kind: 'none' } });
      await runCreate('create note', 0, name, () =>
        client.mutation(api.items.createNote, { name, text }),
      );
    },
    createTag: async (name: string, level: number, metadata: string) => {
      set({ dialog: { kind: 'none' } });
      await runCreate('create tag', level, name, () =>
        client.mutation(api.items.createTag, { name, level, metadata }),
      );
    },

    // -- rename / metadata (inspector) --
    rename: async (id: ItemId, name: string) => {
      const prev = graph.items.get(id)?.name;
      if (prev === undefined || prev === name) return;
      await client.mutation(api.items.setName, { id, name });
      push({
        label: 'rename',
        undo: async () => {
          await client.mutation(api.items.setName, { id, name: prev });
        },
        redo: async () => {
          await client.mutation(api.items.setName, { id, name });
        },
      });
      set({});
    },
    setMetadata: async (id: ItemId, metadata: string) => {
      const prev = graph.items.get(id)?.metadata;
      if (prev === undefined || prev === metadata) return;
      await client.mutation(api.items.setMetadata, { id, metadata });
      push({
        label: 'edit metadata',
        undo: async () => {
          await client.mutation(api.items.setMetadata, { id, metadata: prev });
        },
        redo: async () => {
          await client.mutation(api.items.setMetadata, { id, metadata });
        },
      });
      set({});
    },

    // -- deletion (right-pane selection) --
    deleteSelected: async () => {
      if (state.mode.kind !== 'normal' || state.selection.size === 0) return;
      const ids = [...state.selection];
      const prevView = state.view;
      const nextView = sanitize(prevView, access(graph, { excluded: new Set(ids) }));
      const removed: Array<{ id: ItemId; links: readonly LinkPair[] }> = [];
      for (const id of ids) {
        const { links } = await client.mutation(api.items.remove, { id });
        removed.push({ id, links });
      }
      push({
        label: 'delete',
        undo: async () => {
          for (const r of [...removed].reverse())
            await client.mutation(api.items.restore, { id: r.id, links: [...r.links] });
          set({ view: prevView, selection: new Set(ids), cursor: null, anchor: null });
        },
        redo: async () => {
          for (const r of removed) await client.mutation(api.items.remove, { id: r.id });
          set({ view: nextView, selection: emptySet, cursor: null, anchor: null });
        },
      });
      set({ view: nextView, selection: emptySet, cursor: null, anchor: null });
    },

    // -- tag-edit modes --
    startTagEdit: (bulk: boolean) => {
      if (state.view.kind !== 'browse' || state.mode.kind !== 'normal') return;
      if (!bulk && state.selection.size !== 1) return;
      const baseLeft = new Set(leftItems().map((it) => it.id));
      set({
        formulaCursor: null,
        formulaPending: [],
        mode: {
          kind: 'tagEdit',
          bulk,
          frozenTargets: bulk ? [] : [...state.selection],
          baseLeft,
          overrides: new Map(),
        },
      });
    },
    toggleEditTag: (tagId: ItemId) => {
      if (state.mode.kind !== 'tagEdit') return;
      const mode = state.mode;
      const status = editStatus(mode, tagId);
      const overrides = new Map(mode.overrides);
      // all → off; some / none → on ("clicking it adds it to all of the selected")
      overrides.set(tagId, status === 'all' ? 'off' : 'on');
      const base = editStatus({ ...mode, overrides: new Map() }, tagId);
      const wanted = overrides.get(tagId);
      if ((wanted === 'on' && base === 'all') || (wanted === 'off' && base === 'none'))
        overrides.delete(tagId);
      set({ mode: { ...mode, overrides } });
    },
    cancelTagEdit: () => set({ mode: { kind: 'normal' } }),
    applyTagEdit: async () => {
      if (state.mode.kind !== 'tagEdit' || state.view.kind !== 'browse') return;
      const mode = state.mode;
      const targets = editTargets(mode);
      const add: LinkPair[] = [];
      const remove: LinkPair[] = [];
      for (const [tagId, wanted] of mode.overrides) {
        for (const itemId of targets) {
          const has = (graph.taggersOf.get(itemId) ?? emptySet).has(tagId);
          if (wanted === 'on' && !has) add.push({ tagId, itemId });
          if (wanted === 'off' && has) remove.push({ tagId, itemId });
        }
      }
      if (add.length === 0 && remove.length === 0) {
        set({ mode: { kind: 'normal' } });
        return;
      }
      const prevView = state.view;
      const patched = access(graph, { patch: { add, remove } });
      const nextView = sanitize(prevView, patched);
      // items the edit filtered out of the right pane leave the selection too
      const keptSelection =
        nextView.kind === 'browse'
          ? new Set(
              visibleAt(patched, nextView, nextView.leftLevel - 1)
                .map((it) => it.id)
                .filter((id) => state.selection.has(id)),
            )
          : emptySet;
      await client.mutation(api.items.applyLinks, { add, remove });
      push({
        label: 'edit tags',
        undo: async () => {
          await client.mutation(api.items.applyLinks, { add: remove, remove: add });
          set({ view: prevView });
        },
        redo: async () => {
          await client.mutation(api.items.applyLinks, { add, remove });
          set({ view: nextView });
        },
      });
      set({ mode: { kind: 'normal' }, view: nextView, selection: keptSelection });
    },

    // -- history --
    undo: async () => {
      if (historyBusy) return;
      if (state.mode.kind !== 'normal') {
        set({ mode: { kind: 'normal' } });
        return;
      }
      const entry = undoStack.pop();
      if (entry === undefined) return;
      historyBusy = true;
      try {
        await entry.undo();
        redoStack.push(entry);
      } finally {
        historyBusy = false;
      }
      set({ formulaCursor: null, formulaPending: [] });
    },
    redo: async () => {
      if (historyBusy) return;
      const entry = redoStack.pop();
      if (entry === undefined) return;
      historyBusy = true;
      try {
        await entry.redo();
        undoStack.push(entry);
      } finally {
        historyBusy = false;
      }
      set({ formulaCursor: null, formulaPending: [] });
    },

    flashHint,
  };

  return {
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getState: () => state,
    setGraph: (g: Graph) => {
      graph = g;
      set({ graphVersion: state.graphVersion + 1 });
    },
    graph: () => graph,
    actions,
  };
};

export const useAppState = (store: Store): AppState =>
  useSyncExternalStore(store.subscribe, store.getState);
