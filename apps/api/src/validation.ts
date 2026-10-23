import { z } from 'zod';
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD.')
  .refine(
    (value) =>
      Number(value.slice(0, 4)) >= 1 &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    'Data de calendário inválida.',
  );
const text = z.string().trim().min(1, 'Campo obrigatório.').max(200);
export const status = z.enum(['pending', 'in_progress', 'done']);
const segment = z
  .object({
    id: text,
    speaker: text,
    at: z
      .string()
      .regex(/^\d{2}:\d{2}:\d{2}$/, 'Use HH:MM:SS.')
      .refine((v) => Number(v.slice(3, 5)) < 60 && Number(v.slice(6)) < 60, 'Instante inválido.'),
    text: z.string().trim().min(1).max(10000),
  })
  .strict();
export const importSchema = z
  .object({
    version: z.literal(1),
    meetings: z
      .array(
        z
          .object({
            externalId: text,
            title: text,
            startedAt: z
              .string()
              .datetime({ offset: true })
              .refine(
                (value) =>
                  Number(value.slice(0, 4)) >= 1 &&
                  Number.isFinite(Date.parse(value)) &&
                  /(?:Z|[+-](?:0\d|1[0-5]):?[0-5]\d)$/.test(value),
                'Data e fuso de início inválidos.',
              ),
            participants: z.array(text).min(1).max(50),
            topics: z.array(text).max(30),
            segments: z.array(segment).min(1).max(500),
            actions: z
              .array(
                z
                  .object({
                    title: text,
                    owner: text,
                    dueDate: dateOnly.nullable().optional(),
                    status,
                    sourceSegmentId: text.nullable().optional(),
                  })
                  .strict(),
              )
              .max(200),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((batch, ctx) => {
    const externalIds = new Set<string>();
    batch.meetings.forEach((meeting, i) => {
      if (externalIds.has(meeting.externalId))
        ctx.addIssue({
          code: 'custom',
          message: 'Identificador externo repetido no lote.',
          path: ['meetings', i, 'externalId'],
        });
      externalIds.add(meeting.externalId);
      const ids = new Set<string>();
      meeting.segments.forEach((segment, j) => {
        if (ids.has(segment.id))
          ctx.addIssue({
            code: 'custom',
            message: 'Identificador de segmento repetido.',
            path: ['meetings', i, 'segments', j, 'id'],
          });
        ids.add(segment.id);
      });
      meeting.actions.forEach((action, j) => {
        if (action.sourceSegmentId && !ids.has(action.sourceSegmentId))
          ctx.addIssue({
            code: 'custom',
            message: 'Segmento de origem não existe nesta reunião.',
            path: ['meetings', i, 'actions', j, 'sourceSegmentId'],
          });
      });
    });
  });
export type ImportBatch = z.infer<typeof importSchema>;
const pagination = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
};
export const meetingQuery = z
  .object({
    ...pagination,
    q: z.string().trim().max(200).optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'O início deve ser anterior ao fim.',
    path: ['to'],
  });
export const actionQuery = z
  .object({
    ...pagination,
    owner: z.string().trim().max(200).optional(),
    status: status.optional(),
    overdue: z.enum(['true', 'false']).optional(),
  })
  .strict();
export const actionPatch = z
  .object({
    owner: text.optional(),
    dueDate: dateOnly.nullable().optional(),
    status: status.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Informe ao menos um campo.');
export const idSchema = z.string().uuid('Identificador inválido.');
