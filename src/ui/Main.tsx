import { useEffect, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { useClerk } from '@clerk/react';
import { api } from '../../convex/_generated/api';
import { buildGraph } from '../domain';
import { useAppState, type Store } from '../state';
import { BrowseScreen, levelName } from './BrowseScreen';
import { RootScreen } from './RootScreen';
import { Dialogs } from './Dialogs';
import { openNoteTab } from './openNoteTab';

const TopBar = ({
  store,
  canUndo,
  canRedo,
  crumb,
  defaultTagLevel,
}: {
  readonly store: Store;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly crumb: string | null;
  readonly defaultTagLevel: number;
}) => {
  const { signOut } = useClerk();
  return (
    <header className="topbar">
      <button className="wordmark" onClick={() => store.actions.goRoot()} title="Back to the index">
        strata
      </button>
      <nav className="crumbs" aria-label="location">
        <span>Index</span>
        {crumb !== null && (
          <>
            <span className="sep">›</span>
            <span className="here">{crumb}</span>
          </>
        )}
      </nav>
      <span className="spacer" />
      <button
        className="btn quiet"
        disabled={!canUndo}
        onClick={() => void store.actions.undo()}
        title="Undo (⌘Z)"
      >
        ↶ Undo
      </button>
      <button
        className="btn quiet"
        disabled={!canRedo}
        onClick={() => void store.actions.redo()}
        title="Redo (⇧⌘Z)"
      >
        ↷ Redo
      </button>
      <button className="btn" onClick={() => store.actions.openCreateTag(defaultTagLevel)}>
        New tag
      </button>
      <button className="btn primary" onClick={() => store.actions.openCreateNote('', false)}>
        New note
      </button>
      <button className="btn quiet" onClick={() => void signOut()} title="Sign out">
        Sign out
      </button>
    </header>
  );
};

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  target.closest('input, textarea, [contenteditable="true"]') !== null;

export const Main = ({ store }: { readonly store: Store }) => {
  const state = useAppState(store);
  const data = useQuery(api.items.all);
  const graph = useMemo(() => (data === undefined ? null : buildGraph(data)), [data]);

  useEffect(() => {
    if (graph !== null) store.setGraph(graph);
  }, [graph, store]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = store.getState();
      if (st.dialog.kind !== 'none' || isEditableTarget(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (meta && key === 'z') {
        e.preventDefault();
        void (e.shiftKey ? store.actions.redo() : store.actions.undo());
        return;
      }
      if (meta && key === 'y') {
        e.preventDefault();
        void store.actions.redo();
        return;
      }
      if (meta && key === 'a') {
        e.preventDefault();
        store.actions.selectAll();
        return;
      }
      if (meta) return; // ⌘V arrives as a paste event, everything else passes through
      const editingFormula =
        st.formulaCursor !== null && st.view.kind === 'browse' && st.mode.kind === 'normal';
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (editingFormula) store.actions.moveFormulaCursor(-1);
          else store.actions.goUp();
          return;
        case 'ArrowRight':
          e.preventDefault();
          if (editingFormula) store.actions.moveFormulaCursor(1);
          else store.actions.goDown();
          return;
        case 'ArrowUp':
          e.preventDefault();
          store.actions.moveCursor(-1, e.shiftKey);
          return;
        case 'ArrowDown':
          e.preventDefault();
          store.actions.moveCursor(1, e.shiftKey);
          return;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          if (editingFormula)
            store.actions.deleteAtFormulaCursor(e.key === 'Delete' ? 'forward' : 'back');
          else void store.actions.deleteSelected();
          return;
        case 'Escape':
          if (editingFormula) store.actions.setFormulaCursor(null);
          else if (st.mode.kind !== 'normal') store.actions.cancelTagEdit();
          else store.actions.clearSelection();
          return;
        case 'Enter': {
          if (editingFormula) {
            store.actions.setFormulaCursor(null);
            return;
          }
          if (st.mode.kind === 'tagEdit') {
            void store.actions.applyTagEdit();
            return;
          }
          const cursor = st.cursor;
          if (cursor !== null && store.graph().items.get(cursor)?.level === 0)
            openNoteTab(cursor);
          return;
        }
        case 'o':
          store.actions.pressOperator('or');
          return;
        case 'a':
          store.actions.pressOperator('and');
          return;
        case 'n':
          store.actions.pressNot();
          return;
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      const st = store.getState();
      if (st.dialog.kind !== 'none' || isEditableTarget(e.target)) return;
      if (st.view.kind !== 'browse' || st.view.leftLevel !== 1 || st.mode.kind !== 'normal')
        return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text.trim().length === 0) return;
      e.preventDefault();
      store.actions.openCreateNote(text, true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [store]);

  if (graph === null || state.graphVersion === 0) {
    return (
      <div className="shell">
        <header className="topbar">
          <span className="wordmark">strata</span>
        </header>
        <div className="skeleton-list" aria-label="loading">
          {[72, 56, 64, 48, 60].map((w, i) => (
            <div key={i} className="skeleton" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    );
  }

  const view = state.view;
  const crumb =
    view.kind === 'browse'
      ? `${levelName(view.leftLevel)} → ${levelName(view.leftLevel - 1)}`
      : null;
  const defaultTagLevel =
    view.kind === 'browse' ? (view.leftLevel - 1 >= 1 ? view.leftLevel - 1 : view.leftLevel) : 1;

  return (
    <div className="shell">
      <TopBar
        store={store}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        crumb={crumb}
        defaultTagLevel={defaultTagLevel}
      />
      {view.kind === 'root' ? (
        <RootScreen store={store} graph={graph} />
      ) : (
        <BrowseScreen store={store} state={state} graph={graph} view={view} />
      )}
      <Dialogs store={store} state={state} />
      {state.hint !== null && (
        <div className="hint-toast" role="status">
          {state.hint}
        </div>
      )}
    </div>
  );
};
