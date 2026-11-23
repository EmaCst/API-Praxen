-- La asociación inicial funciona como directorio general, no como ámbito de
-- autorización de estadísticas. Se conservan las filas para trazabilidad, pero
-- sus membresías dejan de otorgar acceso privado.
UPDATE association_memberships
SET is_active = FALSE
WHERE association_id = (SELECT id FROM associations WHERE slug = 'asociacion-inicial')
  AND is_active = TRUE;
