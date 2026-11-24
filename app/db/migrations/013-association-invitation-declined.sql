-- Permite registrar explícitamente cuando el deportista rechaza una invitación.
ALTER TABLE association_invitations
  DROP CONSTRAINT IF EXISTS association_invitations_status_check;

ALTER TABLE association_invitations
  ADD CONSTRAINT association_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired'));
