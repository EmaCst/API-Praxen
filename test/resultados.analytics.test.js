"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  METRICS, numericalMetrics, sessionExerciseMetrics, summarySession,
  summarize, evolution,
} = require("../app/services/results.analytics");

const session = (id, athleteId, startedAt, {
  hits, misses, targetsReached, reactionTime, distance, score,
} = {}) => ({
  sessionId: id, athleteId, mode: "individual",
  startedAt,
  endedAt: new Date(new Date(startedAt).getTime() + 180000).toISOString(),
  exercises: hits === undefined ? [] : [{
    exerciseType: "aimlab", sets: 2,
    metrics: {
      hits, misses,
      ...(reactionTime !== undefined ? { averageReactionSeconds: reactionTime } : {}),
      ...(score !== undefined ? { score } : {}),
    },
  }],
  footExercises: [],
  runningExercises: targetsReached === undefined ? [] : [{
    exerciseType: "running_direction_change",
    metrics: {
      targetsReached,
      ...(distance !== undefined ? { totalTravelledMeters: distance } : {}),
    },
  }],
});

const rows = [
  session("s1", 1, "2026-01-01T08:00:00.000Z", {
    hits: 10, misses: 10, reactionTime: 0.9, targetsReached: 5, distance: 8,
  }),
  session("s2", 1, "2026-02-01T08:00:00.000Z", {
    hits: 18, misses: 2, reactionTime: 0.7, targetsReached: 8, distance: 10,
  }),
  session("s3", 1, "2026-02-02T08:00:00.000Z", {
    hits: 20, misses: 0, reactionTime: 0.5, targetsReached: 10, distance: 13,
  }),
  session("s4", 2, "2026-02-03T08:00:00.000Z", {
    hits: 1, misses: 9, reactionTime: 1.2, targetsReached: 1, distance: 1,
  }),
];

test("la precisión se deriva de aciertos e intentos válidos, nunca se inventa", () => {
  assert.equal(numericalMetrics({hits: 3, misses: 1}).accuracyPercent, 75);
  assert.equal(numericalMetrics({hits: 0, misses: 0}).accuracyPercent, undefined);
  assert.equal(numericalMetrics({hits: 12}).accuracyPercent, undefined);
  assert.equal(numericalMetrics({hits: 4, misses: 0, accuracyPercent: 32}).accuracyPercent, 100);
  assert.equal(numericalMetrics({hits: 2, misses: -1}).accuracyPercent, undefined);
  assert.equal(numericalMetrics({hits: 3, attempts: [1, 2]}).attempts, undefined);
});

test("cada tipo de ejercicio mantiene sus métricas separadas", () => {
  const metrics = sessionExerciseMetrics(rows[0]);
  assert.deepEqual(Object.keys(metrics).sort(), ["aimlab", "running_direction_change"]);
  assert.equal(metrics.aimlab.metrics.hits, 10);
  assert.equal(metrics.aimlab.metrics.accuracyPercent, 50);
  assert.equal(metrics.running_direction_change.metrics.targetsReached, 5);
  assert.equal(metrics.aimlab.metrics.totalTravelledMeters, undefined);
  const latest = summarySession(rows[0]);
  assert.equal(latest.durationSeconds, 180);
  assert.equal(latest.sessionId, "s1");
});

test("promedio por usuario da el mismo peso a todas sus sesiones", () => {
  const data = summarize(rows.slice(0, 3));
  const aimlab = data.exercises.find(x => x.exerciseType === "aimlab");
  assert.equal(data.totalSessions, 3);
  assert.equal(data.athleteCount, 1);
  assert.equal(data.aggregationBasis, "equal_weight_per_session");
  assert.equal(aimlab.metrics.hits.average, 16);
  assert.equal(aimlab.metrics.accuracyPercent.average, 80);
  assert.equal(data.averageDurationSeconds, 180);
});

test("promedio de población pondera cada atleta igual, no cada entrenamiento", () => {
  const data = summarize(rows, {population: true});
  const aimlab = data.exercises.find(x => x.exerciseType === "aimlab");
  // Athlete 1 mean hits = (10+18+20)/3 = 16, athlete 2 = 1;
  // population value = (16+1)/2 = 8.5, not 12.25.
  assert.equal(data.athleteCount, 2);
  assert.equal(data.totalSessions, 4);
  assert.equal(data.aggregationBasis, "equal_weight_per_athlete");
  assert.equal(aimlab.metrics.hits.average, 8.5);
  assert.equal(aimlab.athletes, 2);
  assert.equal(aimlab.metrics.hits.samples, 2);
  assert.equal(summarize([], {population: true}).totalSessions, 0);
  assert.deepEqual(summarize([]).exercises, []);
});

test("series por sesión muestran mejora correcta para métricas mayores y menores", () => {
  const hits = evolution(rows.slice(0, 3), {
    exerciseType: "aimlab", metric: "hits", limit: 10,
  });
  assert.deepEqual(hits.series[0].points.map(x => x.value), [10, 18, 20]);
  assert.equal(hits.series[0].points[1].improvement, 8);
  assert.equal(hits.series[0].points[1].improved, true);
  const reaction = evolution(rows.slice(0, 3), {
    exerciseType: "aimlab", metric: "averageReactionSeconds",
  });
  assert.equal(reaction.series[0].metric.direction, "lower");
  assert.equal(reaction.series[0].points[1].improvement, 0.2);
  assert.equal(reaction.series[0].points[2].improved, true);
  const distance = evolution(rows.slice(0, 3), {
    exerciseType: "running_direction_change", metric: "totalTravelledMeters",
  });
  assert.equal(METRICS.totalTravelledMeters.direction, "neutral");
  assert.equal(distance.series[0].points[1].improved, undefined);
});

test("evolución por federación/global publica promedios mensuales entre atletas", () => {
  const graph = evolution(rows, {
    population: true, exerciseType: "aimlab", metric: "hits",
    period: "month", limit: 20,
  });
  assert.deepEqual(graph.series[0].points.map(x => x.period), ["2026-01", "2026-02"]);
  assert.equal(graph.series[0].points[0].value, 10);
  // February athlete 1 mean = (18+20)/2 = 19; athlete 2 = 1 -> 10.
  assert.equal(graph.series[0].points[1].value, 10);
  assert.equal(graph.series[0].points[1].athletes, 2);
  assert.equal(graph.series[0].points[1].sessions, 3);
});

test("métricas adicionales de Unity se conservan como neutrales", () => {
  const metrics = numericalMetrics({
    customCoordination: 8.2, sessionId: 12, customNested: [1, 2],
  });
  assert.equal(metrics.customCoordination, 8.2);
  assert.equal(metrics.sessionId, undefined);
  assert.equal(metrics.customNested, undefined);
  const training = session("extra", 1, "2026-01-01T12:00:00.000Z", {hits: 3, misses: 1});
  training.exercises[0].metrics.customCoordination = 8.2;
  const graph = evolution([training], {
    exerciseType: "aimlab", metric: "customCoordination",
  });
  assert.equal(graph.series[0].metric.direction, "neutral");
  assert.equal(graph.series[0].points[0].value, 8.2);
  assert.equal(graph.series[0].points[0].improved, undefined);
});

test("sin métricas registradas la serie queda vacía en vez de fabricar ceros", () => {
  assert.deepEqual(evolution(rows, {exerciseType:"feet_targets"}).series, []);
  assert.equal(summarize(rows, {exerciseType:"feet_targets"}).totalSessions, 0);
});
