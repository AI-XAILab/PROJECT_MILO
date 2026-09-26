import "server-only";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
}

const globalForPostgres = globalThis as typeof globalThis & {
  miloPostgresPool?: Pool;
};

export const pool = globalForPostgres.miloPostgresPool ?? new Pool({ connectionString });

if (process.env.NODE_ENV !== "production") {
  globalForPostgres.miloPostgresPool = pool;
}