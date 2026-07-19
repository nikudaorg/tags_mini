import { SignInButton } from '@clerk/react';

// The gate shown while signed out. Clerk issues the session (providers are
// configured in the Clerk dashboard); once Convex validates it, App swaps
// this out for the real surfaces.
export const SignIn = () => (
  <div className="root-screen">
    <div className="empty-hero">
      <h1>Strata</h1>
      <p>
        Notes are reached through formulas over tags, level by level. Sign in to open
        your own corpus — every account keeps a separate set of tags and notes.
      </p>
      <SignInButton mode="modal">
        <button className="btn primary">Sign in</button>
      </SignInButton>
    </div>
  </div>
);
