-- Vincula cada invitación a la cuenta destinataria, no solo a un username mutable.
-- Los registros históricos se enlazan cuando el username permite identificar al usuario.
ALTER TABLE association_invitations
  ADD COLUMN IF NOT EXISTS invited_user_id INTEGER NULL
  REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;

UPDATE association_invitations AS invitation
SET invited_user_id = users.id
FROM users
WHERE invitation.invited_user_id IS NULL
  AND LOWER(BTRIM(users.username)) = LOWER(BTRIM(invitation.invited_username));

CREATE INDEX IF NOT EXISTS association_invitations_recipient_lookup_idx
  ON association_invitations (invited_user_id, status, expires_at);
