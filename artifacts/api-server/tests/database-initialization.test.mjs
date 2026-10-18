import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { initializeSchema } from "../../../lib/db/scripts/initialize.mjs";
const requireDb = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");

async function fixture(run) {
  const schema = `test_bootstrap_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await run(pool, schema);
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
}

test("fresh database initialization creates all tables and preserves existing accounts on repeat", { skip: !process.env.DATABASE_URL }, async () => {
  await fixture(async (pool, schema) => {
    assert.deepEqual(await initializeSchema(pool, { schema }), { created: true, tables: 7 });
    await pool.query(`INSERT INTO "${schema}".dream_users(discord_id,username,site_role) VALUES('fixture-id','Fixture','ADMIN_PLUS')`);
    assert.deepEqual(await initializeSchema(pool, { schema }), { created: false, tables: 7 });
    const user = (await pool.query(`SELECT username,site_role FROM "${schema}".dream_users`)).rows;
    assert.deepEqual(user, [{ username: "Fixture", site_role: "ADMIN_PLUS" }]);
    const foreignKey = await pool.query(`INSERT INTO "${schema}".dream_voice_sessions(discord_id,channel_id,started_at) VALUES('fixture-id','fixture-channel',now()) RETURNING id`);
    assert.equal(foreignKey.rowCount, 1);
  });
});

test("concurrent initializers serialize safely without duplicate tables", { skip: !process.env.DATABASE_URL }, async () => {
  await fixture(async (pool, schema) => {
    const results = await Promise.all([initializeSchema(pool, { schema }), initializeSchema(pool, { schema })]);
    assert.equal(results.filter(result => result.created).length, 1);
  });
});

test("partial existing schemas fail explicitly and are never reset", { skip: !process.env.DATABASE_URL }, async () => {
  await fixture(async (pool, schema) => {
    await pool.query(`CREATE TABLE "${schema}".dream_users(discord_id text PRIMARY KEY)`);
    await pool.query(`INSERT INTO "${schema}".dream_users VALUES('preserve-fixture')`);
    await assert.rejects(initializeSchema(pool, { schema }), /Existing database schema is incomplete/);
    assert.equal((await pool.query(`SELECT discord_id FROM "${schema}".dream_users`)).rows[0].discord_id, "preserve-fixture");
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1", [schema]);
    assert.equal(tables.rowCount, 1);
  });
});
