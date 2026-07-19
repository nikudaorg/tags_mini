import { useAuthActions } from '@convex-dev/auth/react';

// The gate shown while signed out. Convex Auth issues the session; once it
// resolves, App swaps this out for the real surfaces.
export const SignIn = () => {
  const { signIn } = useAuthActions();
  return (
    <div className="root-screen">
      <div className="empty-hero">
        <h1>Strata</h1>
        <p>
          Notes are reached through formulas over tags, level by level. Sign in to open
          your own corpus — every account keeps a separate set of tags and notes.
        </p>
        <button className="btn primary" onClick={() => void signIn('google')}>
          Continue with Google
        </button>
      </div>
    </div>
  );
};
