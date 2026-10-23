CREATE TABLE IF NOT EXISTS meetings (
 id uuid PRIMARY KEY, external_id text UNIQUE NOT NULL, title text NOT NULL,
 started_at timestamptz NOT NULL, participants jsonb NOT NULL, topics jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS segments (
 meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
 id text NOT NULL, speaker text NOT NULL, at text NOT NULL, text text NOT NULL,
 position integer NOT NULL, PRIMARY KEY(meeting_id,id)
);
CREATE TABLE IF NOT EXISTS actions (
 id uuid PRIMARY KEY, meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
 title text NOT NULL, owner text NOT NULL, due_date date,
 status text NOT NULL CHECK(status IN ('pending','in_progress','done')),
 source_segment_id text,
 FOREIGN KEY(meeting_id,source_segment_id) REFERENCES segments(meeting_id,id)
);
CREATE INDEX IF NOT EXISTS meetings_started_at_idx ON meetings(started_at DESC,id);
CREATE INDEX IF NOT EXISTS actions_filters_idx ON actions(status,owner,due_date);
CREATE INDEX IF NOT EXISTS actions_meeting_idx ON actions(meeting_id);
