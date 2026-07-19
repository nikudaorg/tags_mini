import { z } from 'zod';

const env = z
  .object({ VITE_CONVEX_URL: z.string().url() })
  .parse(import.meta.env);

export const config = { convexUrl: env.VITE_CONVEX_URL } as const;
