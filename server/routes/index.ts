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
import { mountTillyMemoryRoutes } from "./tilly/memory";
import { mountTillyInsightsRoutes } from "./tilly/insights";
import { mountDreamsRoutes } from "./dreams";
import { mountSubscriptionsRoutes } from "./subscriptions";
import { mountProtectionsRoutes } from "./protections";
import { mountHouseholdRoutes } from "./household";
import { mountAdminTillyRoutes } from "./admin-tilly";
import { mountAdminPage } from "./admin-page";
import { mountCronRoutes } from "./cron";

export function registerTillyRoutes(app: Express): void {
  mountHouseholdRoutes(app);
  mountTillyChatRoutes(app);
  mountTillyMemoryRoutes(app);
  mountTillyInsightsRoutes(app);
  mountDreamsRoutes(app);
  mountSubscriptionsRoutes(app);
  mountProtectionsRoutes(app);
  mountAdminTillyRoutes(app);
  mountAdminPage(app);
  mountCronRoutes(app);
}
