-- M2: full engine session state (event log included) lives in a JSONB column;
-- scalar columns are kept for cheap querying.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS state JSONB;
