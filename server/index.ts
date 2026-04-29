import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { registerAdminRoutes } from "./admin-routes";
import { registerTillyRoutes } from "./routes/index";
import { requestId } from "./middleware/requestId";
import { pool } from "./db";
import { applyBootMigrations } from "./migrate-boot";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "50mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: "50mb" }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function setupHealthCheck(app: express.Application) {
  app.get("/api/health", async (_req, res) => {
    const started = Date.now();
    let dbOk = false;
    let dbLatency = -1;
    try {
      const t0 = Date.now();
      if (pool) {
        await pool.query("SELECT 1");
      }
      dbLatency = Date.now() - t0;
      dbOk = true;
    } catch (err: any) {
      // DB check failed; still return 200 so the function itself looks alive
    }
    res.json({
      status: dbOk ? "ok" : "degraded",
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev",
      env: process.env.VERCEL_ENV || "local",
      region: process.env.VERCEL_REGION || "local",
      db: { ok: dbOk, latencyMs: dbLatency },
      ai: {
        provider: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.includes("openrouter") ? "openrouter" : "openai",
        configured: !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      },
      uptimeMs: Math.round((Date.now() - (process as any)._startTime || 0)),
      durationMs: Date.now() - started,
    });
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use("/assets", express.static(path.resolve(process.cwd(), "server", "templates", "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  const webDistPath = path.resolve(process.cwd(), "dist");
  if (fs.existsSync(webDistPath)) {
    app.use("/_expo", express.static(path.join(webDistPath, "_expo")));
    const favicoPath = path.join(webDistPath, "favicon.ico");
    if (fs.existsSync(favicoPath)) {
      app.get("/favicon.ico", (_req: Request, res: Response) => {
        res.sendFile(favicoPath);
      });
    }
    app.use("/app", express.static(webDistPath));
    app.use("/app", (_req: Request, res: Response) => {
      res.sendFile(path.join(webDistPath, "index.html"));
    });
    log("Serving Expo web app at /app");
  }

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

// Configure app synchronously so it can be imported by serverless handlers
// without calling .listen() at module load time.
let appConfigured = false;
let appReady: Promise<express.Application> | null = null;

export async function getApp(): Promise<express.Application> {
  if (appConfigured) return app;
  if (appReady) return appReady;

  appReady = (async () => {
    setupCors(app);
    setupBodyParsing(app);
    app.use(requestId); // attach request id + structured logger early
    setupRequestLogging(app);
    setupHealthCheck(app);
    // Apply hand-written migrations (drizzle-kit push misses some seed +
    // ALTER cases on Vercel cold starts). Idempotent — safe to run on
    // every cold start. Best-effort; logs failures but never blocks boot.
    try {
      await applyBootMigrations();
    } catch (err) {
      console.error("[boot] migration runner errored (non-fatal):", err);
    }
    configureExpoAndLanding(app);
    registerAdminRoutes(app);
    // Tilly student-edition routers MUST mount before the legacy V1 routes:
    // V1 declares `app.post("/api/expenses/:coupleId")` which Express
    // matches greedily, swallowing `/api/expenses/voice` and
    // `/api/expenses/photo` (it treats `voice`/`photo` as the coupleId
    // and then `requireCoupleAccess` rejects them with 403). The student
    // edition is the canonical surface — V1 only needs to win for paths
    // V2 doesn't define.
    registerTillyRoutes(app);
    await registerRoutes(app);
    setupErrorHandler(app);
    appConfigured = true;
    return app;
  })();

  return appReady;
}

// Standalone server entry (used by `npm run server:dev` / `server:prod`)
// On Vercel, api/index.ts imports getApp() instead.
if (process.env.VERCEL !== "1" && !process.env.VERCEL_ENV) {
  (async () => {
    await getApp();
    const { createServer } = await import("node:http");
    const server = createServer(app);
    const port = parseInt(process.env.PORT || "5000", 10);
    server.listen(
      { port, host: "0.0.0.0", reusePort: true },
      () => log(`express server serving on port ${port}`),
    );
  })();
}
