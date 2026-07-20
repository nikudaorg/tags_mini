import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ClerkProvider, useAuth } from '@clerk/react';
import { config } from './config';
import { App } from './ui';
import './styles.css';

const client = new ConvexReactClient(config.convexUrl);

const rootEl = document.getElementById('root');
if (rootEl === null) throw new Error('missing #root element');

// Mount Clerk unconditionally and let the library resolve the publishable key
// itself (prop → import.meta.env → any keyless bootstrap it supports).
createRoot(rootEl).render(
  <StrictMode>
    <ClerkProvider publishableKey={config.clerkPublishableKey}>
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        <App client={client} />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>,
);
