import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { ZodError } from 'zod';
import { referenceDate, timeZone } from './config.js';
import { actionPatch, actionQuery, idSchema, meetingQuery } from './validation.js';
import { importMeetings } from './importer.js';
const meetingSelect = `m.id,m.external_id AS "externalId",m.title,m.started_at AS "startedAt",m.participants,m.topics,(SELECT count(*)::int FROM actions a WHERE a.meeting_id=m.id) AS "actionCount"`;
const actionSelect = `a.id,a.meeting_id AS "meetingId",m.title AS "meetingTitle",a.title,a.owner,a.due_date AS "dueDate",a.status,a.source_segment_id AS "sourceSegmentId",(a.due_date < $1::date AND a.status <> 'done') IS TRUE AS overdue`;
class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function createApp(
  pool: pg.Pool,
  options: {
    now?: () => Date;
    corsOrigin?: string;
  } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const started = Date.now();
    res.on('finish', () => {
      if (process.env.NODE_ENV !== 'test')
        console.log(
          JSON.stringify({
            requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: Date.now() - started,
          }),
        );
    });
    next();
  });
  app.use(
    cors({
      origin: options.corsOrigin ?? process.env.CORS_ORIGIN ?? 'http://localhost:5178',
      methods: ['GET', 'POST', 'PATCH'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  const today = () => referenceDate(options.now?.());
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      throw new HttpError(
        503,
        'DATABASE_UNAVAILABLE',
        'Banco de dados indisponível. Tente novamente.',
      );
    }
  });
  app.post('/api/imports', async (req, res) => {
    if (!req.is('application/json'))
      throw new HttpError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Envie JSON com Content-Type application/json.',
      );
    res.status(201).json(await importMeetings(pool, req.body));
  });
  app.get('/api/meetings', async (req, res) => {
    const { page, pageSize, q, from, to } = meetingQuery.parse(req.query);
    const values: unknown[] = [];
    const where: string[] = [];
    if (q) {
      values.push(q);
      where.push(`strpos(lower(m.title),lower($${values.length}))>0`);
    }
    if (from) {
      values.push(from);
      where.push(
        `(m.started_at AT TIME ZONE 'America/Sao_Paulo')::date >= $${values.length}::date`,
      );
    }
    if (to) {
      values.push(to);
      where.push(
        `(m.started_at AT TIME ZONE 'America/Sao_Paulo')::date <= $${values.length}::date`,
      );
    }
    const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await pool.query(
      `SELECT count(*)::int AS total FROM meetings m ${condition}`,
      values,
    );
    values.push(pageSize, (page - 1) * pageSize);
    const rows = await pool.query(
      `SELECT ${meetingSelect} FROM meetings m ${condition} ORDER BY m.started_at DESC,m.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    res.json({ items: rows.rows, total: total.rows[0].total, page, pageSize });
  });
  app.get('/api/meetings/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const meeting = await pool.query(`SELECT ${meetingSelect} FROM meetings m WHERE m.id=$1`, [id]);
    if (!meeting.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Reunião não encontrada.');
    const segments = await pool.query(
      'SELECT id,speaker,at,text FROM segments WHERE meeting_id=$1 ORDER BY position',
      [id],
    );
    const actions = await pool.query(
      `SELECT ${actionSelect} FROM actions a JOIN meetings m ON m.id=a.meeting_id WHERE a.meeting_id=$2 ORDER BY a.id`,
      [today(), id],
    );
    res.json({ ...meeting.rows[0], segments: segments.rows, actions: actions.rows });
  });
  app.get('/api/actions', async (req, res) => {
    const { page, pageSize, owner, status, overdue } = actionQuery.parse(req.query);
    const values: unknown[] = [today()];
    const where: string[] = [];
    if (owner) {
      values.push(owner);
      where.push(`strpos(lower(a.owner),lower($${values.length}))>0`);
    }
    if (status) {
      values.push(status);
      where.push(`a.status=$${values.length}`);
    }
    if (overdue)
      where.push(
        `((a.due_date < $1::date AND a.status <> 'done') IS TRUE) = ${overdue === 'true' ? 'TRUE' : 'FALSE'}`,
      );
    const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await pool.query(
      `SELECT count(*)::int AS total FROM actions a WHERE $1::date IS NOT NULL ${where.length ? `AND ${where.join(' AND ')}` : ''}`,
      values,
    );
    values.push(pageSize, (page - 1) * pageSize);
    const rows = await pool.query(
      `SELECT ${actionSelect} FROM actions a JOIN meetings m ON m.id=a.meeting_id ${condition} ORDER BY a.due_date ASC NULLS LAST,a.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    res.json({ items: rows.rows, total: total.rows[0].total, page, pageSize });
  });
  app.patch('/api/actions/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const patch = actionPatch.parse(req.body);
    const values: unknown[] = [id];
    const sets: string[] = [];
    for (const [key, column] of [
      ['owner', 'owner'],
      ['dueDate', 'due_date'],
      ['status', 'status'],
    ] as const)
      if (key in patch) {
        values.push(patch[key]);
        sets.push(`${column}=$${values.length}`);
      }
    const updated = await pool.query(
      `UPDATE actions SET ${sets.join(',')} WHERE id=$1 RETURNING id`,
      values,
    );
    if (!updated.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Ação não encontrada.');
    const row = await pool.query(
      `SELECT ${actionSelect} FROM actions a JOIN meetings m ON m.id=a.meeting_id WHERE a.id=$2`,
      [today(), id],
    );
    res.json(row.rows[0]);
  });
  app.get('/api/summary', async (_req, res) => {
    const reference = today();
    const counts = await pool.query(
      `SELECT count(*)::int AS "actionCount",count(*) FILTER(WHERE status <> 'done')::int AS "openCount",count(*) FILTER(WHERE due_date < $1::date AND status <> 'done')::int AS "overdueCount",count(*) FILTER(WHERE status='pending')::int AS pending,count(*) FILTER(WHERE status='in_progress')::int AS in_progress,count(*) FILTER(WHERE status='done')::int AS done FROM actions`,
      [reference],
    );
    const meetings = await pool.query('SELECT count(*)::int AS count FROM meetings');
    const { pending, in_progress, done, ...totals } = counts.rows[0];
    res.json({
      ...totals,
      meetingCount: meetings.rows[0].count,
      byStatus: { pending, in_progress, done },
      referenceDate: reference,
      timeZone,
    });
  });
  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Rota não encontrada.')));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) {
      _next(error);
      return;
    }
    if (error instanceof ZodError) {
      res
        .status(400)
        .json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Revise os campos informados.',
            fields: Object.fromEntries(
              error.issues.map((issue) => [issue.path.join('.') || 'body', issue.message]),
            ),
          },
        });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error?.code === '23505') {
      res
        .status(409)
        .json({
          error: {
            code: 'DUPLICATE_MEETING',
            message:
              'Uma reunião deste lote já foi importada. Nenhuma reunião do lote foi gravada.',
          },
        });
      return;
    }
    if (error?.type === 'entity.too.large') {
      res
        .status(413)
        .json({
          error: { code: 'PAYLOAD_TOO_LARGE', message: 'O arquivo deve ter no máximo 1 MiB.' },
        });
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      res
        .status(400)
        .json({
          error: {
            code: 'INVALID_JSON',
            message: 'JSON inválido. Verifique a sintaxe do arquivo.',
          },
        });
      return;
    }
    console.error(
      JSON.stringify({ code: 'INTERNAL_ERROR', requestId: res.getHeader('X-Request-ID') }),
    );
    res
      .status(500)
      .json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Não foi possível concluir a solicitação. Tente novamente.',
        },
      });
  };
  app.use(errors);
  return app;
}
