/**
 * Server-rendered admin page at /admin/tilly.
 *
 * Static HTML + vanilla JS that calls /api/admin/tilly/* endpoints. Lives
 * outside the React Native web SPA (which is mounted at /app) so it can
 * be loaded directly without spinning up the full Expo bundle. Editorial
 * styling matches Tilly's voice.
 *
 * Auth is the same Bearer token used by the mobile app — the admin opens
 * /admin/tilly, the page prompts for the token (or reads from
 * localStorage if already signed in via /app), then loads the config.
 */
import type { Express, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";

const _cache: Record<string, string> = {};
function loadHtml(filename: string): string {
  if (_cache[filename]) return _cache[filename];
  const p = path.resolve(process.cwd(), "server", "templates", filename);
  _cache[filename] = fs.readFileSync(p, "utf-8");
  return _cache[filename];
}

export function mountAdminPage(app: Express): void {
  app.get("/admin/tilly", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(loadHtml("admin-tilly.html"));
  });

  app.get("/admin/memory", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(loadHtml("admin-memory.html"));
  });

  // Convenience landing redirect.
  app.get("/admin", (_req: Request, res: Response) => {
    res.redirect("/admin/tilly");
  });
}
