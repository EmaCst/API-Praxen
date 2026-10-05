const db = require("../models");
const Sesion = db.sesiones;
const Atleta = db.atletas;
const { validateSession } = require("../utils/sesion.validator.js");

function toResponse(sesion) {
  return {
    sessionId: sesion.sessionId,
    athleteId: sesion.athleteId,
    mode: sesion.mode,
    startedAt: new Date(sesion.startedAt).toISOString(),
    endedAt: new Date(sesion.endedAt).toISOString(),
    exercises: sesion.exercises || [],
    runningExercises: sesion.runningExercises || [],
    footExercises: sesion.footExercises || [],
  };
}

exports.create = async (req, res) => {
  try {
    const validation = validateSession({ ...req.body, athleteId: req.auth.athleteId });
    if (!validation.valid) {
      return res.status(400).json({
        message: "Los datos de la sesión no son válidos.",
        errors: validation.errors,
      });
    }

    const body = req.body;
    const athleteId = req.auth.athleteId;
    const atleta = await Atleta.findOne({ where: { id: athleteId, userId: req.auth.userId } });
    if (!atleta) {
      return res.status(404).json({
        message: "El atleta indicado no existe. Créalo primero en /api/atletas.",
      });
    }

    const [sesion, created] = await Sesion.findOrCreate({
      where: { sessionId: body.sessionId },
      defaults: {
        sessionId: body.sessionId,
        athleteId,
        mode: body.mode,
        startedAt: new Date(body.startedAt),
        endedAt: new Date(body.endedAt),
        exercises: body.exercises || [],
        runningExercises: body.runningExercises || [],
        footExercises: body.footExercises || [],
      },
    });
    if (sesion.athleteId !== athleteId) {
      return res.status(409).json({ message: "sessionId ya está asociado a otra cuenta." });
    }

    return res.status(created ? 201 : 200).json({
      message: created ? "Sesión guardada correctamente." : "La sesión ya estaba guardada.",
      created,
      session: toResponse(sesion),
    });
  } catch (error) {
    console.error("Error al guardar sesión:", error);
    return res.status(500).json({ message: "Error al guardar la sesión." });
  }
};

exports.findByAthlete = async (req, res) => {
  try {
    const athleteId = req.auth.athleteId;
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: "limit debe estar entre 1 y 100." });
    }
    if (!Number.isInteger(offset) || offset < 0) {
      return res.status(400).json({ message: "offset debe ser un entero igual o mayor que 0." });
    }

    const atleta = await Atleta.findOne({ where: { id: athleteId, userId: req.auth.userId }, attributes: ["id"] });
    if (!atleta) {
      return res.status(404).json({ message: "Atleta no encontrado." });
    }

    const result = await Sesion.findAndCountAll({
      where: { athleteId },
      order: [["startedAt", "DESC"]],
      limit,
      offset,
    });

    return res.status(200).json({
      total: result.count,
      limit,
      offset,
      sesiones: result.rows.map(toResponse),
    });
  } catch (error) {
    console.error("Error al consultar sesiones:", error);
    return res.status(500).json({ message: "Error al consultar las sesiones." });
  }
};

exports.findOne = async (req, res) => {
  try {
    const sesion = await Sesion.findOne({ where: { sessionId: req.params.sessionId, athleteId: req.auth.athleteId } });
    if (!sesion) {
      return res.status(404).json({ message: "Sesión no encontrada." });
    }
    return res.status(200).json(toResponse(sesion));
  } catch (error) {
    console.error("Error al consultar sesión:", error);
    return res.status(400).json({ message: "sessionId no es válido." });
  }
};
