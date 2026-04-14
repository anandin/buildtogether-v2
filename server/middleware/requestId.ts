/**
 * Attaches a UUID request ID and structured logger to each request.
 * Makes live debugging possible — when a user reports "it failed at 3:42pm,"
 * you can grep logs for their request ID and see the whole call.
 */
import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

declare module "express" {
  interface Request {
    requestId?: string;
    log?: (level: "info" | "warn" | "error", message: string, data?: any) => void;
  }
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);

  const user = (req as any).user;
  req.log = (level, message, data) => {
    const payload = {
      ts: new Date().toISOString(),
      level,
      requestId: id,
      method: req.method,
      path: req.path,
      userId: user?.id,
      coupleId: user?.coupleId,
      message,
      ...(data || {}),
    };
    const line = JSON.stringify(payload);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };

  next();
}
