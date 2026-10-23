import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { importSchema } from './validation.js';
export async function importMeetings(pool: pg.Pool, input: unknown, skipExisting = false) {
  const batch = importSchema.parse(input);
  const client = await pool.connect();
  let meetingCount = 0;
  let actionCount = 0;
  try {
    await client.query('BEGIN');
    for (const meeting of batch.meetings) {
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO meetings(id,external_id,title,started_at,participants,topics) VALUES($1,$2,$3,$4,$5,$6) ${skipExisting ? 'ON CONFLICT(external_id) DO NOTHING' : ''} RETURNING id`,
        [
          id,
          meeting.externalId,
          meeting.title,
          meeting.startedAt,
          JSON.stringify(meeting.participants),
          JSON.stringify(meeting.topics),
        ],
      );
      if (!inserted.rowCount) continue;
      meetingCount++;
      for (const [position, s] of meeting.segments.entries())
        await client.query(
          'INSERT INTO segments(meeting_id,id,speaker,at,text,position) VALUES($1,$2,$3,$4,$5,$6)',
          [id, s.id, s.speaker, s.at, s.text, position],
        );
      for (const a of meeting.actions) {
        await client.query(
          'INSERT INTO actions(id,meeting_id,title,owner,due_date,status,source_segment_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            randomUUID(),
            id,
            a.title,
            a.owner,
            a.dueDate ?? null,
            a.status,
            a.sourceSegmentId ?? null,
          ],
        );
        actionCount++;
      }
    }
    await client.query('COMMIT');
    return { meetingCount, actionCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
