/**
 * Lightweight error/event reporter. Wraps Sentry when @sentry/node is
 * installed (`npm install @sentry/node` + set SENTRY_DSN), falls back to
 * structured console output otherwise.
 *
 * Use:
 *   reportError(err, { route: "/api/tilly/chat", userId })
 *   reportEvent("plaid_connected", { userId, institution })
 *
 * Why not a hard dep on @sentry/node? Adding the package balloons the
 * Vercel deploy bundle and forces us to ship sourcemaps from day one. By
 * gating on dynamic import we get to enable Sentry the day we want it
 * without a code change.
 */
type Ctx = Record<string, unknown>;

let _sentry: any = null;
let _sentryAttempted = false;

async function maybeLoadSentry(): Promise<any> {
  if (_sentryAttempted) return _sentry;
  _sentryAttempted = true;
  if (!process.env.SENTRY_DSN) return null;
  try {
    // @ts-ignore — optional dep, may not exist
    const mod = await import("@sentry/node");
    mod.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? "development",
      tracesSampleRate: 0.1,
    });
    _sentry = mod;
    return _sentry;
  } catch {
    return null;
  }
}

export async function reportError(err: unknown, ctx: Ctx = {}): Promise<void> {
  const sentry = await maybeLoadSentry();
  if (sentry) {
    sentry.withScope((s: any) => {
      for (const [k, v] of Object.entries(ctx)) s.setExtra(k, v);
      sentry.captureException(err);
    });
    return;
  }
  // Fallback: structured console — Vercel Logs ingests these.
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      msg: err instanceof Error ? err.message : String(err),
      stack,
      ctx,
      ts: new Date().toISOString(),
    }),
  );
}

export async function reportEvent(name: string, ctx: Ctx = {}): Promise<void> {
  const sentry = await maybeLoadSentry();
  if (sentry) {
    sentry.captureMessage(name, "info");
    return;
  }
  console.log(
    JSON.stringify({ level: "info", msg: name, ctx, ts: new Date().toISOString() }),
  );
}
