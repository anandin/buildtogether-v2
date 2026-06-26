/**
 * Secret redaction for logs / error reporting (SOC 2 CC6.1, CC7.2).
 *
 * Financial-app logs must never carry bank tokens, session bearers, API
 * keys, or full account numbers — once they ship to a log sink they're
 * queryable, indexed, and outside our trust boundary. These helpers scrub
 * known-sensitive keys and token-shaped strings before anything is logged.
 */

const SENSITIVE_KEY = /(access[_-]?token|public[_-]?token|refresh[_-]?token|secret|password|passwd|authorization|api[_-]?key|client[_-]?secret|cron[_-]?secret|session|bearer|cookie|private[_-]?key|expo[_-]?push[_-]?token|account[_-]?number|routing[_-]?number|ssn)/i;

// Token-shaped strings to mask even when they appear as bare values.
const TOKEN_PATTERNS: Array<[RegExp, string]> = [
  [/access-(sandbox|development|production)-[0-9a-zA-Z-]+/g, "access-***"],
  [/public-(sandbox|development|production)-[0-9a-zA-Z-]+/g, "public-***"],
  [/sk-or-v1-[a-f0-9]{16,}/g, "sk-or-***"], // specific OpenRouter key first
  [/sk-[a-zA-Z0-9-]{12,}/g, "sk-***"],
  [/ghp_[A-Za-z0-9]{20,}/g, "ghp_***"],
  [/vcp_[A-Za-z0-9]{20,}/g, "vcp_***"],
  [/tvly-[a-zA-Z0-9-]{12,}/g, "tvly-***"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "<jwt>"],
  [/\b\d{12,19}\b/g, "<card-or-acct>"], // long digit runs (PAN/account)
];

function scrubString(s: string): string {
  let out = s;
  for (const [re, rep] of TOKEN_PATTERNS) out = out.replace(re, rep);
  return out;
}

/**
 * Deep-clone a value with sensitive keys masked and token-shaped strings
 * scrubbed. Safe to pass arbitrary error/response objects. Caps recursion
 * depth so a circular or huge object can't blow the stack.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[redacted-depth]";
  if (value == null) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: scrubString(value.message) };
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = "***";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return "[unloggable]";
}

/** Convenience: redact then stringify for a single log line. */
export function redactToString(value: unknown): string {
  try {
    return typeof value === "string"
      ? scrubString(value)
      : JSON.stringify(redact(value));
  } catch {
    return "[unserializable]";
  }
}
