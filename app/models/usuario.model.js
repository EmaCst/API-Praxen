module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "usuario",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      nombre: { type: DataTypes.STRING(120), allowNull: false },
      username: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      role: {
        type: DataTypes.STRING(24),
        allowNull: false,
        defaultValue: "athlete",
        validate: { isIn: [["athlete", "admin", "superadmin"]] },
      },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: "is_active" },
      tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "token_version" },
      mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: "must_change_password" },
      passwordHash: { type: DataTypes.STRING(100), allowNull: false, field: "password_hash" },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "created_at" },
    },
    { tableName: "users", timestamps: false }
  );
};
