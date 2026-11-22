"use strict";

module.exports = (sequelize, DataTypes) => sequelize.define("associationAdminRequest", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  associationId: { type: DataTypes.INTEGER, allowNull: false, field: "association_id", references: { model: "associations", key: "id" } },
  targetUserId: { type: DataTypes.INTEGER, allowNull: false, field: "target_user_id", references: { model: "users", key: "id" } },
  requestedByUserId: { type: DataTypes.INTEGER, allowNull: false, field: "requested_by_user_id", references: { model: "users", key: "id" } },
  status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "pending", validate: { isIn: [["pending", "approved", "rejected"]] } },
  decidedByUserId: { type: DataTypes.INTEGER, allowNull: true, field: "decided_by_user_id", references: { model: "users", key: "id" } },
  decidedAt: { type: DataTypes.DATE, allowNull: true, field: "decided_at" },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "created_at" },
}, { tableName: "association_admin_requests", timestamps: false });
