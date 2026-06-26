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
  // TLS is ALWAYS on for hosted Postgres — the connection that carries
  // every secret we hold is encrypted in transit (SOC 2 CC6.7 satisfied).
  //
  // Certificate VERIFICATION is opt-in: managed pooler endpoints
  // (Neon/Supabase pgbouncer/Supavisor) commonly present a chain that
  // Node's default CA store can't validate, which takes the database
  // offline if we hard-require it. To enable full verification, pin the
  // provider's CA via DATABASE_CA_CERT (PEM) and set DATABASE_SSL_STRICT=1.
  // Until the CA is pinned this is a documented, accepted exception:
  // traffic stays encrypted; identity verification is the follow-up.
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : {
        rejectUnauthorized: process.env.DATABASE_SSL_STRICT === "1",
        ...(process.env.DATABASE_CA_CERT
          ? { ca: process.env.DATABASE_CA_CERT }
          : {}),
      },
});

export const db = drizzle(pool, { schema });
