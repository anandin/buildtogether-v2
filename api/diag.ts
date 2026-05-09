// Minimal Vercel function for diagnosing whether the runtime can start a
// trivial handler at all. If /api/diag works but /api/* doesn't, the
// problem is in the api-server bundle. If /api/diag also fails, the
// issue is environmental (env vars, runtime, paths).
export default function handler(_req: any, res: any) {
  const cwd = (globalThis as any).process?.cwd?.() ?? "?";
  const hasArtifacts = (() => {
    try {
      const fs = require("node:fs");
      return fs.existsSync(cwd + "/artifacts");
    } catch (e: any) {
      return `err: ${e.message}`;
    }
  })();
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      ok: true,
      cwd,
      hasArtifacts,
      node: (globalThis as any).process?.version,
      vercelEnv: (globalThis as any).process?.env?.VERCEL_ENV ?? null,
      requiredEnvPresent: {
        DATABASE_URL: !!(globalThis as any).process?.env?.DATABASE_URL,
        OPENROUTER_API_KEY: !!(globalThis as any).process?.env?.OPENROUTER_API_KEY,
        AI_INTEGRATIONS_OPENAI_API_KEY: !!(globalThis as any).process?.env?.AI_INTEGRATIONS_OPENAI_API_KEY,
        AI_INTEGRATIONS_OPENAI_BASE_URL: !!(globalThis as any).process?.env?.AI_INTEGRATIONS_OPENAI_BASE_URL,
      },
    })
  );
}
