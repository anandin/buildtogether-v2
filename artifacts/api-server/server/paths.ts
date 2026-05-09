import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

function findArtifactsRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  while (true) {
    if (path.basename(dir) === "artifacts") {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Optional fallback for runtimes that ship the artifacts/ tree alongside
  // the bundled function (e.g. via vercel.json includeFiles). Returns the
  // path even when it doesn't exist — callers (configureExpoAndLanding,
  // serveExpoManifest, registerAdminRoutes) already guard with existsSync
  // and skip when the target is missing. This means modules can safely
  // import { apiServerDir } from "./paths" at top level without crashing
  // a Vercel cold start where artifacts/ is absent.
  return path.resolve(process.cwd(), "artifacts");
}

const artifactsRoot = findArtifactsRoot();

function resolveArtifactDir(slug: string): string {
  return path.resolve(artifactsRoot, slug);
}

export const apiServerDir = resolveArtifactDir("api-server");
export const expoAppDir = resolveArtifactDir("buildtogether");
