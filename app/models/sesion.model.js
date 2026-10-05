module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "sesion",
    {
      sessionId: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        field: "session_id",
      },
      athleteId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "athlete_id",
        validate: { min: 1 },
      },
      mode: {
        type: DataTypes.STRING(16),
        allowNull: false,
      },
      startedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "started_at",
      },
      endedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "ended_at",
      },
      exercises: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      runningExercises: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        field: "running_exercises",
      },
      footExercises: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        field: "foot_exercises",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "created_at",
      },
    },
    {
      tableName: "training_sessions",
      timestamps: false,
      indexes: [{ fields: ["athlete_id", "started_at"] }],
    }
  );
};
