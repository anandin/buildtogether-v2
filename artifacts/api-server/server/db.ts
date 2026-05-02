/**
 * Database connection — dual-mode for Vercel serverless + local dev.
 * Uses node-postgres with pool size 1 on serverless (Supabase/Neon pooler handles
 * the real pooling) and larger pool locally.
 */
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isServerless = !!process.env.VERCEL || !!process.env.VERCEL_ENV;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Serverless: small pool per instance, let the DB-side pooler do the work
  max: isServerless ? 1 : 10,
  // Close idle connections quickly in serverless to avoid exhausting the pooler
  idleTimeoutMillis: isServerless ? 5000 : 30000,
  // Force SSL for hosted Postgres (Supabase/Neon require TLS)
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
