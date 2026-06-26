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
  // Force SSL for hosted Postgres (Supabase/Neon require TLS) and VERIFY
  // the server certificate so a MITM can't intercept the connection that
  // carries every secret we hold. Neon/Supabase present publicly-trusted
  // certs, so verification works against Node's built-in CA store.
  // Escape hatch: set DATABASE_SSL_NO_VERIFY=1 only if a specific pooler
  // endpoint presents an untrusted chain (documented exception).
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: process.env.DATABASE_SSL_NO_VERIFY !== "1" },
});

export const db = drizzle(pool, { schema });
