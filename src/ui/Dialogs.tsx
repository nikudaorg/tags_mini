import { useEffect, useRef, useState } from 'react';
import type { AppState, Store } from '../state';

const NoteForm = ({
  store,
  initialText,
  fromPaste,
}: {
  readonly store: Store;
  readonly initialText: string;
  readonly fromPaste: boolean;
}) => {
  const [name, setName] = useState('');
  const [text, setText] = useState(initialText);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (trimmed.length === 0) return;
        void store.actions.createNote(trimmed, fromPaste ? initialText : text);
      }}
    >
      <h3>{fromPaste ? 'New note from clipboard' : 'New note'}</h3>
      <label>
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
      </label>
      {fromPaste ? (
        <div className="paste-preview">{initialText}</div>
      ) : (
        <label>
          Text
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={() => store.actions.closeDialog()}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          Create note
        </button>
      </div>
    </form>
  );
};

const TagForm = ({ store, initialLevel }: { readonly store: Store; readonly initialLevel: number }) => {
  const [name, setName] = useState('');
  const [metadata, setMetadata] = useState('');
  const [level, setLevel] = useState(Math.max(initialLevel, 1));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (trimmed.length === 0) return;
        void store.actions.createTag(trimmed, level, metadata.trim());
      }}
    >
      <h3>New tag</h3>
      <label>
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
      </label>
      <label>
        Level — level-{level} tags tag {level === 1 ? 'notes' : `level-${level - 1} tags`}
        <span className="level-stepper">
          <button
            type="button"
            className="btn"
            onClick={() => setLevel((l) => Math.max(1, l - 1))}
            disabled={level <= 1}
            aria-label="lower level"
          >
            −
          </button>
          <output>L{level}</output>
          <button
            type="button"
            className="btn"
            onClick={() => setLevel((l) => l + 1)}
            aria-label="higher level"
          >
            +
          </button>
        </span>
      </label>
      <label>
        Metadata (optional)
        <input type="text" value={metadata} onChange={(e) => setMetadata(e.target.value)} />
      </label>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={() => store.actions.closeDialog()}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          Create tag
        </button>
      </div>
    </form>
  );
};

export const Dialogs = ({ store, state }: { readonly store: Store; readonly state: AppState }) => {
  const ref = useRef<HTMLDialogElement>(null);
  const open = state.dialog.kind !== 'none';
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={() => store.actions.closeDialog()}>
      {state.dialog.kind === 'createNote' && (
        <NoteForm
          key={state.dialog.initialText}
          store={store}
          initialText={state.dialog.initialText}
          fromPaste={state.dialog.fromPaste}
        />
      )}
      {state.dialog.kind === 'createTag' && (
        <TagForm key={state.dialog.level} store={store} initialLevel={state.dialog.level} />
      )}
    </dialog>
  );
};
