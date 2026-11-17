-- Praxen multi-asociación: la asociación es la organización propietaria de los datos.
-- federacion se conserva como clasificación deportiva del atleta y no se reemplaza.
CREATE TABLE IF NOT EXISTS associations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS associations_slug_lower_idx ON associations (LOWER(slug));
CREATE UNIQUE INDEX IF NOT EXISTS associations_name_lower_idx ON associations (LOWER(name));

-- Nombre neutro temporal: podrá personalizarse cuando exista la gestión de asociaciones.
INSERT INTO associations (name, slug)
VALUES ('Asociación inicial', 'asociacion-inicial')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS association_memberships (
  user_id INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  association_id INTEGER NOT NULL REFERENCES associations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INTEGER NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, association_id)
);

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS association_id INTEGER REFERENCES associations(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS association_id INTEGER REFERENCES associations(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- Los perfiles y grupos existentes se conservan y se adscriben a la organización inicial.
UPDATE athletes
SET association_id = (SELECT id FROM associations WHERE slug = 'asociacion-inicial')
WHERE association_id IS NULL;

UPDATE groups
SET association_id = (SELECT id FROM associations WHERE slug = 'asociacion-inicial')
WHERE association_id IS NULL;

ALTER TABLE athletes ALTER COLUMN association_id SET NOT NULL;
ALTER TABLE groups ALTER COLUMN association_id SET NOT NULL;

-- Los superadministradores mantienen alcance global y no necesitan membresía.
-- Los atletas y administradores actuales quedan vinculados a la asociación inicial.
INSERT INTO association_memberships (user_id, association_id, is_active)
SELECT users.id, associations.id, TRUE
FROM users
CROSS JOIN associations
WHERE associations.slug = 'asociacion-inicial'
  AND users.role <> 'superadmin'
ON CONFLICT (user_id, association_id) DO NOTHING;

-- Los nombres de grupo pueden repetirse entre asociaciones, pero no dentro de una.
DROP INDEX IF EXISTS groups_nombre_lower_idx;
CREATE UNIQUE INDEX IF NOT EXISTS groups_association_nombre_lower_idx
  ON groups (association_id, LOWER(nombre));

CREATE INDEX IF NOT EXISTS association_memberships_association_idx
  ON association_memberships (association_id, is_active);
CREATE INDEX IF NOT EXISTS association_memberships_user_idx
  ON association_memberships (user_id, is_active);
CREATE INDEX IF NOT EXISTS athletes_association_federacion_idx
  ON athletes (association_id, federacion);
CREATE INDEX IF NOT EXISTS groups_association_idx
  ON groups (association_id);
