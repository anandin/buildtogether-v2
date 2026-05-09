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
  // Vercel runtime: function is bundled into /var/task/api/, not under
  // artifacts/. The artifacts/ tree is shipped via vercel.json includeFiles
  // and lands at process.cwd()/artifacts.
  const fromCwd = path.resolve(process.cwd(), "artifacts");
  if (fs.existsSync(fromCwd)) return fromCwd;
  throw new Error(
    `Unable to locate 'artifacts' directory walking up from ${here} or at ${fromCwd}`,
  );
}

const artifactsRoot = findArtifactsRoot();

function resolveArtifactDir(slug: string): string {
  return path.resolve(artifactsRoot, slug);
}

export const apiServerDir = resolveArtifactDir("api-server");
export const expoAppDir = resolveArtifactDir("buildtogether");
