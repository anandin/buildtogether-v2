/**
 * Security response headers (SOC 2 CC6.6 / OWASP Secure Headers).
 *
 * No `helmet` dependency — the set we need is small and explicit is
 * clearer than a config object. Applied to every response early in the
 * chain.
 *
 * - HSTS: force HTTPS for a year incl. subdomains (Vercel serves TLS).
 * - X-Content-Type-Options: stop MIME sniffing.
 * - X-Frame-Options + frame-ancestors: clickjacking defense.
 * - Referrer-Policy: don't leak full URLs cross-origin.
 * - Permissions-Policy: deny powerful features by default.
 * - CSP: this server is a JSON API plus a static landing page; a strict
 *   default-src 'self' with the few inline allowances the landing page
 *   needs. API JSON responses are unaffected by CSP, but sending it
 *   hardens the landing/admin HTML against injected script.
 */
import type { Request, Response, NextFunction } from "express";

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https:",
  "font-src 'self' data:",
  "form-action 'self'",
].join("; ");

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // HSTS only over HTTPS (don't send on plain-HTTP local dev).
  const proto = req.header("x-forwarded-proto") || req.protocol;
  if (proto === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  // CSP for HTML surfaces; harmless on JSON responses.
  res.setHeader("Content-Security-Policy", CSP);
  // Remove the framework fingerprint.
  res.removeHeader("X-Powered-By");
  next();
}
