// Clerk issuer config. CLERK_JWT_ISSUER_DOMAIN is the Clerk Frontend API URL
// from https://dashboard.clerk.com/apps/setup/convex — set it on the
// deployment with `npx convex env set CLERK_JWT_ISSUER_DOMAIN <url>`.
//
// It's optional so the backend deploys before Clerk is wired up (e.g. while
// running against a keyless / anonymous instance). With no issuer configured
// Convex validates no tokens and `ctx.auth.getUserIdentity()` returns null;
// set the variable to turn Clerk auth on.
const issuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: issuerDomain ? [{ domain: issuerDomain, applicationID: 'convex' }] : [],
};
