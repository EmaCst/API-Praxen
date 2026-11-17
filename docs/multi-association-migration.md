# Praxen — migración inicial multi-asociación

## Alcance

La migración `007-multi-association.sql` introduce la entidad organizativa `associations` y la relación N:M `association_memberships`.

- Cada asociación representa una organización que utiliza Praxen.
- Un usuario puede tener membresía en más de una asociación.
- Los roles globales siguen siendo `athlete`, `admin` y `superadmin`. El superadmin conserva alcance global y no necesita una membresía.
- Los perfiles de atletas y los grupos guardan `association_id` para poder filtrar sus sesiones y grupos por organización.
- Las sesiones siguen relacionadas con `athletes` mediante `athlete_id`; no se copian ni se modifican.
- `athletes.federacion` se conserva sin cambios. Federación y asociación son conceptos diferentes: la primera sigue siendo la clasificación deportiva almacenada actualmente; la segunda es la organización propietaria de los datos.

La migración crea una organización temporal llamada **Asociación inicial** (`asociacion-inicial`). Se puede renombrar cuando se implemente la administración de asociaciones. No se ha supuesto el nombre oficial de la organización.

## Antes de desplegar

1. Poner la API en ventana de mantenimiento o evitar escrituras durante el respaldo y la migración.
2. Confirmar que `DATABASE_URL` apunta a la base correcta.
3. Generar un respaldo completo de PostgreSQL/Neon:

```bash
pg_dump --format=custom --no-owner --no-acl --file=praxen-before-multi-association.dump "$DATABASE_URL"
```

4. Comprobar que el archivo existe y que puede leerse:

```bash
pg_restore --list praxen-before-multi-association.dump
```

5. Desplegar la versión que incluye esta migración. El arranque aplica cada archivo SQL dentro de una transacción. Las sentencias de esta migración son repetibles y usan `IF NOT EXISTS` / `ON CONFLICT` para no duplicar asociaciones ni membresías.

## Verificación posterior

Ejecutar estas consultas de solo lectura:

```sql
SELECT id, name, slug, is_active FROM associations ORDER BY id;

SELECT a.name, COUNT(*) AS memberships
FROM associations a
LEFT JOIN association_memberships m ON m.association_id = a.id
GROUP BY a.id, a.name
ORDER BY a.name;

SELECT COUNT(*) AS athletes_without_association
FROM athletes
WHERE association_id IS NULL;

SELECT COUNT(*) AS groups_without_association
FROM groups
WHERE association_id IS NULL;

SELECT COUNT(*) AS sessions_preserved
FROM training_sessions;
```

Los dos conteos de registros sin asociación deben ser cero. El total de sesiones debe coincidir con el respaldo previo. Los valores de `federacion`, los grupos y las filas de `user_groups` no se eliminan ni se reescriben.

## Rollback

El rollback de esquema solo debe hacerse después de volver a desplegar la versión anterior de la API. No ejecutar mientras una versión que usa `association_id` o las nuevas tablas esté activa.

Primero conservar el respaldo previo. Si ya se crearon asociaciones adicionales o se asignaron usuarios a varias asociaciones, exportar esa información antes: el rollback elimina las membresías y los vínculos organizativos nuevos.

```sql
BEGIN;

DROP INDEX IF EXISTS athletes_association_federacion_idx;
DROP INDEX IF EXISTS groups_association_idx;
DROP INDEX IF EXISTS groups_association_nombre_lower_idx;
DROP INDEX IF EXISTS association_memberships_association_idx;
DROP INDEX IF EXISTS association_memberships_user_idx;

ALTER TABLE groups DROP COLUMN IF EXISTS association_id;
ALTER TABLE athletes DROP COLUMN IF EXISTS association_id;

DROP TABLE IF EXISTS association_memberships;
DROP TABLE IF EXISTS associations;

CREATE UNIQUE INDEX IF NOT EXISTS groups_nombre_lower_idx
  ON groups (LOWER(nombre));

COMMIT;
```

Si el rollback falla o se requiere recuperar exactamente el estado anterior, restaurar el respaldo en una base de datos de recuperación y validar la aplicación antes de sustituir la base activa. No restaurar directamente sobre una base con escrituras posteriores sin un plan de recuperación.
