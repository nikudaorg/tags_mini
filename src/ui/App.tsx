import { useState } from 'react';
import type { ConvexReactClient } from 'convex/react';
import { createStore } from '../state';
import { Main } from './Main';
import { NoteEditor } from './NoteEditor';

// Two surfaces: the browse app at "/", and the edit-only note view at
// "/note/:id" which always lives in its own tab.
export const App = ({ client }: { readonly client: ConvexReactClient }) => {
  const [store] = useState(() => createStore(client));
  const match = /^\/note\/([^/]+)$/.exec(window.location.pathname);
  const noteId = match?.[1];
  return noteId !== undefined ? <NoteEditor id={noteId} /> : <Main store={store} />;
};
