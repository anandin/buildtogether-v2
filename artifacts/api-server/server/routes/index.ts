/**
 * BuildTogether V2 — Tilly student-edition feature routers.
 *
 * The legacy V1 monolith lives in `server/routes.ts` (still mounted via
 * `registerRoutes(app)`). New endpoints introduced for the student-edition
 * pivot mount through `registerTillyRoutes(app)` so they live in a clean
 * folder structure from day one. Phase 1c progressively migrates V1 routes
 * here; nothing in this folder should depend on `server/routes.ts`.
 *
 * All handlers in this folder are stubs (501 Not Implemented) until Phase 2
 * fills them with real logic.
 */
import type { Express } from "express";

import { mountTillyChatRoutes } from "./tilly/chat";
import { mountTillyAnalyseRoutes } from "./tilly/analyse";
import { mountTillyMemoryRoutes } from "./tilly/memory";
import { mountTillyInsightsRoutes } from "./tilly/insights";
import { mountTillyQuestionsRoutes } from "./tilly/questions";
import { mountScoutRoutes } from "./tilly/scout";
import { mountDreamsRoutes } from "./dreams";
import { mountSubscriptionsRoutes } from "./subscriptions";
import { mountProtectionsRoutes } from "./protections";
import { mountHouseholdRoutes } from "./household";
import { mountAdminTillyRoutes } from "./admin-tilly";
import { mountAdminPage } from "./admin-page";
import { mountAdminMemoryRoutes } from "./admin-memory";
import { mountAdminCostRoutes } from "./admin-cost";
import { mountAdminUsersRoutes } from "./admin-users";
import { mountAdminPlaidRoutes } from "./admin-plaid";
import { mountCronRoutes } from "./cron";
import { mountSplitsRoutes } from "./splits";
import { registerUserPrefsRoutes } from "./user-prefs";
import { mountPushRoutes } from "./push";
import { mountExpensesRoutes } from "./expenses";
import { mountInvitesRoutes } from "./invites";
import { mountDemoRoutes } from "./demo";
import { mountPasskeyRoutes, mountPasskeyDevRoutes } from "./passkey";
import { mountE2ERoutes } from "./e2e";
import { mountWatchlistRoutes } from "./watchlist";

export function registerTillyRoutes(app: Express): void {
  mountPasskeyRoutes(app);
  mountHouseholdRoutes(app);
  mountTillyChatRoutes(app);
  mountTillyAnalyseRoutes(app);
  mountTillyMemoryRoutes(app);
  mountTillyInsightsRoutes(app);
  mountTillyQuestionsRoutes(app);
  mountScoutRoutes(app);
  mountDreamsRoutes(app);
  mountSubscriptionsRoutes(app);
  mountProtectionsRoutes(app);
  mountAdminTillyRoutes(app);
  mountAdminMemoryRoutes(app);
  mountAdminCostRoutes(app);
  mountAdminUsersRoutes(app);
  mountAdminPlaidRoutes(app);
  mountAdminPage(app);
  mountCronRoutes(app);
  mountSplitsRoutes(app);
  registerUserPrefsRoutes(app);
  mountPushRoutes(app);
  mountExpensesRoutes(app);
  mountInvitesRoutes(app);
  mountWatchlistRoutes(app);
  // E2E session-issuer — mounts only when E2E_SECRET + E2E_USER_ID are
  // set. Self-gates via header secret check. Lets the smoke suite mint
  // its own Bearer token instead of relying on a stale captured cookie.
  mountE2ERoutes(app);
  // Demo routes (POST /api/demo/seed, /api/demo/clear, /api/demo/connect-plaid-sandbox)
  // are auth-gated but let any user wipe + re-seed their own data. Useful for
  // QA / staging, dangerous in production. Mount only in non-prod environments.
  if (process.env.NODE_ENV !== "production") {
    mountDemoRoutes(app);
    mountPasskeyDevRoutes(app);
    console.log("[routes] demo + passkey-dev routes mounted (NODE_ENV != production)");
  } else {
    console.log("[routes] demo + passkey-dev routes SKIPPED (NODE_ENV == production)");
  }
}
