import { useState } from 'react';
import type { ConvexReactClient } from 'convex/react';
import { useConvexAuth } from 'convex/react';
import { createStore } from '../state';
import { Main } from './Main';
import { NoteEditor } from './NoteEditor';
import { SignIn } from './SignIn';

// Two surfaces: the browse app at "/", and the edit-only note view at
// "/note/:id" which always lives in its own tab. Both sit behind the same
// auth gate — signed out, neither queries anything user-scoped.
export const App = ({ client }: { readonly client: ConvexReactClient }) => {
  const [store] = useState(() => createStore(client));
  const { isLoading, isAuthenticated } = useConvexAuth();
  const match = /^\/note\/([^/]+)$/.exec(window.location.pathname);
  const noteId = match?.[1];

  if (isLoading) return <div className="shell" aria-busy="true" />;
  if (!isAuthenticated) return <SignIn />;
  return noteId !== undefined ? <NoteEditor id={noteId} /> : <Main store={store} />;
};
