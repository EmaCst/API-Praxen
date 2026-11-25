module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "atleta",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      nombre: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      birthDate: { type: DataTypes.DATEONLY, allowNull: true, field: "birth_date" },
      category: { type: DataTypes.STRING(80), allowNull: true },
      specialty: { type: DataTypes.STRING(120), allowNull: true },
      federacion: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      associationId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "association_id",
        references: { model: "associations", key: "id" },
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: true,
        field: "user_id",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "created_at",
      },
    },
    {
      tableName: "athletes",
      timestamps: false,
    }
  );
};
