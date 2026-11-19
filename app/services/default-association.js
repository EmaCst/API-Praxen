"use strict";

const db = require("../models");

const DEFAULT_ASSOCIATION_SLUG = "asociacion-inicial";

async function getDefaultAssociation(transaction) {
  const association = await db.associations.findOne({
    where: { slug: DEFAULT_ASSOCIATION_SLUG },
    ...(transaction ? { transaction } : {}),
  });

  if (!association) {
    throw new Error("No existe la asociación inicial. Ejecuta las migraciones de Praxen.");
  }

  return association;
}

module.exports = { DEFAULT_ASSOCIATION_SLUG, getDefaultAssociation };
