import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { config } from './config';
import { App } from './ui';
import './styles.css';

const client = new ConvexReactClient(config.convexUrl);

const rootEl = document.getElementById('root');
if (rootEl === null) throw new Error('missing #root element');

createRoot(rootEl).render(
  <StrictMode>
    <ConvexProvider client={client}>
      <App client={client} />
    </ConvexProvider>
  </StrictMode>,
);
