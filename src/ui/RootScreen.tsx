import { untaggedByLevel, type Graph } from '../domain';
import type { Store } from '../state';
import { levelName } from './BrowseScreen';

// The first screen: every item nothing tags, sectioned by level, lower levels
// first. Choosing a tag opens the two-pane browse window at its level.
export const RootScreen = ({
  store,
  graph,
}: {
  readonly store: Store;
  readonly graph: Graph;
}) => {
  const sections = untaggedByLevel(graph);
  const empty = graph.items.size === 0;

  if (empty) {
    return (
      <div className="root-screen">
        <div className="empty-hero">
          <h1>Strata</h1>
          <p>
            Notes are reached through formulas over tags, level by level: level-1 tags tag
            notes, level-2 tags tag level-1 tags. On any screen you compose a filter like
          </p>
          <p className="formula-demo">
            <span className="f-term">projects</span> <span className="f-op">OR</span>{' '}
            <span className="f-bracket">(</span>
            <span className="f-term">reading</span> <span className="f-op">AND</span>{' '}
            <span className="f-bracket">(</span>
            <span className="f-op">NOT</span> <span className="f-term">done</span>
            <span className="f-bracket">)</span>
            <span className="f-bracket">)</span>
          </p>
          <p>
            Start by creating a note and a level-1 tag — every action here is undoable
            with <kbd>⌘Z</kbd>.
          </p>
          <p style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn primary"
              onClick={() => store.actions.openCreateNote('', false)}
            >
              New note
            </button>
            <button className="btn" onClick={() => store.actions.openCreateTag(1)}>
              New tag
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="root-screen">
      <h1>Index</h1>
      <p className="subtitle">
        Everything not yet tagged by anything, lowest level first. Choose a tag to open
        it as a filter, or double-click a note to edit it.
      </p>
      {[...sections.entries()].map(([level, items]) => (
        <section key={level} className="root-section">
          <h2>
            <span className="lvl">L{level}</span>
            {level === 0 ? 'Untagged notes' : `${levelName(level)} tags`}
          </h2>
          <div className="root-list">
            {items.map((it) =>
              it.level === 0 ? (
                <button
                  key={it.id}
                  className="row"
                  onDoubleClick={() => window.open(`/note/${it.id}`, '_blank', 'noopener')}
                  title="Double-click to open in a new tab"
                >
                  <span className="name">{it.name}</span>
                  <span className="meta">{it.text}</span>
                </button>
              ) : (
                <button
                  key={it.id}
                  className="row"
                  onClick={() => store.actions.openFromRoot(it)}
                  title={`Open ${it.name} as a filter over ${levelName(it.level - 1).toLowerCase()}`}
                >
                  <span className="name">{it.name}</span>
                  <span className="meta">{it.metadata}</span>
                  <span className="count">
                    {(graph.targetsOf.get(it.id) ?? new Set()).size}
                  </span>
                </button>
              ),
            )}
          </div>
        </section>
      ))}
      {(graph.byLevel.get(0) ?? []).length > 0 && (
        <section className="root-section">
          <h2>
            <span className="lvl">∀</span>All notes
          </h2>
          <button className="btn" onClick={() => store.actions.browseAllNotes()}>
            Browse all {(graph.byLevel.get(0) ?? []).length} notes
          </button>
        </section>
      )}
    </div>
  );
};
