-- Contexto activo para administradores que pertenecen a más de una asociación.
-- La selección es una preferencia, no concede permisos: siempre se valida contra
-- las membresías activas en el middleware de autenticación.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_association_id INTEGER
  REFERENCES associations(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_active_association_idx
  ON users (active_association_id)
  WHERE active_association_id IS NOT NULL;
