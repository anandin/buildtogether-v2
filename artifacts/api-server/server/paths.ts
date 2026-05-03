import * as fs from "fs";
import * as path from "path";

function resolveArtifactDir(slug: string): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.resolve(cwd, "pnpm-workspace.yaml"))) {
    return path.resolve(cwd, "artifacts", slug);
  }
  return cwd;
}

export const apiServerDir = resolveArtifactDir("api-server");
export const expoAppDir = resolveArtifactDir("buildtogether");
