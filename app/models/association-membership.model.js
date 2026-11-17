"use strict";

module.exports = (sequelize, DataTypes) => sequelize.define("associationMembership", {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true,
    field: "user_id",
    references: { model: "users", key: "id" },
  },
  associationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true,
    field: "association_id",
    references: { model: "associations", key: "id" },
  },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: "is_active" },
  createdByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: "created_by_user_id",
    references: { model: "users", key: "id" },
  },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "created_at" },
}, { tableName: "association_memberships", timestamps: false });
