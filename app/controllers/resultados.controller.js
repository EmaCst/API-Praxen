"use strict";

const { Op, fn, col, where } = require("sequelize");
const db = require("../models");
const { PERMISSIONS } = require("../security/roles");
const { EXERCISE_LISTS, METRICS, summarySession, summarize, evolution } = require("../services/results.analytics");
const {
  ResultsError, parseFilters, buildScope, makeQuery, publicScope,
  publicSession, loadSessions, latest, respondError, validateSessionId,
  matchesExercise,
} = require("../services/results.query");
const { resolveAssociationIds, recordDeniedAssociationAccess } = require("../security/association-access");

function authorizeAdminAction(req, permission) {
  if (!req.auth.permissions.includes(permission)) {
    throw new ResultsError(403, "No tienes permisos para esta operación.");
  }
}

async function queryContext(req, admin, { list = false } = {}) {
  const filters = parseFilters(req.query, { admin, list });
  const scope = await buildScope(filters, {
    admin,
    currentAthleteId: req.auth.athleteId,
    userId: req.auth.userId,
    req,
  });
  if (admin) {
    authorizeAdminAction(req, scope.type === "athlete"
      ? PERMISSIONS.RESULTS_ATHLETE_READ
      : (scope.type === "federation" || scope.type === "group")
        ? PERMISSIONS.RESULTS_FEDERATION_READ
        : PERMISSIONS.RESULTS_ALL_READ);
  }
  return { filters, scope, query: makeQuery(filters, scope) };
}

function payloadFilters(filters) {
  return {
    exerciseType: filters.exerciseType, metric: filters.metric,
    mode: filters.mode, period: filters.period,
    groupId:filters.groupId||null,
    associationId:filters.associationId||null,
    from: filters.from ? filters.from.toISOString().slice(0, 10) : null,
    to: filters.to ? filters.to.toISOString().slice(0, 10) : null,
  };
}

function createController(admin = false) {
  return {
    metadata: (_req, res) => res.json({
      exerciseTypes: Object.keys(EXERCISE_LISTS),
      metrics: METRICS,
      defaults: {
        individualEvolution: "session", populationEvolution: "month",
        populationWeight: "one_equal_weight_per_athlete",
      },
    }),

    latest: async (req, res) => {
      try {
        const { filters, scope, query } = await queryContext(req, admin);
        const session = await latest(query, filters.exerciseType);
        return res.json({
          scope: publicScope(scope), filters: payloadFilters(filters),
          latest: session ? publicSession(session) : null,
          metrics: session ? summarySession(session) : null,
        });
      } catch (error) { return respondError(res, error); }
    },

    summary: async (req, res) => {
      try {
        const { filters, scope, query } = await queryContext(req, admin);
        const sessions = await loadSessions(query);
        return res.json({
          scope: publicScope(scope), filters: payloadFilters(filters),
          summary: summarize(sessions, {
            population: scope.type !== "athlete", exerciseType: filters.exerciseType,
          }),
        });
      } catch (error) { return respondError(res, error); }
    },

    evolution: async (req, res) => {
      try {
        const { filters, scope, query } = await queryContext(req, admin);
        const sessions = await loadSessions(query);
        return res.json({
          scope: publicScope(scope), filters: payloadFilters(filters),
          evolution: evolution(sessions, {
            population: scope.type !== "athlete", exerciseType: filters.exerciseType,
            metric: filters.metric, period: filters.period, limit: filters.limit,
          }),
        });
      } catch (error) { return respondError(res, error); }
    },

    sessions: async (req, res) => {
      try {
        const { filters, scope, query } = await queryContext(req, admin, { list: true });
        let total, rows;
        if (filters.exerciseType) {
          // JSONB result arrays have heterogeneous metrics. Filtering before
          // client-side pagination keeps total/limit/offset truthful.
          const all = await loadSessions(query);
          const filtered = all.filter(session => matchesExercise(session, filters.exerciseType));
          total = filtered.length;
          rows = filtered.slice(filters.offset, filters.offset + filters.limit);
        } else {
          const result = await db.sesiones.findAndCountAll({
            ...query,
            order: [["startedAt", "DESC"], ["sessionId", "DESC"]],
            limit: filters.limit, offset: filters.offset,
          });
          total = result.count;
          rows = result.rows;
        }
        return res.json({
          scope: publicScope(scope), total,
          limit: filters.limit, offset: filters.offset,
          sesiones: rows.map(publicSession),
        });
      } catch (error) { return respondError(res, error); }
    },
  };
}

const own = createController(false);
const admin = createController(true);

admin.oneSession = async (req, res) => {
  try {
    authorizeAdminAction(req, PERMISSIONS.RESULTS_ATHLETE_READ);
    const sessionId = validateSessionId(req.params.sessionId);
    const { scope, query } = await queryContext(req, true);
    const sesion = await db.sesiones.findOne({
      ...query, where: { ...query.where, sessionId },
    });
    if (!sesion) return res.status(404).json({ message: "Sesión no encontrada." });
    return res.json({ scope: publicScope(scope), session: publicSession(sesion) });
  } catch (error) { return respondError(res, error); }
};

admin.athletes = async (req, res) => {
  try {
    authorizeAdminAction(req, PERMISSIONS.ATHLETES_LIST);
    const filters = parseFilters(req.query, { admin: true, list: true });
    const whereFilter = {};
    const associationIds = await resolveAssociationIds(req, filters.associationId);
    if (Array.isArray(associationIds)) whereFilter.userId = { [Op.in]: db.sequelize.literal(
      "(SELECT user_id FROM association_memberships WHERE association_id IN (" +
      associationIds.map(Number).join(",") + ") AND is_active = TRUE)"
    ) };
    if (filters.federation) whereFilter.federacion = filters.federation;
    if (filters.athleteId && Array.isArray(associationIds) && typeof db.atletas.findByPk === "function") {
      const target = await db.atletas.findByPk(filters.athleteId, { attributes: ["id", "userId"] });
      const membership = target?.userId ? await db.associationMemberships.findOne({
        where: { userId: target.userId, associationId: { [Op.in]: associationIds }, isActive: true },
      }) : null;
      if (!membership) {
        await recordDeniedAssociationAccess(req, associationIds[0], "athlete_directory_outside_active_membership");
        throw new ResultsError(404, "Atleta no encontrado.");
      }
    }
    if (filters.groupId) {
      const group = await db.groups.findByPk(filters.groupId);
      if (!group) throw new ResultsError(404, "Grupo no encontrado.");
      if (Array.isArray(associationIds) && !associationIds.includes(Number(group.associationId))) {
        await recordDeniedAssociationAccess(req, group.associationId, "athlete_list_group_outside_membership");
        throw new ResultsError(404, "Grupo no encontrado.");
      }
      whereFilter.userId = { [Op.in]: db.sequelize.literal(
        "(SELECT ug.user_id FROM user_groups ug INNER JOIN association_memberships am ON am.user_id = ug.user_id " +
        "WHERE ug.group_id = " + Number(filters.groupId) +
        (Array.isArray(associationIds) ? " AND am.association_id IN (" + associationIds.map(Number).join(",") + ")" : "") +
        " AND am.is_active = TRUE)"
      ) };
    }
    if (filters.athleteId) whereFilter.id = filters.athleteId;
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== "string" ||
          req.query.search.trim().length < 2 || req.query.search.length > 120) {
        throw new ResultsError(400, "search debe contener entre 2 y 120 caracteres.");
      }
      // Escape LIKE wildcards to prevent unintended broad matches.
      const search = req.query.search.trim().replace(/[\\%_]/g, "\\$&");
      whereFilter[Op.or] = [
        { nombre: { [Op.iLike]: "%" + search + "%" } },
      ];
    }
    const result = await db.atletas.findAndCountAll({
      where: whereFilter,
      attributes: ["id", "nombre", "federacion", "createdAt"],
      order: [["nombre", "ASC"], ["id", "ASC"]],
      limit: filters.limit, offset: filters.offset,
    });
    return res.json({
      total: result.count, limit: filters.limit, offset: filters.offset,
      atletas: result.rows,
    });
  } catch (error) { return respondError(res, error, "atletas"); }
};

admin.federations = async (req, res) => {
  try {
    authorizeAdminAction(req, PERMISSIONS.FEDERATIONS_LIST);
    const filters = parseFilters(req.query, { admin: true });
    const associationIds = await resolveAssociationIds(req, filters.associationId);
    const rows = await db.atletas.findAll({
      attributes: [
        "federacion",
        [fn("COUNT", col("id")), "totalAtletas"],
      ],
      where: { federacion: { [Op.not]: null }, ...(Array.isArray(associationIds) ? {
        userId: { [Op.in]: db.sequelize.literal(
          "(SELECT user_id FROM association_memberships WHERE association_id IN (" +
          associationIds.map(Number).join(",") + ") AND is_active = TRUE)"
        ) },
      } : {}) },
      group: ["federacion"],
      order: [["federacion", "ASC"]],
    });
    return res.json({
      federaciones: rows.map(row => ({
        nombre: row.federacion, totalAtletas: Number(row.get("totalAtletas")),
      })),
    });
  } catch (error) { return respondError(res, error, "federaciones"); }
};

admin.federationSummary = async (req, res) => {
  try {
    authorizeAdminAction(req, PERMISSIONS.RESULTS_FEDERATION_READ);
    const filters = parseFilters(req.query, { admin: true });
    if (filters.athleteId || filters.federation) {
      throw new ResultsError(400,
        "Este endpoint compara todas las federaciones; omite athleteId y federacion.");
    }
    const associationIds = await resolveAssociationIds(req, filters.associationId);
    const sessions = await loadSessions(makeQuery(filters, { type: "global", associationIds }));
    const athleteRows = await db.atletas.findAll({
      attributes: ["id", "federacion"],
      ...(associationIds ? { where: { associationId: { [Op.in]: associationIds } } } : {}),
    });
    const federationById = new Map(athleteRows.map(row => [Number(row.id), row.federacion]));
    const buckets = new Map();
    for (const session of sessions) {
      const name = federationById.get(Number(session.athleteId));
      if (!name) continue; // Don't label missing federation as verified.
      if (!buckets.has(name)) buckets.set(name, []);
      buckets.get(name).push(session);
    }
    const federaciones = [...buckets].sort(([a], [b]) => a.localeCompare(b))
      .map(([name, group]) => ({
        federacion: name,
        summary: summarize(group, {
          population: true, exerciseType: filters.exerciseType,
        }),
      }));
    return res.json({ filters: payloadFilters(filters), federaciones });
  } catch (error) { return respondError(res, error, "resultados por federación"); }
};

module.exports = { own, admin };
