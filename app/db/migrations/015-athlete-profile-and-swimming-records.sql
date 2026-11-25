-- Phase 1: athlete profile extensions and swimming performance records.
-- Existing athlete rows remain valid; all new profile fields are nullable.
ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS category VARCHAR(80),
  ADD COLUMN IF NOT EXISTS specialty VARCHAR(120);

CREATE TABLE IF NOT EXISTS swimming_records (
  id BIGSERIAL PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  association_id INTEGER NOT NULL REFERENCES associations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  style VARCHAR(40) NOT NULL,
  distance_m INTEGER NOT NULL CHECK (distance_m > 0 AND distance_m <= 10000),
  time_ms INTEGER NOT NULL CHECK (time_ms > 0),
  recorded_at DATE NOT NULL,
  record_type VARCHAR(16) NOT NULL CHECK (record_type IN ('training', 'competition')),
  source VARCHAR(16) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'sensor')),
  author_user_id INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS swimming_records_athlete_event_idx
  ON swimming_records (athlete_id, style, distance_m, recorded_at DESC);
CREATE INDEX IF NOT EXISTS swimming_records_association_idx
  ON swimming_records (association_id, recorded_at DESC);
