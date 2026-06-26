import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "dist/public");
const serverEntry = resolve(here, "dist/server/entry-server.js");

const ROUTES = ["/", "/security"];
const BASE_PATH = process.env.BASE_PATH ?? "/landing/";
const baseNoSlash = BASE_PATH.replace(/\/$/, "");

const { render } = await import(pathToFileURL(serverEntry).href);

const shellPath = join(publicDir, "index.html");
const shell = readFileSync(shellPath, "utf-8");

const ROOT_PLACEHOLDER = '<div id="root"></div>';
if (!shell.includes(ROOT_PLACEHOLDER)) {
  throw new Error(
    `prerender: cannot find '${ROOT_PLACEHOLDER}' in dist/public/index.html`,
  );
}

let routeCount = 0;
for (const route of ROUTES) {
  // Wouter expects ssrPath to be the full request path including the base.
  // It strips the base internally before matching against route patterns.
  const ssrPath = `${baseNoSlash}${route}`;
  const html = render(ssrPath);
  const out = shell.replace(
    ROOT_PLACEHOLDER,
    `<div id="root">${html}</div>`,
  );

  let outPath;
  if (route === "/") {
    outPath = shellPath;
  } else {
    const dir = join(publicDir, route.replace(/^\//, ""));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    outPath = join(dir, "index.html");
  }
  writeFileSync(outPath, out, "utf-8");
  routeCount++;
  console.log(`  prerendered ${route}  -> ${outPath.replace(here + "/", "")}`);
}

console.log(`prerender: wrote ${routeCount} route(s) to ${publicDir}`);
console.log(`prerender: BASE_PATH = ${BASE_PATH}`);
