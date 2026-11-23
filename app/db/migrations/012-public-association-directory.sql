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
