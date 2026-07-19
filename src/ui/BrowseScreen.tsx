import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  nextExpected,
  predicateAt,
  termIds,
  type BrowseView,
  type Graph,
  type Item,
  type ItemId,
} from '../domain';
import {
  editLeftItemsOf,
  editStatusOf,
  editTargetsOf,
  leftItemsOf,
  rightItemsOf,
  type AppState,
  type Store,
} from '../state';
import { Formula } from './FormulaBar';
import { cx } from './cx';
import { openNoteTab } from './openNoteTab';

export const levelName = (level: number): string =>
  level === 0 ? 'Notes' : `Level ${level}`;

// ---------- left pane ----------

const LeftPane = ({
  store,
  state,
  graph,
  view,
}: {
  readonly store: Store;
  readonly state: AppState;
  readonly graph: Graph;
  readonly view: BrowseView;
}) => {
  const mode = state.mode;
  const tokens = predicateAt(view, view.leftLevel);
  const inFormula = termIds(tokens);

  if (mode.kind === 'tagEdit') {
    const targets = editTargetsOf(mode, state.selection);
    const items = editLeftItemsOf(graph, view, mode, targets);
    return (
      <section className="pane" aria-label="tags to apply">
        <div className="pane-head">
          <span className="pane-title">
            {levelName(view.leftLevel)} — click to add / remove
          </span>
          <span className="pane-count">{items.length}</span>
        </div>
        <div className="pane-body">
          {targets.length === 0 ? (
            <p className="pane-empty">
              Select items on the right, then click tags here to apply them to the whole
              selection.
            </p>
          ) : (
            items.map((it) => {
              const status = editStatusOf(graph, mode, targets, it.id);
              const previouslyHidden = !mode.baseLeft.has(it.id);
              const glyph = status === 'all' ? '✓' : status === 'some' ? '◐' : '·';
              return (
                <button
                  key={it.id}
                  className={cx(
                    'row',
                    status === 'all' && (previouslyHidden ? 'edit-on-hidden' : 'edit-on'),
                    status === 'some' && 'edit-some',
                  )}
                  onClick={() => store.actions.toggleEditTag(it.id)}
                  title={
                    status === 'all'
                      ? 'On every selected item — click to remove from all'
                      : status === 'some'
                        ? 'On some of the selection — click to add to all'
                        : 'Click to add to all selected items'
                  }
                >
                  <span className="state-glyph" aria-hidden="true">
                    {glyph}
                  </span>
                  <span className="name">{it.name}</span>
                  {previouslyHidden && <span className="hidden-badge">hidden</span>}
                  <span className="meta" />
                  <span className="count">{(graph.targetsOf.get(it.id) ?? new Set()).size}</span>
                </button>
              );
            })
          )}
        </div>
      </section>
    );
  }

  const items = leftItemsOf(graph, view);
  return (
    <section className="pane" aria-label={`${levelName(view.leftLevel)} tags`}>
      <div className="pane-head">
        <span className="pane-title">{levelName(view.leftLevel)}</span>
        <span className="pane-count">{items.length}</span>
        <span className="spacer" />
        {tokens.length > 0 && (
          <button className="btn quiet" onClick={() => store.actions.clearPredicate()}>
            Clear formula
          </button>
        )}
      </div>
      <div className="pane-body">
        {items.length === 0 ? (
          <p className="pane-empty">
            No {levelName(view.leftLevel).toLowerCase()} tags here. Create one with{' '}
            <b>New tag</b>, or press <kbd>←</kbd> to go a level up.
          </p>
        ) : (
          items.map((it) => (
            <button
              key={it.id}
              className={cx('row', inFormula.has(it.id) && 'in-formula')}
              onClick={() => store.actions.pickTerm(it.id)}
              title={
                it.metadata.length > 0
                  ? `${it.name} — ${it.metadata}`
                  : 'Click to use in the formula'
              }
            >
              <span className="dot" aria-hidden="true" />
              <span className="name">{it.name}</span>
              <span className="meta">{it.metadata}</span>
              <span className="count">{(graph.targetsOf.get(it.id) ?? new Set()).size}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
};

// ---------- right pane ----------

const RightPane = ({
  store,
  state,
  graph,
  view,
}: {
  readonly store: Store;
  readonly state: AppState;
  readonly graph: Graph;
  readonly view: BrowseView;
}) => {
  const level = view.leftLevel - 1;
  const items = rightItemsOf(graph, view);
  const mode = state.mode;
  const bulk = mode.kind === 'tagEdit' && mode.bulk;
  const frozen = mode.kind === 'tagEdit' && !mode.bulk;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  } | null>(null);

  const onRowClick = (e: ReactMouseEvent, item: Item) => {
    if (frozen) return;
    if (e.metaKey || e.ctrlKey) return store.actions.toggleSelect(item.id);
    if (e.shiftKey) return store.actions.rangeSelectTo(item.id);
    if (bulk) return store.actions.toggleSelect(item.id);
    if (item.level > 0) return store.actions.promoteRight(item.id);
    store.actions.selectOnly(item.id);
  };

  const onBodyMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0 || frozen) return;
    const container = bodyRef.current;
    if (container === null) return;
    if ((e.target as HTMLElement).closest('[data-item-id]') !== null) return;
    const additive = e.metaKey || e.ctrlKey || e.shiftKey;
    const base = additive ? [...state.selection] : [];
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;
    const onMove = (me: MouseEvent) => {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;
      if (!active && Math.hypot(dx, dy) < 4) return;
      active = true;
      const x = Math.min(startX, me.clientX);
      const y = Math.min(startY, me.clientY);
      const w = Math.abs(dx);
      const h = Math.abs(dy);
      setMarquee({ x, y, w, h });
      const hit: ItemId[] = [...base];
      container.querySelectorAll<HTMLElement>('[data-item-id]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < x + w && r.right > x && r.top < y + h && r.bottom > y) {
          const id = el.dataset['itemId'];
          if (id !== undefined) hit.push(id as ItemId);
        }
      });
      store.actions.setSelection(hit, false);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setMarquee(null);
      if (!active && !additive) store.actions.clearSelection();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const single =
    state.selection.size === 1 ? graph.items.get([...state.selection][0]!) : undefined;

  return (
    <section className="pane" aria-label={levelName(level)}>
      <div className="pane-head">
        <span className="pane-title">{levelName(level)}</span>
        <span className="pane-count">{items.length}</span>
        <span className="spacer" />
        {mode.kind === 'normal' && (
          <>
            <button
              className="btn"
              disabled={state.selection.size !== 1}
              onClick={() => store.actions.startTagEdit(false)}
              title="Add or remove tags on the selected item (select one with ⌘-click, arrows, or a drag rectangle)"
            >
              Add/remove tags
            </button>
            <button
              className="btn"
              onClick={() => store.actions.startTagEdit(true)}
              title="Tag several items at once: click, then select multiple on the right"
            >
              Bulk tag
            </button>
            <button
              className="btn danger"
              disabled={state.selection.size === 0}
              onClick={() => void store.actions.deleteSelected()}
              title="Delete selection (undoable)"
            >
              Delete
            </button>
          </>
        )}
        {bulk && <span className="pane-count">select the items to tag together</span>}
      </div>
      <div className="pane-body" ref={bodyRef} onMouseDown={onBodyMouseDown}>
        {items.length === 0 ? (
          <p className="pane-empty">
            {level === 0 ? (
              <>
                No notes match this formula. Create one with <b>New note</b>, or paste
                text (<kbd>⌘V</kbd>) to turn it into a note.
              </>
            ) : (
              <>No {levelName(level).toLowerCase()} tags match this formula.</>
            )}
          </p>
        ) : (
          items.map((it) => {
            const selected = state.selection.has(it.id);
            return (
              <button
                key={it.id}
                data-item-id={it.id}
                className={cx('row', selected && 'selected', state.cursor === it.id && 'cursor')}
                onClick={(e) => onRowClick(e, it)}
                onDoubleClick={it.level === 0 ? () => openNoteTab(it.id) : undefined}
                title={
                  it.level === 0
                    ? 'Double-click to open in a new tab'
                    : 'Click to drill in · ⌘-click to select'
                }
              >
                <span className="dot" aria-hidden="true" />
                <span className="name">{it.name}</span>
                <span className="meta">{it.level === 0 ? it.text : it.metadata}</span>
                {it.level > 0 && (
                  <span className="count">{(graph.targetsOf.get(it.id) ?? new Set()).size}</span>
                )}
              </button>
            );
          })
        )}
        {marquee !== null && (
          <div
            className="marquee"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
          />
        )}
      </div>
      {mode.kind === 'normal' && single !== undefined && (
        <Inspector key={single.id} store={store} item={single} />
      )}
    </section>
  );
};

const Inspector = ({ store, item }: { readonly store: Store; readonly item: Item }) => {
  const commitName = (value: string) => {
    const name = value.trim();
    if (name.length > 0) void store.actions.rename(item.id, name);
  };
  return (
    <div className="inspector">
      <label htmlFor="insp-name">Name</label>
      <input
        id="insp-name"
        defaultValue={item.name}
        onBlur={(e) => commitName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {item.level > 0 ? (
        <>
          <label htmlFor="insp-meta">Metadata</label>
          <input
            id="insp-meta"
            className="grow"
            defaultValue={item.metadata}
            placeholder="free-form metadata"
            onBlur={(e) => void store.actions.setMetadata(item.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </>
      ) : (
        <>
          <span className="grow" />
          <button className="btn" onClick={() => openNoteTab(item.id)}>
            Open
          </button>
        </>
      )}
    </div>
  );
};

// ---------- bottom bar ----------

const BottomBar = ({
  store,
  state,
  graph,
  view,
}: {
  readonly store: Store;
  readonly state: AppState;
  readonly graph: Graph;
  readonly view: BrowseView;
}) => {
  const mode = state.mode;
  if (mode.kind === 'tagEdit') {
    const targets = editTargetsOf(mode, state.selection);
    const label = mode.bulk
      ? `Bulk tagging ${targets.length} item${targets.length === 1 ? '' : 's'}`
      : `Tagging ${graph.items.get(targets[0] ?? ('' as ItemId))?.name ?? ''}`;
    return (
      <div className="formula-bar mode-bar">
        <span className="formula-label">{label}</span>
        <span className="legend">
          <span>
            <span className="swatch sw-on" /> on all
          </span>
          {mode.bulk && (
            <span>
              <span className="swatch sw-some" /> on some
            </span>
          )}
          <span>
            <span className="swatch sw-hidden" /> was hidden
          </span>
        </span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={() => store.actions.cancelTagEdit()}>
          Cancel <kbd>esc</kbd>
        </button>
        <button
          className="btn primary"
          disabled={mode.overrides.size === 0}
          onClick={() => void store.actions.applyTagEdit()}
        >
          Apply <kbd>↵</kbd>
        </button>
      </div>
    );
  }
  const tokens = predicateAt(view, view.leftLevel);
  const expecting = nextExpected(tokens);
  const editing = state.formulaCursor !== null;
  return (
    <div className="formula-bar">
      <span className="formula-label">
        {levelName(view.leftLevel)} formula
      </span>
      <Formula
        tokens={tokens}
        graph={graph}
        cursor={state.formulaCursor}
        onCursor={(at) => store.actions.setFormulaCursor(at)}
        pendingAtCaret={state.formulaPending}
      />
      <span className="formula-hintline">
        {editing ? (
          <span>
            <kbd>←</kbd>
            <kbd>→</kbd> move · <kbd>⌫</kbd> remove · <kbd>o</kbd>
            <kbd>a</kbd>
            <kbd>n</kbd> insert · <kbd>esc</kbd> done
          </span>
        ) : expecting === 'operator' ? (
          <span>
            <kbd>o</kbd> OR · <kbd>a</kbd> AND · <kbd>a</kbd>
            <kbd>n</kbd> AND NOT · click the formula to edit it
          </span>
        ) : (
          <span>click a tag on the left to {tokens.length === 0 ? 'start' : 'continue'}</span>
        )}
      </span>
    </div>
  );
};

export const BrowseScreen = ({
  store,
  state,
  graph,
  view,
}: {
  readonly store: Store;
  readonly state: AppState;
  readonly graph: Graph;
  readonly view: BrowseView;
}) => (
  <>
    <div className="panes">
      <LeftPane store={store} state={state} graph={graph} view={view} />
      <RightPane store={store} state={state} graph={graph} view={view} />
    </div>
    <BottomBar store={store} state={state} graph={graph} view={view} />
  </>
);
