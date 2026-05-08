/**
 * Server-rendered admin shell at /admin.
 *
 * One static HTML page that hosts five tabs (Memory, Tilly, People, Plaid,
 * Cost) and calls the corresponding /api/admin/* endpoints. Auth is the
 * same Bearer token used by the mobile app — the page either reads it
 * from localStorage or prompts for email + password sign-in.
 *
 * The legacy /admin/memory and /admin/tilly URLs 301-redirect into this
 * shell with the appropriate hash so old bookmarks / links keep working.
 */
import type { Express, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { apiServerDir } from "../paths";

const _cache: Record<string, string> = {};
function loadHtml(filename: string): string {
  if (_cache[filename]) return _cache[filename];
  const p = path.resolve(apiServerDir, "server", "templates", filename);
  _cache[filename] = fs.readFileSync(p, "utf-8");
  return _cache[filename];
}

export function mountAdminPage(app: Express): void {
  // Legacy URL redirects — surfaces that used to live at /admin/memory and
  // /admin/tilly are now tabs inside /admin. 301 so old bookmarks resolve
  // server-side; the hash drives initial tab selection.
  app.get("/admin/memory", (_req: Request, res: Response) => {
    res.redirect(301, "/admin#memory");
  });
  app.get("/admin/tilly", (_req: Request, res: Response) => {
    res.redirect(301, "/admin#tilly");
  });

  app.get("/admin", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(loadHtml("admin.html"));
  });
}
