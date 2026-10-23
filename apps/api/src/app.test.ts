import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';
import { referenceDate } from './config.js';
import { importMeetings } from './importer.js';
import type { ImportBatch } from './validation.js';
import { assertConnectedTestDatabase, requireTestDatabaseUrl } from './test-db-guard.js';
const testUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const pool = createPool(testUrl);
const app = createApp(pool, { now: () => new Date('2026-10-22T12:00:00Z') });
const demo: ImportBatch = JSON.parse(
  await readFile(new URL('../../../fixtures/demo-meetings.json', import.meta.url), 'utf8'),
);
const batch = () => structuredClone(demo);
beforeAll(async () => {
  await assertConnectedTestDatabase(pool);
  await migrate(pool);
}, 30000);
beforeEach(async () => {
  await assertConnectedTestDatabase(pool);
  await pool.query('TRUNCATE meetings CASCADE');
});
afterAll(async () => {
  await pool.end();
});
describe('API real com PostgreSQL isolado', () => {
  it('rejeita início com fuso inválido ou ano zero sem gravar o lote', async () => {
    for (const startedAt of [
      '2026-10-22T12:00:00+99:99',
      '2026-10-22T12:00:00+24:00',
      '2026-10-22T12:00:00+16:00',
      '0000-01-01T00:00:00Z',
    ]) {
      const invalid = batch();
      invalid.meetings[1].startedAt = startedAt;
      const response = await request(app).post('/api/imports').send(invalid);
      expect(response.status).toBe(400);
      expect(response.body.error.fields['meetings.1.startedAt']).toBeTruthy();
    }
    expect((await pool.query('SELECT count(*)::int AS n FROM meetings')).rows[0].n).toBe(0);
  });

  it('rejeita ano zero nos prazos e filtros de calendário', async () => {
    const invalid = batch();
    invalid.meetings[0].actions[0].dueDate = '0000-01-01';
    const response = await request(app).post('/api/imports').send(invalid);
    expect(response.status).toBe(400);
    expect(response.body.error.fields['meetings.0.actions.0.dueDate']).toBeTruthy();
    expect((await request(app).get('/api/meetings?from=0000-01-01')).status).toBe(400);
    await request(app).post('/api/imports').send(batch());
    const actions = await request(app).get('/api/actions');
    expect(
      (
        await request(app)
          .patch(`/api/actions/${actions.body.items[0].id}`)
          .send({ dueDate: '0000-01-01' })
      ).status,
    ).toBe(400);
  });

  it('seed repetível preserva ações editadas sem duplicação', async () => {
    expect(await importMeetings(pool, batch(), true)).toEqual({ meetingCount: 3, actionCount: 8 });
    await pool.query('UPDATE actions SET owner=$1 WHERE title=$2', [
      'Pessoa de exemplo',
      'Preparar calendário editorial de novembro',
    ]);
    expect(await importMeetings(pool, batch(), true)).toEqual({ meetingCount: 0, actionCount: 0 });
    expect((await request(app).get('/api/actions?owner=Pessoa')).body.total).toBe(1);
  });
  it('verifica saúde e listas vazias', async () => {
    expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/api/meetings')).body).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
    });
  });
  it('importa lote válido, preserva transcrição e referências', async () => {
    const response = await request(app).post('/api/imports').send(batch());
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ meetingCount: 3, actionCount: 8 });
    const meetings = await request(app).get('/api/meetings');
    const detail = await request(app).get(`/api/meetings/${meetings.body.items[0].id}`);
    expect(detail.body.segments[1].id).toBe('editorial-02');
    expect(
      detail.body.actions.some(
        (a: { sourceSegmentId: string }) => a.sourceSegmentId === 'editorial-02',
      ),
    ).toBe(true);
  });
  it('rejeita JSON inválido, limite de upload e parâmetros', async () => {
    const invalid = await request(app)
      .post('/api/imports')
      .set('Content-Type', 'application/json')
      .send('{');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_JSON');
    expect(
      (
        await request(app)
          .post('/api/imports')
          .send({ text: 'x'.repeat(1024 * 1024) })
      ).status,
    ).toBe(413);
    expect((await request(app).get('/api/meetings?pageSize=100')).status).toBe(400);
    expect((await request(app).get('/api/actions?overdue=maybe')).status).toBe(400);
    expect((await request(app).get('/api/meetings?from=2026-02-30')).status).toBe(400);
  });
  it('informa campo inválido e rejeita referências sem escrita parcial', async () => {
    const invalid = batch();
    invalid.meetings[1].actions[0].sourceSegmentId = 'ausente';
    const response = await request(app).post('/api/imports').send(invalid);
    expect(response.status).toBe(400);
    expect(response.body.error.fields['meetings.1.actions.0.sourceSegmentId']).toBeTruthy();
    expect((await pool.query('SELECT count(*)::int AS n FROM meetings')).rows[0].n).toBe(0);
  });
  it('limita registros e rejeita identificadores repetidos dentro do lote', async () => {
    const invalid = batch();
    invalid.meetings[1].externalId = invalid.meetings[0].externalId;
    expect((await request(app).post('/api/imports').send(invalid)).status).toBe(400);
    const many = batch();
    many.meetings = Array.from({ length: 51 }, (_, i) => ({
      ...many.meetings[0],
      externalId: `m${i}`,
    }));
    expect((await request(app).post('/api/imports').send(many)).status).toBe(400);
  });
  it('duplicação em lote reverte inclusive reuniões anteriores novas', async () => {
    await request(app).post('/api/imports').send(batch());
    const conflicting = batch();
    conflicting.meetings[0].externalId = 'nova-antes-do-conflito';
    const response = await request(app).post('/api/imports').send(conflicting);
    expect(response.status).toBe(409);
    expect((await pool.query('SELECT count(*)::int AS n FROM meetings')).rows[0].n).toBe(3);
    expect(
      (await pool.query('SELECT id FROM meetings WHERE external_id=$1', ['nova-antes-do-conflito']))
        .rowCount,
    ).toBe(0);
  });
  it('combina filtros de reunião e paginação estável', async () => {
    await request(app).post('/api/imports').send(batch());
    const filtered = await request(app).get(
      '/api/meetings?q=editorial&from=2026-10-20&to=2026-10-22&pageSize=1',
    );
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0].externalId).toBe('demo-editorial-outubro');
    const page1 = await request(app).get('/api/meetings?pageSize=1');
    const page2 = await request(app).get('/api/meetings?pageSize=1&page=2');
    expect(page2.body.total).toBe(3);
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
    expect((await request(app).get('/api/meetings?q=%27%20OR%201%3D1')).body.total).toBe(0);
  });
  it('combina responsável, status e atraso sem incluir concluídas', async () => {
    await request(app).post('/api/imports').send(batch());
    const response = await request(app).get(
      '/api/actions?owner=lia&status=pending&overdue=true&pageSize=1',
    );
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].owner).toBe('Lia Rocha');
    expect(response.body.items[0].overdue).toBe(true);
    expect((await request(app).get('/api/actions?overdue=true')).body.total).toBe(2);
    expect(
      (await request(app).get('/api/actions?owner=Caio&status=done&overdue=false')).body.total,
    ).toBe(1);
  });
  it('atualiza persistentemente responsável, prazo calendário e status', async () => {
    await request(app).post('/api/imports').send(batch());
    const actions = await request(app).get('/api/actions');
    const id = actions.body.items[0].id;
    const response = await request(app)
      .patch(`/api/actions/${id}`)
      .send({ owner: 'Pessoa de exemplo', dueDate: '2026-10-22', status: 'in_progress' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      owner: 'Pessoa de exemplo',
      dueDate: '2026-10-22',
      status: 'in_progress',
      overdue: false,
    });
    const persisted = await pool.query('SELECT owner,due_date,status FROM actions WHERE id=$1', [
      id,
    ]);
    expect(persisted.rows[0]).toEqual({
      owner: 'Pessoa de exemplo',
      due_date: '2026-10-22',
      status: 'in_progress',
    });
    expect((await request(app).get('/api/actions?owner=Pessoa')).body.total).toBe(1);
    expect(
      (await request(app).patch(`/api/actions/${id}`).send({ dueDate: null })).body.dueDate,
    ).toBeNull();
    expect(
      (await request(app).patch(`/api/actions/${id}`).send({ status: 'unknown' })).status,
    ).toBe(400);
  });
  it('retorna inexistência padronizada e rejeita id inválido', async () => {
    expect((await request(app).get(`/api/meetings/${randomUUID()}`)).status).toBe(404);
    expect(
      (await request(app).patch(`/api/actions/${randomUUID()}`).send({ status: 'done' })).body.error
        .code,
    ).toBe('NOT_FOUND');
    expect((await request(app).get('/api/meetings/invalid')).status).toBe(400);
  });
  it('calcula indicadores globais e data de referência em São Paulo', async () => {
    await request(app).post('/api/imports').send(batch());
    const response = await request(app).get('/api/summary');
    expect(response.body).toEqual({
      meetingCount: 3,
      actionCount: 8,
      openCount: 6,
      overdueCount: 2,
      byStatus: { pending: 4, in_progress: 2, done: 2 },
      referenceDate: '2026-10-22',
      timeZone: 'America/Sao_Paulo',
    });
    expect(referenceDate(new Date('2026-10-22T01:00:00Z'))).toBe('2026-10-21');
  });
});
