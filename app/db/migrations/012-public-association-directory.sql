-- La asociación inicial funciona como directorio general, no como ámbito de
-- autorización de estadísticas. Se conserva el identificador interno para no
-- romper referencias históricas y se actualiza el nombre visible del directorio.
UPDATE associations SET name = 'Asociación Pública' WHERE slug = 'asociacion-inicial';

-- Se conservan las filas de membresía para trazabilidad, pero dejan de otorgar
-- acceso privado.
UPDATE association_memberships
SET is_active = FALSE
WHERE association_id = (SELECT id FROM associations WHERE slug = 'asociacion-inicial')
  AND is_active = TRUE;

-- Las invitaciones y solicitudes pendientes heredadas se cierran sin borrar
-- sus registros, evitando que puedan reabrir membresías en el directorio.
UPDATE association_invitations
SET status = 'revoked', revoked_at = COALESCE(revoked_at, NOW())
WHERE association_id = (SELECT id FROM associations WHERE slug = 'asociacion-inicial')
  AND status = 'pending';

UPDATE association_admin_requests
SET status = 'rejected', decided_at = COALESCE(decided_at, NOW())
WHERE association_id = (SELECT id FROM associations WHERE slug = 'asociacion-inicial')
  AND status = 'pending';
