import { z } from 'zod';

const env = z
  .object({
    VITE_CONVEX_URL: z.string().url(),
    VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  })
  .parse(import.meta.env);

export const config = {
  convexUrl: env.VITE_CONVEX_URL,
  clerkPublishableKey: env.VITE_CLERK_PUBLISHABLE_KEY,
} as const;
