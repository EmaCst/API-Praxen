CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(100),
  google_subject VARCHAR(255) UNIQUE,
  reset_token_hash VARCHAR(64),
  reset_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS athletes_user_id_unique_idx ON athletes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_google_subject_unique_idx ON users(google_subject);

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS federacion VARCHAR(120);
