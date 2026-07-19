// Clerk issuer config. CLERK_JWT_ISSUER_DOMAIN is the Clerk Frontend API URL
// from https://dashboard.clerk.com/apps/setup/convex — set it on the
// deployment with `npx convex env set CLERK_JWT_ISSUER_DOMAIN <url>`.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: 'convex',
    },
  ],
};
