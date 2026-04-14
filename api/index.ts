/**
 * Vercel serverless entry point.
 *
 * Wraps the Express app so all /api/* requests flow through a single Fluid
 * Compute function. Vercel routes all /api/(.*) to this handler via
 * vercel.json. The Expo web static bundle is served separately as static
 * files from the dist/ folder (configured in vercel.json).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { getApp } from "../server/index.js";

let cachedApp: Awaited<ReturnType<typeof getApp>> | null = null;

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (!cachedApp) {
    cachedApp = await getApp();
  }
  return cachedApp(req as any, res as any);
}

// Vercel Fluid Compute config: keep instances warm to avoid cold starts
// on AI endpoints (/api/guardian/quick-add calls OpenAI).
export const config = {
  maxDuration: 60, // seconds — OpenAI calls can take ~10-30s
};
