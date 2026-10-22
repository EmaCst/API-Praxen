"use strict";

module.exports = (sequelize, DataTypes) => sequelize.define("adminAudit", {
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  actorUserId: { type: DataTypes.INTEGER, allowNull: false, field: "actor_user_id", references: { model: "users", key: "id" } },
  targetUserId: { type: DataTypes.INTEGER, allowNull: false, field: "target_user_id", references: { model: "users", key: "id" } },
  action: { type: DataTypes.STRING(40), allowNull: false },
  details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "created_at" },
}, { tableName: "admin_audit_logs", timestamps: false });
