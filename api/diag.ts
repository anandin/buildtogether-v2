// Minimal Vercel function for diagnosing whether the runtime can start a
// trivial handler at all. If /api/diag works but /api/* doesn't, the
// problem is in the api-server bundle. If /api/diag also fails, the
// issue is environmental (env vars, runtime, paths).
export default function handler(_req: any, res: any) {
  const cwd = (globalThis as any).process?.cwd?.() ?? "?";
  let listing: any = "?";
  let recursiveArtifacts: any = "?";
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    listing = fs.readdirSync(cwd);
    // Search for any "artifacts" directory in the deployed bundle
    function find(dir: string, depth = 0): string[] {
      if (depth > 4) return [];
      const out: string[] = [];
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.isDirectory()) {
            const full = path.join(dir, e.name);
            if (e.name === "artifacts" || e.name === "templates") out.push(full);
            if (!["node_modules", ".cache", ".vercel"].includes(e.name)) {
              out.push(...find(full, depth + 1));
            }
          }
        }
      } catch {}
      return out;
    }
    recursiveArtifacts = find(cwd);
  } catch (e: any) {
    listing = `err: ${e.message}`;
  }
  const hasArtifacts = listing && Array.isArray(listing) && listing.includes("artifacts");
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      ok: true,
      cwd,
      hasArtifacts,
      listing,
      foundDirs: recursiveArtifacts,
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
