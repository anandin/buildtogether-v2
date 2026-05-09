// Vercel serverless entry. Imports from the api-server's prebuilt esbuild
// bundle (`dist/index.mjs`) — that bundle is produced by the buildCommand
// in vercel.json. Importing the bundled .mjs (rather than the .ts source)
// keeps @vercel/node's TypeScript checker from chasing into the workspace
// where the api-server's `moduleResolution: "bundler"` tsconfig disagrees
// with @vercel/node's default (NodeNext) setup.
//
// @ts-ignore — bundled artifact, no .d.mts shipped
import { getApp } from "../artifacts/api-server/dist/index.mjs";

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
