// Vercel serverless entry. Wraps the Express app from the api-server
// workspace artifact so all matched routes (see vercel.json `rewrites`)
// flow through one Fluid Compute function.
//
// Types are intentionally `any` to avoid pulling @types/node and
// @types/express into the root package — those types live with the
// api-server artifact, and @vercel/node typechecks this file against
// the workspace root.
import { getApp } from "../artifacts/api-server/server/index";

let cachedApp: any = null;

export default async function handler(req: any, res: any) {
  if (!cachedApp) {
    cachedApp = await getApp();
  }
  return cachedApp(req, res);
}

export const config = {
  maxDuration: 60,
};
