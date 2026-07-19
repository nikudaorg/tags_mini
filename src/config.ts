import { z } from 'zod';

const env = z
  .object({
    VITE_CONVEX_URL: z.string().url(),
    // Optional so the app builds and boots before Clerk keys are provided.
    // When empty the sign-in gate shows a "configure Clerk" notice instead of
    // crashing; supply a publishable key (e.g. a Clerk keyless/dev key) to
    // enable auth.
    VITE_CLERK_PUBLISHABLE_KEY: z.string().default(''),
  })
  .parse(import.meta.env);

export const config = {
  convexUrl: env.VITE_CONVEX_URL,
  clerkPublishableKey: env.VITE_CLERK_PUBLISHABLE_KEY,
} as const;
