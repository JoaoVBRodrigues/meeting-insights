import type pg from 'pg';

function databaseTarget(value: string) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('Use uma URL PostgreSQL para o banco de testes.');
  const hostname = url.searchParams.get('host') || url.hostname;
  const host = ['localhost', '127.0.0.1', '[::1]'].includes(hostname) ? 'loopback' : hostname;
  return {
    database: decodeURIComponent(url.pathname.slice(1)),
    endpoint: `${host}:${url.searchParams.get('port') || url.port || '5432'}`,
  };
}

export function requireTestDatabaseUrl(
  testUrl: string | undefined,
  developmentUrl?: string,
): string {
  if (!testUrl) throw new Error('TEST_DATABASE_URL obrigatório. Nenhuma limpeza executada.');
  const target = databaseTarget(testUrl);
  if (!target.database.endsWith('_test'))
    throw new Error('O banco de testes deve terminar em _test. Nenhuma limpeza executada.');
  if (developmentUrl) {
    const development = databaseTarget(developmentUrl);
    if (target.endpoint === development.endpoint && target.database === development.database)
      throw new Error('TEST_DATABASE_URL precisa apontar para um banco diferente de DATABASE_URL.');
  }
  return testUrl;
}

export async function assertConnectedTestDatabase(pool: pg.Pool): Promise<void> {
  const result = await pool.query<{ database: string }>('SELECT current_database() AS database');
  if (!result.rows[0]?.database.endsWith('_test'))
    throw new Error('O banco conectado não termina em _test. Nenhuma limpeza executada.');
}
