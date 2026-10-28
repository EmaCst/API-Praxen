-- Evita nombres de usuario distintos solo por mayúsculas/minúsculas.
-- Si ya existen colisiones, PostgreSQL detendrá la migración sin modificar cuentas.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_case_insensitive_idx ON users (LOWER(username));
