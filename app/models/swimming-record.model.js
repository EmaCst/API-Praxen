"use strict";

module.exports = (sequelize, DataTypes) => sequelize.define("swimmingRecord", {
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  athleteId: { type: DataTypes.INTEGER, allowNull: false, field: "athlete_id" },
  associationId: { type: DataTypes.INTEGER, allowNull: false, field: "association_id" },
  style: { type: DataTypes.STRING(40), allowNull: false },
  distanceM: { type: DataTypes.INTEGER, allowNull: false, field: "distance_m", validate: { min: 1, max: 10000 } },
  timeMs: { type: DataTypes.INTEGER, allowNull: false, field: "time_ms", validate: { min: 1 } },
  recordedAt: { type: DataTypes.DATEONLY, allowNull: false, field: "recorded_at" },
  recordType: { type: DataTypes.STRING(16), allowNull: false, field: "record_type", validate: { isIn: [["training", "competition"]] } },
  source: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "manual", validate: { isIn: [["manual", "sensor"]] } },
  authorUserId: { type: DataTypes.INTEGER, allowNull: false, field: "author_user_id" },
  notes: { type: DataTypes.STRING(500), allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "created_at" },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "updated_at" }
}, {
  tableName: "swimming_records",
  timestamps: false,
  indexes: [
    { fields: ["athlete_id", "style", "distance_m", "recorded_at"] },
    { fields: ["association_id", "recorded_at"] }
  ]
});
