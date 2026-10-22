-- Compatible con tablas users anteriores. No borra columnas ni credenciales existentes.
-- Las bases nuevas se crean directamente con username desde 001-auth.sql.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(32);

UPDATE users SET username = 'usuario_' || id::text
WHERE username IS NULL OR BTRIM(username) = '';

ALTER TABLE users ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users(username);
