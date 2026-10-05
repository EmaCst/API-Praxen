const db = require("../models");
const Atleta = db.atletas;
const Sesion = db.sesiones;
const { validateAthlete } = require("../utils/atleta.validator.js");

exports.create = async (req, res) => {
  try {
    const validation = validateAthlete(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        message: "Los datos del atleta no son válidos.",
        errors: validation.errors,
      });
    }

    const atleta = await Atleta.create({ nombre: req.body.nombre.trim() });
    return res.status(201).json({
      message: "Atleta creado correctamente.",
      atleta,
    });
  } catch (error) {
    console.error("Error al crear atleta:", error);
    return res.status(500).json({ message: "Error al crear el atleta." });
  }
};

exports.findAll = async (req, res) => {
  try {
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: "limit debe estar entre 1 y 100." });
    }
    if (!Number.isInteger(offset) || offset < 0) {
      return res.status(400).json({ message: "offset debe ser un entero igual o mayor que 0." });
    }

    const result = await Atleta.findAndCountAll({
      attributes: ["id", "nombre", "createdAt"],
      order: [["id", "ASC"]],
      limit,
      offset,
    });

    return res.status(200).json({
      total: result.count,
      limit,
      offset,
      atletas: result.rows,
    });
  } catch (error) {
    console.error("Error al consultar atletas:", error);
    return res.status(500).json({ message: "Error al consultar los atletas." });
  }
};

exports.findOne = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "id debe ser un entero positivo." });
    }

    const atleta = await Atleta.findByPk(id, {
      attributes: ["id", "nombre", "createdAt"],
    });
    if (!atleta) {
      return res.status(404).json({ message: "Atleta no encontrado." });
    }

    return res.status(200).json(atleta);
  } catch (error) {
    console.error("Error al consultar atleta:", error);
    return res.status(500).json({ message: "Error al consultar el atleta." });
  }
};

exports.findSessions = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "id debe ser un entero positivo." });
    }

    const atleta = await Atleta.findByPk(id, { attributes: ["id", "nombre"] });
    if (!atleta) {
      return res.status(404).json({ message: "Atleta no encontrado." });
    }

    const sesiones = await Sesion.findAll({
      where: { athleteId: id },
      order: [["startedAt", "DESC"]],
    });
    return res.status(200).json({ atleta, sesiones });
  } catch (error) {
    console.error("Error al consultar sesiones del atleta:", error);
    return res.status(500).json({ message: "Error al consultar las sesiones del atleta." });
  }
};
