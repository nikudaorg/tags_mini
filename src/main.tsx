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

// Shown when no Clerk publishable key is configured. @clerk/react has no
// keyless mode (unlike @clerk/nextjs), so without a key we can't mount
// ClerkProvider — surface a clear notice instead of a blank screen.
const ClerkNotice = () => (
  <div className="root-screen">
    <div className="empty-hero">
      <h1>Strata</h1>
      <p>
        Clerk isn&apos;t configured yet. Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> (a Clerk
        publishable key — a keyless/dev key works) and rebuild to enable sign-in.
      </p>
    </div>
  </div>
);

const tree = config.clerkPublishableKey ? (
  <ClerkProvider publishableKey={config.clerkPublishableKey}>
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      <App client={client} />
    </ConvexProviderWithClerk>
  </ClerkProvider>
) : (
  <ClerkNotice />
);

createRoot(rootEl).render(<StrictMode>{tree}</StrictMode>);
