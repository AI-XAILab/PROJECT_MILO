import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

type MigrationVerification = {
  vector_version: string | null;
  documents_exists: boolean;
  document_chunks_exists: boolean;
  embedding_type: string | null;
  indexes: string[];
};

async function main() {
  loadEnvConfig(process.cwd());

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const pool = new Pool({ connectionString });

  try {
    const migrationPath = resolve(process.cwd(), "db/migrations/001_create_rag_schema.sql");
    const migration = await readFile(migrationPath, "utf8");
    await pool.query(migration);

    const { rows: [verification] } = await pool.query<MigrationVerification>(`
      SELECT
        (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS vector_version,
        to_regclass('public.documents') IS NOT NULL AS documents_exists,
        to_regclass('public.document_chunks') IS NOT NULL AS document_chunks_exists,
        (
          SELECT format_type(atttypid, atttypmod)
          FROM pg_attribute
          WHERE attrelid = to_regclass('public.document_chunks')
            AND attname = 'embedding'
            AND NOT attisdropped
        ) AS embedding_type,
        ARRAY(
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename IN ('documents', 'document_chunks')
          ORDER BY indexname
        ) AS indexes
    `);

    if (
      !verification?.vector_version ||
      !verification.documents_exists ||
      !verification.document_chunks_exists ||
      verification.embedding_type !== "vector(1536)"
    ) {
      throw new Error("Database migration verification failed.");
    }

    console.log(JSON.stringify(verification, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Database migration failed.");
  process.exitCode = 1;
});