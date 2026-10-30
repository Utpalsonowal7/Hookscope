import { readFile } from 'node:fs/promises';
import { createPool } from './db.js';
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(872134)');
    await client.query(await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
if (process.argv[1]?.endsWith('/migrate.js')) {
  const pool = createPool(process.env.DATABASE_URL);
  try { await migrate(pool); console.log('Database schema ready'); } finally { await pool.end(); }
}
