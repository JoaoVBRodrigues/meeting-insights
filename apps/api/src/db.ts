import './config.js';
import pg from 'pg';
pg.types.setTypeParser(1082, (value: string) => value);
export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('Configure DATABASE_URL no .env da raiz.');
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 10000,
  });
}
