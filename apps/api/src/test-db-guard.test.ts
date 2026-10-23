import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { assertConnectedTestDatabase, requireTestDatabaseUrl } from './test-db-guard.js';

describe('proteção do banco de integração', () => {
  it('rejeita URL ausente, banco sem sufixo e protocolo socket com db divergente', () => {
    for (const url of [undefined, 'postgres://localhost/pauta', 'socket:/pauta_test?db=pauta'])
      expect(() => requireTestDatabaseUrl(url)).toThrow();
  });

  it('compara destino normalizado, ignorando credenciais e grafia da URL', () => {
    expect(() =>
      requireTestDatabaseUrl(
        'postgres://test:secret@127.0.0.1:5432/pauta_test?application_name=tests',
        'postgresql://dev:secret@localhost/pauta_test',
      ),
    ).toThrow(/diferente/);
    expect(
      requireTestDatabaseUrl('postgres://localhost/pauta_test', 'postgres://localhost/pauta'),
    ).toBe('postgres://localhost/pauta_test');
  });

  it('confere o banco realmente conectado antes de permitir operações destrutivas', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ database: 'pauta' }] });
    const pool = { query } as unknown as pg.Pool;
    await expect(assertConnectedTestDatabase(pool)).rejects.toThrow(/não termina/);
    expect(query).toHaveBeenCalledExactlyOnceWith('SELECT current_database() AS database');
    query.mockResolvedValue({ rows: [{ database: 'pauta_test' }] });
    await expect(assertConnectedTestDatabase(pool)).resolves.toBeUndefined();
  });
});
