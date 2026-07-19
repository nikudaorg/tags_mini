import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { ItemId } from '../domain';

// The separate-tab view: it edits the note's text and nothing else. Undo/redo
// here is the textarea's own history; saving is debounced.
export const NoteEditor = ({ id }: { readonly id: string }) => {
  const note = useQuery(api.items.getNote, { id });
  const save = useMutation(api.items.setText);
  const [text, setText] = useState<string | null>(null);
  const [savedText, setSavedText] = useState<string | null>(null);

  useEffect(() => {
    if (note !== undefined && note !== null && text === null) {
      setText(note.text);
      setSavedText(note.text);
    }
  }, [note, text]);

  useEffect(() => {
    if (note !== undefined && note !== null) document.title = `${note.name} — Strata`;
  }, [note]);

  useEffect(() => {
    if (text === null || text === savedText || note === undefined || note === null) return;
    const timer = setTimeout(() => {
      void save({ id: note.id as ItemId, text }).then(() => setSavedText(text));
    }, 500);
    return () => clearTimeout(timer);
  }, [text, savedText, note, save]);

  if (note === undefined) {
    return (
      <div className="note-editor">
        <div className="skeleton-list">
          <div className="skeleton" style={{ width: '40%' }} />
          <div className="skeleton" style={{ width: '90%', height: 120 }} />
        </div>
      </div>
    );
  }
  if (note === null) {
    return (
      <div className="note-editor">
        <p className="note-missing">This note doesn't exist — it may have been deleted.</p>
      </div>
    );
  }
  return (
    <div className="note-editor">
      <header>
        <h1>{note.name}</h1>
        <span className="save-state" role="status">
          {text === savedText ? 'Saved' : 'Saving…'}
        </span>
      </header>
      <textarea
        value={text ?? note.text}
        onChange={(e) => setText(e.target.value)}
        aria-label={`Text of ${note.name}`}
        autoFocus
        spellCheck={false}
      />
    </div>
  );
};
