// Vercel serverless entry. Lazily imports the api-server's prebuilt
// esbuild bundle (`dist/index.mjs`) on first invocation. Static
// `import { getApp } from ...` triggers the bundle's banner code at
// module-evaluation time, which empirically blows up the cold start
// (FUNCTION_INVOCATION_FAILED with no logged error). Dynamic import
// inside the handler defers that work to a context where errors
// surface normally.

let cachedApp: any = null;

export default async function handler(req: any, res: any) {
  if (!cachedApp) {
    // @ts-ignore — bundled artifact, no .d.mts shipped
    const mod = await import("../artifacts/api-server/dist/index.mjs");
    cachedApp = await (mod as any).getApp();
  }
  return cachedApp(req, res);
}

export const config = {
  maxDuration: 60,
};
