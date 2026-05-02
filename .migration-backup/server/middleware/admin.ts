/**
 * requireAdmin — gate /api/admin/* routes.
 *
 * Must run AFTER `requireAuth` so `req.user` is populated. Reads the
 * `is_admin` flag from the users table — set via the bootstrap clause in
 * migration 0002, or admin can flip another user's flag via /admin/users.
 */
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { users } from "../../shared/schema";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const u = await db.query.users.findFirst({
      where: eq(users.id, req.user.id),
      columns: { isAdmin: true },
    });
    if (!u?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  } catch (err) {
    console.error("requireAdmin error:", err);
    res.status(500).json({ error: "Authorization check failed" });
  }
}
