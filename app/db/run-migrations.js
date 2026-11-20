"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Divide SQL only on semicolons outside strings, comments and dollar-quoted
// PostgreSQL bodies (for example, DO $$ ... BEGIN ...; END $$).
function splitSqlStatements(sql) {
  if (typeof sql !== "string") {
    throw new TypeError("El contenido SQL debe ser una cadena.");
  }

  const statements = [];
  let statementStart = 0;
  let state = "normal";
  let dollarDelimiter = null;
  let blockCommentDepth = 0;
  let escapeString = false;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];

    if (state === "line-comment") {
      if (current === "\n") state = "normal";
      continue;
    }

    if (state === "block-comment") {
      if (current === "/" && next === "*") {
        blockCommentDepth += 1;
        index += 1;
      } else if (current === "*" && next === "/") {
        blockCommentDepth -= 1;
        index += 1;
        if (blockCommentDepth === 0) state = "normal";
      }
      continue;
    }

    if (state === "single-quote") {
      if (escapeString && current === "\\") {
        index += 1;
      } else if (current === "'" && next === "'") {
        index += 1;
      } else if (current === "'") {
        state = "normal";
        escapeString = false;
      }
      continue;
    }

    if (state === "double-quote") {
      if (current === '"' && next === '"') {
        index += 1;
      } else if (current === '"') {
        state = "normal";
      }
      continue;
    }

    if (state === "dollar-quote") {
      if (sql.startsWith(dollarDelimiter, index)) {
        index += dollarDelimiter.length - 1;
        state = "normal";
        dollarDelimiter = null;
      }
      continue;
    }

    if (current === "-" && next === "-") {
      state = "line-comment";
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      state = "block-comment";
      blockCommentDepth = 1;
      index += 1;
      continue;
    }

    if (current === "'") {
      const previous = sql[index - 1];
      const beforePrevious = sql[index - 2];
      escapeString = /[eE]/.test(previous || "")
        && (index < 2 || !/[A-Za-z0-9_$]/.test(beforePrevious));
      state = "single-quote";
      continue;
    }

    if (current === '"') {
      state = "double-quote";
      continue;
    }

    if (current === "$") {
      const previous = sql[index - 1];
      const delimiter = sql.slice(index).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (delimiter && (index === 0 || !/[A-Za-z0-9_$]/.test(previous))) {
        dollarDelimiter = delimiter;
        state = "dollar-quote";
        index += delimiter.length - 1;
        continue;
      }
    }

    if (current === ";") {
      const statement = sql.slice(statementStart, index).trim();
      if (statement) statements.push(statement);
      statementStart = index + 1;
    }
  }

  if (state === "single-quote" || state === "double-quote" || state === "dollar-quote" || state === "block-comment") {
    throw new SyntaxError("SQL incompleto: estado " + state + " sin cerrar.");
  }

  const remaining = sql.slice(statementStart).trim();
  if (remaining) statements.push(remaining);
  return statements;
}

// All migrations are additive and repeatable. Keeping them in one place
// ensures Render startup uses the same schema.
async function runMigrations(sequelize) {
  const folder = path.join(__dirname, "migrations");
  const files = fs.readdirSync(folder).filter((filename) => /^\d+.*\.sql$/.test(filename)).sort();

  for (const filename of files) {
    const sql = fs.readFileSync(path.join(folder, filename), "utf8");
    let statements;

    try {
      statements = splitSqlStatements(sql);
    } catch (error) {
      throw new Error("No se pudo interpretar la migración " + filename + ": " + error.message, { cause: error });
    }

    // A migration is atomic: if one statement fails, PostgreSQL rolls back
    // the whole file and the next startup can safely retry it.
    await sequelize.transaction(async (transaction) => {
      for (let index = 0; index < statements.length; index += 1) {
        try {
          await sequelize.query(statements[index], { transaction });
        } catch (error) {
          throw new Error(
            "Falló la migración " + filename + " en la sentencia " + (index + 1)
              + "/" + statements.length + ": " + error.message,
            { cause: error }
          );
        }
      }
    });
  }

  // En bases antiguas puede persistir una columna email NOT NULL. No la usamos
  // ni eliminamos datos históricos; permitimos cuentas nuevas sin ese dato.
  const columns = await sequelize.getQueryInterface().describeTable("users");
  if (columns.email?.allowNull === false) {
    await sequelize.query("ALTER TABLE users ALTER COLUMN email DROP NOT NULL");
  }
}

module.exports = { runMigrations, splitSqlStatements };
