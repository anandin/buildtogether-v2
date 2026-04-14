/**
 * Database connection with dual-mode support:
 * - On Vercel (serverless): uses @neondatabase/serverless driver via HTTP
 * - Locally: uses node-postgres with connection pooling
 *
 * Both modes expose the same `db` (Drizzle) interface.
 */
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isServerless = !!process.env.VERCEL || !!process.env.VERCEL_ENV;

let db: any;
let pool: any;

if (isServerless) {
  const { neon, neonConfig } = require("@neondatabase/serverless");
  const { drizzle } = require("drizzle-orm/neon-http");
  neonConfig.fetchConnectionCache = true;
  const sql = neon(process.env.DATABASE_URL);
  db = drizzle(sql, { schema });
  pool = null;
} else {
  const pg = require("pg");
  const { drizzle } = require("drizzle-orm/node-postgres");
  const { Pool } = pg;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
}

export { db, pool };
