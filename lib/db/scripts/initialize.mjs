import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pg from "pg";

const migrationsDirectory = new URL("../migrations/", import.meta.url);

/**
 * Create the application schema on a NEW database only.
 * Existing databases are validated, never reset or automatically altered.
 */
export async function initializeSchema(pool, { schema = "public" } = {}) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid schema name");
  const journal = JSON.parse(await readFile(new URL("meta/_journal.json", migrationsDirectory), "utf8"));
  const latest = journal.entries.at(-1);
  if (!latest) throw new Error("No database migration is available");
  const snapshot = JSON.parse(await readFile(
    new URL(`meta/${String(latest.idx).padStart(4, "0")}_snapshot.json`, migrationsDirectory), "utf8",
  ));
  const tables = Object.values(snapshot.tables);
  const names = tables.map(table => table.name);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`dreamteam:initialize:${schema}`]);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    const existing = await client.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = ANY($2::text[])",
      [schema, names],
    );
    if (existing.rows.length) {
      const columns = new Set(existing.rows.map(row => `${row.table_name}.${row.column_name}`));
      const missing = tables.flatMap(table => Object.keys(table.columns)
        .filter(name => !columns.has(`${table.name}.${name}`))
        .map(name => `${table.name}.${name}`));
      if (missing.length) {
        throw new Error(`Existing database schema is incomplete (${missing.join(", ")}). Apply a reviewed migration. No existing data was changed.`);
      }
      await client.query("COMMIT");
      return { created: false, tables: names.length };
    }
    for (const entry of journal.entries) {
      const sql = await readFile(new URL(`${entry.tag}.sql`, migrationsDirectory), "utf8");
      await client.query(sql.replaceAll('"public".', `"${schema}".`));
    }
    await client.query("COMMIT");
    return { created: true, tables: names.length };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required before starting the API.");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
  try {
    const result = await initializeSchema(pool);
    console.log(result.created
      ? `Database initialized: ${result.tables} application tables created; no existing data deleted.`
      : "Database schema verified; existing data preserved.");
  } finally { await pool.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error("Database initialization failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  });
}
