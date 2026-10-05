module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "usuario",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      nombre: { type: DataTypes.STRING(120), allowNull: false },
      email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
      passwordHash: { type: DataTypes.STRING(100), allowNull: true, field: "password_hash" },
      googleSubject: { type: DataTypes.STRING(255), allowNull: true, unique: true, field: "google_subject" },
      resetTokenHash: { type: DataTypes.STRING(64), allowNull: true, field: "reset_token_hash" },
      resetExpiresAt: { type: DataTypes.DATE, allowNull: true, field: "reset_expires_at" },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "created_at" },
    },
    { tableName: "users", timestamps: false }
  );
};
