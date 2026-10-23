import { readFile } from 'node:fs/promises';
import { createPool } from './db.js';
import { importMeetings } from './importer.js';
import { migrate } from './migrate.js';
const pool = createPool();
try {
  await migrate(pool);
  const data = JSON.parse(
    await readFile(new URL('../../../fixtures/demo-meetings.json', import.meta.url), 'utf8'),
  );
  console.log(await importMeetings(pool, data, true));
} finally {
  await pool.end();
}
