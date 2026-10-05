const db = require("../models");
const { validateFederation } = require("../utils/auth.validator.js");

exports.me = async (req, res) => {
  try {
    const athlete = await db.atletas.findOne({
      where: { id: req.auth.athleteId, userId: req.auth.userId },
      attributes: ["id", "nombre", "federacion", "createdAt"],
    });
    if (!athlete) return res.status(404).json({ message: "Perfil de atleta no encontrado." });
    return res.status(200).json({ atleta: athlete });
  } catch (error) {
    console.error("Error al consultar el perfil:", error);
    return res.status(500).json({ message: "Error al consultar el perfil." });
  }
};

exports.mySessions = async (req, res) => {
  try {
    const sesiones = await db.sesiones.findAll({
      where: { athleteId: req.auth.athleteId },
      order: [["startedAt", "DESC"]],
    });
    return res.status(200).json({ sesiones });
  } catch (error) {
    console.error("Error al consultar mis sesiones:", error);
    return res.status(500).json({ message: "Error al consultar las sesiones." });
  }
};

exports.updateFederation = async (req, res) => {
  if (!validateFederation(req.body && req.body.federacion)) {
    return res.status(400).json({ message: "federacion debe tener entre 2 y 120 caracteres." });
  }
  try {
    const athlete = await db.atletas.findOne({ where: { id: req.auth.athleteId, userId: req.auth.userId } });
    if (!athlete) return res.status(404).json({ message: "Perfil de atleta no encontrado." });
    await athlete.update({ federacion: req.body.federacion.trim() });
    return res.json({ atleta: { id: athlete.id, nombre: athlete.nombre, federacion: athlete.federacion } });
  } catch (error) {
    console.error("Error al actualizar la federación:", error);
    return res.status(500).json({ message: "No se pudo actualizar la federación." });
  }
};
