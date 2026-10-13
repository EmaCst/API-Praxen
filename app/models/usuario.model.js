module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "usuario",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      nombre: { type: DataTypes.STRING(120), allowNull: false },
      username: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      passwordHash: { type: DataTypes.STRING(100), allowNull: false, field: "password_hash" },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "created_at" },
    },
    { tableName: "users", timestamps: false }
  );
};
