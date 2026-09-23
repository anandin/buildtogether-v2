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
import { mountCommitmentRoutes } from "./commitments";
import { mountSubscriptionsRoutes } from "./subscriptions";
import { mountProtectionsRoutes } from "./protections";
import { mountHouseholdRoutes } from "./household";
import { mountAdminTillyRoutes } from "./admin-tilly";
import { mountAdminPage } from "./admin-page";
import { mountAdminMemoryRoutes } from "./admin-memory";
import { mountAdminSkillsRoutes } from "./admin-skills";
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
import { mountHabitRoutes } from "./habits";
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
  mountCommitmentRoutes(app);
  mountSubscriptionsRoutes(app);
  mountProtectionsRoutes(app);
  mountAdminTillyRoutes(app);
  mountAdminMemoryRoutes(app);
  mountAdminSkillsRoutes(app);
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
  mountHabitRoutes(app);
  // E2E session-issuer + debug endpoints. These mint real Bearer tokens
  // for a pinned user and expose financial-data debug dumps — a backdoor
  // that must NEVER exist on the production deployment (SOC 2 CC6.1). It
  // is gated to non-production environments by VERCEL_ENV (so it still
  // works on preview deploys for the smoke suite) AND self-gates on the
  // E2E_SECRET header. On Vercel, VERCEL_ENV is "production" only for the
  // production deployment; "preview"/"development"/undefined elsewhere.
  if (process.env.VERCEL_ENV !== "production") {
    mountE2ERoutes(app);
    console.log("[routes] e2e routes mounted (VERCEL_ENV != production)");
  } else {
    console.log("[routes] e2e routes SKIPPED (production)");
  }
  // Demo wipe/seed routes are a footgun: any signed-in user can erase
  // their household. Hard-closed on production (NODE_ENV or VERCEL_ENV)
  // and also inside mountDemoRoutes itself. Local/dev/preview only.
  const demoAllowed =
    process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production";
  if (demoAllowed) {
    mountDemoRoutes(app);
    mountPasskeyDevRoutes(app);
    console.log("[routes] demo + passkey-dev routes mounted (non-production)");
  } else {
    console.log("[routes] demo + passkey-dev routes SKIPPED (production)");
  }
}
