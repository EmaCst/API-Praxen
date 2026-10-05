const db = require("../models");

exports.me = async (req, res) => {
  try {
    const athlete = await db.atletas.findOne({
      where: { id: req.auth.athleteId, userId: req.auth.userId },
      attributes: ["id", "nombre", "createdAt"],
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
