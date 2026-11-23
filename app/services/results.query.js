"use strict";

const { Op } = require("sequelize");
const db = require("../models");
const { resolveAssociationIds, recordDeniedAssociationAccess } = require("../security/association-access");
const { EXERCISE_LISTS, isMetricKey } = require("./results.analytics");
const { UUID_PATTERN } = require("../utils/sesion.validator");

const MODES = new Set(["individual", "circuit", "custom"]);
const MAX_ANALYTICS_SESSIONS = 50000;
const FETCH_BATCH = 250;

class ResultsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validDate(value, field) {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ResultsError(400, field + " debe tener el formato AAAA-MM-DD.");
  }
  const date = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ResultsError(400, field + " no es una fecha válida.");
  }
  return date;
}

function positiveInteger(raw, label, { defaultValue, max } = {}) {
  if (raw === undefined) return defaultValue;
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new ResultsError(400, label + " debe ser un entero.");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < (label === "offset" ? 0 : 1) ||
      (max !== undefined && value > max)) {
    throw new ResultsError(400, label + " está fuera del rango permitido.");
  }
  return value;
}

function parseFilters(query, { admin = false, list = false } = {}) {
  const from = validDate(query.from, "from");
  const to = validDate(query.to, "to");
  if (from && to && to < from) {
    throw new ResultsError(400, "to no puede ser anterior a from.");
  }
  const exerciseType = query.exerciseType || null;
  if (exerciseType && !Object.hasOwn(EXERCISE_LISTS, exerciseType)) {
    throw new ResultsError(400, "exerciseType debe ser aimlab, feet_targets o running_direction_change.");
  }
  const metric = query.metric || null;
  if (metric && !isMetricKey(metric)) {
    throw new ResultsError(400, "La métrica solicitada no es válida.");
  }
  const mode = query.mode || null;
  if (mode && !MODES.has(mode)) {
    throw new ResultsError(400, "mode debe ser individual, circuit o custom.");
  }
  const federation = admin && query.federacion !== undefined ? query.federacion : null;
  if (federation !== null && (typeof federation !== "string" ||
      federation.trim().length < 2 || federation.trim().length > 120)) {
    throw new ResultsError(400, "federacion debe tener entre 2 y 120 caracteres.");
  }
  const groupId = admin && query.groupId !== undefined ? positiveInteger(query.groupId,"groupId") : null;
  const athleteId = admin && query.athleteId !== undefined
    ? positiveInteger(query.athleteId, "athleteId") : null;
  const associationId = admin && query.associationId !== undefined
    ? positiveInteger(query.associationId, "associationId") : null;
  const period = query.period || "month";
  if (!["day", "week", "month"].includes(period)) {
    throw new ResultsError(400, "period debe ser day, week o month.");
  }
  return {
    exerciseType, metric, mode, from, to,
    federation: federation?.trim() || null, athleteId, groupId, associationId,
    period,
    limit: positiveInteger(query.limit, "limit", {
      defaultValue: list ? 20 : 50, max: 100,
    }),
    offset: positiveInteger(query.offset, "offset", {
      defaultValue: 0, max: 1000000,
    }),
  };
}

async function assertAthlete(athleteId, userId, associationIds = null, req = null) {
  const where = userId ? { id: athleteId, userId } : { id: athleteId };
  const athlete = await db.atletas.findOne({
    where,
    attributes: ["id", "nombre", "federacion", "associationId", "userId"],
  });
  if (!athlete) throw new ResultsError(404, "Atleta no encontrado.");
  if (Array.isArray(associationIds)) {
    const membership = athlete.userId ? await db.associationMemberships.findOne({
      where: { userId: athlete.userId, associationId: { [Op.in]: associationIds }, isActive: true },
    }) : null;
    if (!membership) {
      await recordDeniedAssociationAccess(req, associationIds[0], "athlete_outside_active_membership");
      throw new ResultsError(404, "Atleta no encontrado.");
    }
  }
  return athlete;
}

async function buildScope(filters, {
  admin = false, currentAthleteId = null, userId = null, req = null,
} = {}) {
  if (!admin) {
    const athlete = await assertAthlete(currentAthleteId, userId);
    return { type: "athlete", athleteId: athlete.id, athlete, federation: athlete.federacion };
  }

  let associationIds;
  try {
    associationIds = await resolveAssociationIds(req, filters.associationId);
  } catch (error) {
    if (error.status === 403 && filters.associationId) {
      throw new ResultsError(403, error.message);
    }
    throw new ResultsError(error.status || 403, error.message || "No tienes acceso a esta asociación.");
  }

  let group = null;
  if (filters.groupId) {
    group = await db.groups.findByPk(filters.groupId);
    if (!group) throw new ResultsError(404, "Grupo no encontrado.");
    if (Array.isArray(associationIds) && !associationIds.includes(Number(group.associationId))) {
      await recordDeniedAssociationAccess(req, group.associationId, "group_outside_membership");
      throw new ResultsError(404, "Grupo no encontrado.");
    }
  }

  if (filters.athleteId) {
    const athlete = await assertAthlete(filters.athleteId, null, associationIds, req);
    if (filters.groupId) {
      const inGroup = athlete.userId
        ? await db.userGroups.findOne({ where: { groupId: filters.groupId, userId: athlete.userId } })
        : null;
      if (!inGroup) throw new ResultsError(404, "El atleta no pertenece al grupo.");
    }
    if (filters.federation && athlete.federacion !== filters.federation) {
      throw new ResultsError(404, "El atleta no pertenece a esa federación.");
    }
    return {
      type: "athlete", athleteId: athlete.id, athlete,
      federation: athlete.federacion, associationIds,
    };
  }
  if (filters.groupId) return { type: "group", groupId: filters.groupId, federation: filters.federation, associationIds, groupAssociationId: group.associationId };
  if (filters.federation) return { type: "federation", federation: filters.federation, associationIds };
  return { type: "global", associationIds };
}

function makeQuery(filters, scope) {
  const where = {};
  if (scope.type === "athlete") where.athleteId = scope.athleteId;
  if (filters.mode) where.mode = filters.mode;
  if (filters.from || filters.to) {
    where.startedAt = {};
    if (filters.from) where.startedAt[Op.gte] = filters.from;
    if (filters.to) where.startedAt[Op.lt] = new Date(filters.to.getTime() + 86400000);
  }

  const needsAthleteJoin = scope.type === "federation" || scope.type === "group" ||
    (scope.type !== "athlete" && Array.isArray(scope.associationIds));
  const include = needsAthleteJoin ? [{
    model: db.atletas, as: "atleta",
    attributes: ["id", "nombre", "federacion"],
    where: {
      ...(scope.federation ? { federacion: scope.federation } : {}),
      ...(Array.isArray(scope.associationIds) ? {
        userId: { [Op.in]: db.sequelize.literal(
          scope.type === "group"
            ? "(SELECT ug.user_id FROM user_groups ug INNER JOIN association_memberships am ON am.user_id = ug.user_id WHERE ug.group_id = " +
              Number(scope.groupId) + " AND am.association_id = " + Number(scope.groupAssociationId) + " AND am.association_id IN (" +
              scope.associationIds.map(Number).join(",") + ") AND am.is_active = TRUE)"
            : "(SELECT user_id FROM association_memberships WHERE association_id IN (" +
              scope.associationIds.map(Number).join(",") + ") AND is_active = TRUE)"
        ) },
      } : scope.type === "group" ? {
        userId: { [Op.in]: db.sequelize.literal(
          "(SELECT user_id FROM user_groups WHERE group_id = " + Number(scope.groupId) + ")",
        ) },
      } : {}),
    },
    required: true,
  }] : [];
  return { where, include };
}

function publicSession(session) {
  const s = typeof session.get === "function" ? session.get({ plain: true }) : session;
  return {
    sessionId: s.sessionId, athleteId: s.athleteId, mode: s.mode,
    startedAt: new Date(s.startedAt).toISOString(),
    endedAt: new Date(s.endedAt).toISOString(),
    exercises: s.exercises || [],
    runningExercises: s.runningExercises || [],
    footExercises: s.footExercises || [],
    ...(s.atleta ? { atleta: {
      id: s.atleta.id, nombre: s.atleta.nombre, federacion: s.atleta.federacion,
    } } : {}),
  };
}

function matchesExercise(session, type) {
  if (!type) return true;
  const list = session[EXERCISE_LISTS[type]] || [];
  return Array.isArray(list) && list.some(item => item?.exerciseType === type);
}

async function loadSessions(query, { max = MAX_ANALYTICS_SESSIONS } = {}) {
  const sessions = [];
  for (let offset = 0; offset <= max; offset += FETCH_BATCH) {
    const batch = await db.sesiones.findAll({
      ...query,
      order: [["startedAt", "DESC"], ["sessionId", "DESC"]],
      limit: FETCH_BATCH,
      offset,
    });
    if (!batch.length) return sessions;
    sessions.push(...batch.map(s => typeof s.get === "function" ? s.get({ plain: true }) : s));
    if (sessions.length > max) {
      throw new ResultsError(413,
        "La consulta supera el máximo de sesiones para análisis. Acota el período o la federación.");
    }
    if (batch.length < FETCH_BATCH) return sessions;
  }
  return sessions;
}

async function latest(query, exerciseType) {
  // Find the latest *session containing this type* without loading the full
  // training history when only one session is needed.
  for (let offset = 0; offset <= MAX_ANALYTICS_SESSIONS; offset += FETCH_BATCH) {
    const batch = await db.sesiones.findAll({
      ...query, order: [["startedAt", "DESC"], ["sessionId", "DESC"]],
      limit: FETCH_BATCH, offset,
    });
    for (const entry of batch) {
      const session = typeof entry.get === "function" ? entry.get({ plain: true }) : entry;
      if (matchesExercise(session, exerciseType)) return session;
    }
    if (batch.length < FETCH_BATCH) return null;
  }
  throw new ResultsError(413, "Demasiadas sesiones. Acota el período para consultar la última.");
}

function publicScope(scope) {
  return {
    type: scope.type,
    ...(scope.athleteId ? { athleteId: scope.athleteId } : {}),
    ...(scope.federation ? { federacion: scope.federation } : {}),
    ...(scope.groupId ? { groupId: scope.groupId } : {}),
    ...(Array.isArray(scope.associationIds) && scope.associationIds.length === 1 ? { associationId: scope.associationIds[0] } : {}),
  };
}

function respondError(res, error, label = "resultados") {
  if (error instanceof ResultsError || Number.isInteger(error.status)) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error("Error al consultar " + label + ":", error);
  return res.status(500).json({ message: "No se pudieron consultar los " + label + "." });
}

function validateSessionId(sessionId) {
  if (!UUID_PATTERN.test(sessionId || "")) {
    throw new ResultsError(400, "sessionId debe ser un UUID válido.");
  }
  return sessionId.toLowerCase();
}

module.exports = {
  ResultsError, MAX_ANALYTICS_SESSIONS, FETCH_BATCH,
  parseFilters, buildScope, makeQuery, assertAthlete,
  publicScope, publicSession, matchesExercise, loadSessions, latest,
  respondError, validateSessionId,
};
