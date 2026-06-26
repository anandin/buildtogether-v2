/**
 * Security audit log (SOC 2 CC7.2 / CC6.1).
 *
 * An append-only record of security-relevant actions: who did what, from
 * where, and whether it succeeded. SOC 2 auditors expect this for
 * authentication events, access to sensitive data, privileged actions,
 * and data deletion. Distinct from `tilly_events` (product analytics) and
 * `debug_audit_log` (transient debug traces).
 *
 * Writes are fire-and-forget and NEVER throw into the request path — a
 * logging failure must not break a user action. Metadata is redacted of
 * secrets before storage. The table is created in migrate-boot.ts.
 */
import type { Request } from "express";
import { pool } from "../db";
import { redact } from "./redact";

export type AuditAction =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.logout"
  | "auth.signup"
  | "account.delete"
  | "plaid.link"
  | "plaid.disconnect"
  | "plaid.exchange.failure"
  | "admin.login.success"
  | "admin.login.failure"
  | "admin.action"
  | "passkey.register"
  | "passkey.verify"
  | "e2e.access"
  | "data.export";

export interface AuditInput {
  action: AuditAction;
  actorType: "user" | "admin" | "system" | "anonymous";
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  status?: "success" | "failure";
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Best-effort client IP honoring the proxy chain (Vercel sets XFF). */
export function clientIp(req: Request): string | null {
  const xff = req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.ip ?? null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    if (!pool) return;
    const meta = input.metadata ? redact(input.metadata) : null;
    await pool.query(
      `INSERT INTO "audit_log"
         ("action","actor_type","actor_id","target_type","target_id","status","ip","user_agent","metadata")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        input.action,
        input.actorType,
        input.actorId ?? null,
        input.targetType ?? null,
        input.targetId ?? null,
        input.status ?? "success",
        input.ip ?? null,
        input.userAgent ? String(input.userAgent).slice(0, 400) : null,
        meta ? JSON.stringify(meta) : null,
      ],
    );
  } catch (err) {
    // Never break the caller; surface for monitoring only.
    console.warn("[audit] write failed:", (err as Error)?.message);
  }
}

/** Convenience overload that pulls ip/userAgent from the request. */
export function auditFromReq(
  req: Request,
  input: Omit<AuditInput, "ip" | "userAgent">,
): Promise<void> {
  return writeAudit({
    ...input,
    ip: clientIp(req),
    userAgent: req.header("user-agent") ?? null,
  });
}
