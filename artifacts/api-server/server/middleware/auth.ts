import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { sessions, users } from "../../shared/schema";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  coupleId: string | null;
  partnerRole: string | null;
}

declare module "express" {
  interface Request {
    user?: AuthUser;
  }
}

/**
 * Middleware that validates the Bearer token and attaches req.user.
 * Returns 401 if no token, invalid token, or expired session.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.token, token),
    });

    if (!session || new Date(session.expiresAt) < new Date()) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      coupleId: user.coupleId,
      partnerRole: user.partnerRole,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

/**
 * Middleware that verifies the authenticated user belongs to the couple
 * referenced by :coupleId in the route params. Must run after requireAuth.
 */
export async function requireCoupleAccess(req: Request, res: Response, next: NextFunction) {
  const { coupleId } = req.params;

  if (!coupleId) {
    return res.status(400).json({ error: "Couple ID is required" });
  }

  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.user.coupleId !== coupleId) {
    return res.status(403).json({ error: "Access denied" });
  }

  next();
}
