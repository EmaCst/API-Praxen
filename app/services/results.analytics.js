"use strict";

/**
 * Pure, schema-aware interpretation of the three SessionResultData lists.
 * Metrics are never guessed and different exercise types are never pooled.
 * Within a session, repeated results of a type are averaged; historical
 * athlete statistics average those per-session values equally. Population
 * averages first average sessions per athlete, then weight athletes equally.
 */
const EXERCISE_LISTS = Object.freeze({
  aimlab: "exercises",
  running_direction_change: "runningExercises",
  feet_targets: "footExercises",
});

const METRICS = Object.freeze({
  hits: { label: "Aciertos", unit: "aciertos", direction: "higher" },
  misses: { label: "Fallos", unit: "fallos", direction: "lower" },
  score: { label: "Puntuación", unit: "puntos", direction: "higher" },
  targetsReached: { label: "Objetivos alcanzados", unit: "objetivos", direction: "higher" },
  targetsHit: { label: "Objetivos acertados", unit: "objetivos", direction: "higher" },
  targetsMissed: { label: "Objetivos fallados", unit: "objetivos", direction: "lower" },
  attemptsCount: { label: "Intentos", unit: "intentos", direction: "neutral" },
  averageReactionSeconds: { label: "Tiempo medio de reacción", unit: "segundos", direction: "lower" },
  averageReactionTimeSeconds: { label: "Tiempo medio de reacción", unit: "segundos", direction: "lower" },
  reactionTimeSeconds: { label: "Tiempo de reacción", unit: "segundos", direction: "lower" },
  averageResponseTimeSeconds: { label: "Tiempo medio de respuesta", unit: "segundos", direction: "lower" },
  completionTimeSeconds: { label: "Tiempo de finalización", unit: "segundos", direction: "lower" },
  totalTravelledMeters: { label: "Distancia recorrida", unit: "metros", direction: "neutral" },
  totalDistanceMeters: { label: "Distancia recorrida", unit: "metros", direction: "neutral" },
  averageSpeedMetersPerSecond: { label: "Velocidad media", unit: "m/s", direction: "neutral" },
  accuracyPercent: { label: "Precisión", unit: "%", direction: "higher" },
});

const DEFAULT_METRICS = Object.freeze({
  aimlab: ["accuracyPercent", "score", "hits", "averageReactionSeconds"],
  feet_targets: ["accuracyPercent", "targetsReached", "hits", "score"],
  running_direction_change: ["targetsReached", "score", "averageReactionSeconds", "completionTimeSeconds"],
});

const mean = (values) => values.length
  ? values.reduce((sum, current) => sum + current, 0) / values.length : null;
const round = (value) => value === null || !Number.isFinite(value)
  ? null : Math.round(value * 10000) / 10000;

function plainSession(session) {
  return typeof session?.get === "function" ? session.get({ plain: true }) : session;
}

function numericalMetrics(metrics) {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return {};
  const values = {};
  for (const key of Object.keys(METRICS)) {
    const value = metrics[key];
    if (key !== "accuracyPercent" && typeof value === "number" &&
        Number.isFinite(value) && value >= 0) values[key] = value;
  }
  // Derive precision only when BOTH sides of the attempt ratio exist.
  if (typeof metrics.hits === "number" && typeof metrics.misses === "number" &&
      Number.isFinite(metrics.hits) && Number.isFinite(metrics.misses) &&
      metrics.hits >= 0 && metrics.misses >= 0 &&
      (metrics.hits + metrics.misses) > 0) {
    values.accuracyPercent = 100 * metrics.hits / (metrics.hits + metrics.misses);
  } else if (typeof metrics.accuracyPercent === "number" &&
      Number.isFinite(metrics.accuracyPercent) &&
      metrics.accuracyPercent >= 0 && metrics.accuracyPercent <= 100) {
    values.accuracyPercent = metrics.accuracyPercent;
  }
  return values;
}

function sessionExerciseMetrics(session) {
  const data = plainSession(session);
  const result = {};
  for (const [type, field] of Object.entries(EXERCISE_LISTS)) {
    const entries = Array.isArray(data[field]) ? data[field] : [];
    const values = {};
    for (const entry of entries) {
      if (!entry || entry.exerciseType !== type) continue;
      const metrics = numericalMetrics(entry.metrics);
      for (const [name, value] of Object.entries(metrics)) {
        (values[name] ||= []).push(value);
      }
    }
    const valid = entries.filter(entry => entry?.exerciseType === type);
    if (!valid.length) continue;
    result[type] = {
      results: valid.length,
      metrics: Object.fromEntries(
        Object.entries(values).map(([name, metrics]) => [name, round(mean(metrics))])
      ),
    };
  }
  return result;
}

function durationSeconds(session) {
  const data = plainSession(session);
  const start = new Date(data.startedAt).getTime();
  const end = new Date(data.endedAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? round((end - start) / 1000) : null;
}

function summarySession(session) {
  const data = plainSession(session);
  return {
    sessionId: data.sessionId,
    athleteId: data.athleteId,
    mode: data.mode,
    startedAt: data.startedAt,
    endedAt: data.endedAt,
    durationSeconds: durationSeconds(data),
    exercises: sessionExerciseMetrics(data),
  };
}

function athleteIdOf(session) {
  return Number(plainSession(session).athleteId);
}

function describeMetric(name, values) {
  const definition = METRICS[name];
  return {
    key: name, label: definition.label, unit: definition.unit,
    direction: definition.direction,
    average: round(mean(values)),
    min: round(Math.min(...values)), max: round(Math.max(...values)),
    samples: values.length,
  };
}

function summarize(sessions, { population = false, exerciseType } = {}) {
  // An exercise-specific summary must also scope its dates and duration:
  // a later unrelated exercise is NOT the athlete's latest session of type.
  const parsed = sessions.map(summarySession)
    .filter(item => !exerciseType || item.exercises[exerciseType]);
  const first = parsed.reduce((v, s) => !v || new Date(s.startedAt) < new Date(v) ? s.startedAt : v, null);
  const last = parsed.reduce((v, s) => !v || new Date(s.startedAt) > new Date(v) ? s.startedAt : v, null);
  const athleteIds = new Set(parsed.map(s => s.athleteId));
  const durations = parsed.filter(s => s.durationSeconds !== null);
  const durationByAthlete = new Map();
  for (const s of durations) {
    if (!durationByAthlete.has(s.athleteId)) durationByAthlete.set(s.athleteId, []);
    durationByAthlete.get(s.athleteId).push(s.durationSeconds);
  }
  const durationValues = population
    ? [...durationByAthlete.values()].map(mean)
    : durations.map(s => s.durationSeconds);
  const types = {};
  for (const session of parsed) {
    for (const [type, exercise] of Object.entries(session.exercises)) {
      if (exerciseType && exerciseType !== type) continue;
      const group = (types[type] ||= { sessionCount: 0, results: 0, athletes: new Set(), values: {} });
      group.sessionCount++;
      group.results += exercise.results;
      group.athletes.add(session.athleteId);
      for (const [name, value] of Object.entries(exercise.metrics)) {
        (group.values[name] ||= []).push({ athleteId: session.athleteId, value });
      }
    }
  }
  return {
    aggregationBasis: population ? "equal_weight_per_athlete" : "equal_weight_per_session",
    totalSessions: parsed.length,
    athleteCount: athleteIds.size,
    firstSessionAt: first,
    lastSessionAt: last,
    averageDurationSeconds: round(mean(durationValues)),
    exercises: Object.entries(types).map(([exerciseType, group]) => ({
      exerciseType,
      sessions: group.sessionCount,
      athletes: group.athletes.size,
      results: group.results,
      metrics: Object.fromEntries(Object.entries(group.values).map(([name, items]) => {
        let numbers;
        if (population) {
          const grouped = new Map();
          for (const item of items) {
            if (!grouped.has(item.athleteId)) grouped.set(item.athleteId, []);
            grouped.get(item.athleteId).push(item.value);
          }
          numbers = [...grouped.values()].map(mean);
        } else {
          numbers = items.map(item => item.value);
        }
        return [name, describeMetric(name, numbers)];
      })),
    })),
  };
}

function chooseMetric(type, sessions, requested) {
  if (requested) return requested;
  const existing = new Set(sessions.flatMap(s =>
    Object.keys(sessionExerciseMetrics(s)[type]?.metrics || {})));
  return DEFAULT_METRICS[type].find(key => existing.has(key))
    || Object.keys(METRICS).find(key => existing.has(key))
    || null;
}

function periodKey(date, grouping) {
  const value = new Date(date).toISOString().slice(0, 10);
  if (grouping === "day") return value;
  if (grouping === "month") return value.slice(0, 7);
  // ISO weeks start Monday. Return the Monday's date, not a locale-specific
  // week-number that is ambiguous across years.
  const day = new Date(value + "T00:00:00Z");
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}

function improvement(previous, current, direction) {
  if (previous === null || current === null || direction === "neutral") return null;
  const change = current - previous;
  const betterChange = direction === "lower" ? -change : change;
  return {
    change: round(change),
    improvement: round(betterChange),
    improvementPercent: previous === 0 ? null : round(100 * betterChange / Math.abs(previous)),
    improved: betterChange > 0 ? true : betterChange < 0 ? false : null,
  };
}

function evolution(sessions, {
  population = false, exerciseType, metric, period = "month", limit = 50,
} = {}) {
  const sorted = [...sessions].map(plainSession)
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt) ||
      String(a.sessionId).localeCompare(String(b.sessionId)));
  const types = exerciseType ? [exerciseType] : Object.keys(EXERCISE_LISTS);
  const series = [];
  for (const type of types) {
    const metricName = chooseMetric(type, sorted, metric);
    if (!metricName) continue;
    const data = sorted.flatMap(session => {
      const value = sessionExerciseMetrics(session)[type]?.metrics[metricName];
      return value === undefined ? [] : [{
        athleteId: Number(session.athleteId),
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        value,
      }];
    });
    let points;
    if (!population) {
      const trimmed = data.slice(-limit);
      points = trimmed.map((item, i) => ({
        ...item,
        ...improvement(i ? trimmed[i - 1].value : null, item.value, METRICS[metricName].direction),
      }));
    } else {
      const groups = new Map();
      for (const item of data) {
        const key = periodKey(item.startedAt, period);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
      points = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
        .slice(-limit).map(([key, entries]) => {
          const byAthlete = new Map();
          for (const entry of entries) {
            if (!byAthlete.has(entry.athleteId)) byAthlete.set(entry.athleteId, []);
            byAthlete.get(entry.athleteId).push(entry.value);
          }
          return {
            period: key, value: round(mean([...byAthlete.values()].map(mean))),
            sessions: entries.length, athletes: byAthlete.size,
          };
        });
      points = points.map((point, i) => ({
        ...point,
        ...improvement(i ? points[i - 1].value : null, point.value, METRICS[metricName].direction),
      }));
    }
    series.push({
      exerciseType: type,
      metric: { key: metricName, ...METRICS[metricName] },
      points,
    });
  }
  return {
    granularity: population ? period : "session",
    aggregationBasis: population ? "equal_weight_per_athlete_per_period" : "per_session",
    series,
  };
}

module.exports = {
  EXERCISE_LISTS, METRICS, DEFAULT_METRICS,
  numericalMetrics, sessionExerciseMetrics, durationSeconds,
  summarySession, summarize, evolution,
};
