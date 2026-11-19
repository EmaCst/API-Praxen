CREATE TABLE IF NOT EXISTS groups (id SERIAL PRIMARY KEY, nombre VARCHAR(120) NOT NULL, descripcion TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
-- La unicidad por nombre se crea en 007-multi-association.sql, por asociación.
CREATE TABLE IF NOT EXISTS user_groups (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE, assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_id, group_id));
CREATE INDEX IF NOT EXISTS user_groups_group_id_idx ON user_groups(group_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
