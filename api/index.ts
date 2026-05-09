import type { IncomingMessage, ServerResponse } from "node:http";
import { getApp } from "../artifacts/api-server/server/index";

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

export const config = {
  maxDuration: 60,
};
