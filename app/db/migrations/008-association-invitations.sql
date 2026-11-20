-- Invitaciones privadas a asociaciones. El token se almacena únicamente como hash.
CREATE TABLE IF NOT EXISTS association_invitations (
  id SERIAL PRIMARY KEY,
  association_id INTEGER NOT NULL REFERENCES associations(id) ON UPDATE CASCADE ON DELETE CASCADE,
  invited_username VARCHAR(32) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  accepted_by_user_id INTEGER NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- sequelize.sync() may create this table before migrations and omit the
-- database-side default for DataTypes.NOW.
ALTER TABLE association_invitations ALTER COLUMN created_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS association_invitations_lookup_idx
  ON association_invitations (association_id, invited_username, status, expires_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'association_invitations_status_check'
      AND conrelid = 'association_invitations'::regclass
  ) THEN
    ALTER TABLE association_invitations ADD CONSTRAINT association_invitations_status_check
      CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'));
  END IF;
END $$;
