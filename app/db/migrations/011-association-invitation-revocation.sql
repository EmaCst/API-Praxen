-- Trazabilidad de revocación de invitaciones institucionales.
ALTER TABLE association_invitations
  ADD COLUMN IF NOT EXISTS revoked_by_user_id INTEGER NULL
    REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE association_invitations
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL;
