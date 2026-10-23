import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createPool } from './db.js';
export async function migrate(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(703821)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const applied = await client.query('SELECT version FROM schema_migrations WHERE version=1');
    if (!applied.rowCount) {
      await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
      await client.query('INSERT INTO schema_migrations(version) VALUES(1)');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = createPool();
  try {
    await migrate(pool);
    console.log('Migrations aplicadas.');
  } finally {
    await pool.end();
  }
}
