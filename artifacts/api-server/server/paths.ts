import * as path from "path";
import { fileURLToPath } from "url";

function findArtifactsRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  while (true) {
    if (path.basename(dir) === "artifacts") {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Unable to locate 'artifacts' directory walking up from ${here}`,
      );
    }
    dir = parent;
  }
}

const artifactsRoot = findArtifactsRoot();

function resolveArtifactDir(slug: string): string {
  return path.resolve(artifactsRoot, slug);
}

export const apiServerDir = resolveArtifactDir("api-server");
export const expoAppDir = resolveArtifactDir("buildtogether");
