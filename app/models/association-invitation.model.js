"use strict";

module.exports = (sequelize, DataTypes) => sequelize.define("associationInvitation", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  associationId: { type: DataTypes.INTEGER, allowNull: false, field: "association_id", references: { model: "associations", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
  invitedUsername: { type: DataTypes.STRING(32), allowNull: false, field: "invited_username" },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: "token_hash" },
  status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "pending", validate: { isIn: [["pending", "accepted", "revoked", "expired"]] } },
  createdByUserId: { type: DataTypes.INTEGER, allowNull: false, field: "created_by_user_id", references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "RESTRICT" },
  acceptedByUserId: { type: DataTypes.INTEGER, allowNull: true, field: "accepted_by_user_id", references: { model: "users", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: "expires_at" },
  acceptedAt: { type: DataTypes.DATE, allowNull: true, field: "accepted_at" },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "created_at" },
}, { tableName: "association_invitations", timestamps: false });
