-- Safe additive migration: existing accounts remain athletes.
-- Only an internal provisioning command may create/promote administrators.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(24) NOT NULL DEFAULT 'athlete';

CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE INDEX IF NOT EXISTS training_sessions_started_at_idx ON training_sessions(started_at);
CREATE INDEX IF NOT EXISTS athletes_federacion_idx ON athletes(federacion);
