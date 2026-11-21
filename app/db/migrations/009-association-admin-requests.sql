-- Solicitudes de incorporación de administradores por asociación.
CREATE TABLE IF NOT EXISTS association_admin_requests (
  id SERIAL PRIMARY KEY,
  association_id INTEGER NOT NULL REFERENCES associations(id) ON UPDATE CASCADE ON DELETE CASCADE,
  target_user_id INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  requested_by_user_id INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by_user_id INTEGER NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE association_admin_requests ALTER COLUMN created_at SET DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS association_admin_requests_pending_unique_idx
  ON association_admin_requests (association_id, target_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS association_admin_requests_association_status_idx
  ON association_admin_requests (association_id, status, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'association_admin_requests_status_check'
      AND conrelid = 'association_admin_requests'::regclass
  ) THEN
    ALTER TABLE association_admin_requests ADD CONSTRAINT association_admin_requests_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;
