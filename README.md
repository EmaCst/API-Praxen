# API Praxen

API REST de Praxen para usuarios, atletas y resultados de entrenamiento. Usa Node.js, Express, Sequelize y PostgreSQL (Neon).

## Ejecutar

Requiere Node.js 20 o posterior y PostgreSQL. En el directorio del repositorio:

```bash
npm install
```

Copia `.env.example` a `.env`. Configura `DATABASE_URL` con la conexión pooled de Neon y `JWT_SECRET` con un secreto privado aleatorio de al menos 32 caracteres. Para generarlo:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Luego ejecuta:

```bash
npm start
```

El arranque autentica la conexión, crea las tablas que faltan con `sequelize.sync()` y ejecuta `001-auth.sql`. No borra tablas ni usa `force` o `alter`.

### Cambio de correo a nombre de usuario

Esta versión registra e inicia sesión con **`username` y contraseña**, sin correo electrónico. `nombre` conserva el nombre real de la persona y puede repetirse; `username` es el identificador único de acceso.

Para esta prueba se acordó recrear las tablas de Neon. Si todavía existe `users` con el esquema anterior de correo, el arranque se detiene con un mensaje explícito: `sync()` no cambia por sí solo las columnas existentes. La API no migra ni elimina esas cuentas automáticamente. Una base vacía crea `users`, `athletes` y `training_sessions` al ejecutar `npm start`.

Después de reiniciar la base, genera un **nuevo `JWT_SECRET`** tanto localmente como en Render para invalidar los tokens de las cuentas anteriores. Reutilizar IDs con los tokens anteriores podría atribuirlos a cuentas nuevas. Todos deberán registrarse de nuevo.

Google y recuperación por correo quedan retirados de esta versión. No se requieren variables SMTP, Google ni enlaces de recuperación. No se añadió un mecanismo de recuperación alternativo.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión completa de PostgreSQL/Neon, con usuario y contraseña. |
| `DB_SSL` | `true` para Neon. |
| `DB_POOL_MAX` | Máximo de conexiones por proceso; predeterminado 5. |
| `JWT_SECRET` | Secreto privado de al menos 32 caracteres. Nunca va en Unity ni Git. |
| `JWT_EXPIRES_IN` | Duración del token; predeterminado `12h`. |
| `NODE_ENV` | `development` localmente y `production` en Render. |
| `PORT` | Puerto HTTP; predeterminado 8080. Render proporciona su propio valor. |
| `CORS_ORIGINS` | URLs web permitidas, separadas por comas. Puede estar vacío para Unity nativa y Thunder Client. |
| `TRUST_PROXY_HOPS` | Número de proxies confiables del hosting; predeterminado 0. Configúralo según el proveedor. |

## Autenticación

### POST `/api/auth/register`

```json
{
  "nombre": "David Castellanos",
  "federacion": "Atletismo",
  "username": "david.castellanos",
  "password": "una-clave-segura"
}
```

`username` tiene entre 3 y 32 caracteres y empieza con letra o número. Admite letras ASCII, números, punto, guion y guion bajo; no admite espacios internos, correo ni tildes. Se eliminan espacios exteriores y se guarda en minúsculas. `David.Castellanos` y `david.castellanos` son la misma cuenta. Las restricciones únicas de PostgreSQL evitan duplicados incluso entre solicitudes simultáneas.

La contraseña debe tener al menos 8 caracteres y no superar 72 bytes UTF-8. Se guarda un hash **bcrypt con factor 12**, nunca la contraseña original. Cuenta y atleta se crean en una transacción.

Responde **201** con `token`, `user: { id, nombre, username }` y `atleta: { id, nombre, federacion }`. No devuelve hash ni contraseña. Username repetido: **409**; datos inválidos: **400**.

### POST `/api/auth/login`

```json
{
  "username": "david.castellanos",
  "password": "una-clave-segura"
}
```

Responde **200** con el mismo formato del registro. Usuario inexistente o contraseña incorrecta devuelven el mismo error **401**. Un payload que solo contiene `email` ya no es válido.

Las rutas de autenticación limitan solicitudes por IP. Las rutas `/api/auth/google`, `/api/auth/forgot-password` y `/api/auth/reset-password` ya no están disponibles.

## Perfil y resultados

Todas las rutas siguientes requieren `Authorization: Bearer <token>`:

- `GET /api/atletas/me`: perfil del atleta autenticado.
- `PATCH /api/atletas/me`: actualiza su federación con `{ "federacion": "Atletismo" }`.
- `GET /api/atletas/me/sesiones`: sus resultados con paginación.
- `POST /api/sesiones`: guarda una sesión de Unity.
- `GET /api/sesiones?limit=20&offset=0`: consulta sesiones propias.
- `GET /api/sesiones/:sessionId`: consulta una sesión propia por UUID.

El servidor obtiene `athleteId` del token e ignora cualquier atleta enviado en el JSON. Los resultados mantienen el formato existente: `sessionId`, `mode`, `startedAt`, `endedAt`, `exercises`, `footExercises` y `runningExercises`. Cada resultado conserva sets, duración, descanso y métricas.

Una sesión nueva devuelve **201** con `created: true`. El mismo UUID y contenido devuelve **200** con `created: false`. Un UUID con contenido distinto o de otra cuenta devuelve **409** sin sobrescribir nada. No se exponen resultados de otras cuentas.

## Render

Usa la rama que contiene esta versión, actualmente `feature/cloud-results`:

- Build: `npm ci --omit=dev`
- Start: `npm start`
- Variables: `NODE_ENV=production`, `DATABASE_URL`, `DB_SSL=true`, `DB_POOL_MAX=5`, `JWT_SECRET` y `JWT_EXPIRES_IN=12h`.

También se incluye Dockerfile. No subas `.env`. `GET /api/health` devuelve **200** con `database: "ok"` si PostgreSQL responde, o **503** si no está disponible.

La API desplegada de prueba es `https://api-praxen.onrender.com`. Actualiza el servicio a este commit antes de probar los nuevos payloads.

## Pruebas e integración

`npm test` ejecuta validadores y pruebas HTTP con bcrypt y JWT reales y una capa de persistencia simulada: registro, login, usernames duplicados, transacción de cuenta/atleta, aislamiento de resultados, idempotencia y errores de DB. GitHub Actions ejecuta las mismas pruebas. Falta comprobar nuevamente el flujo con Neon real después de recrear las tablas.

**Unity no se modifica en este cambio.** Su panel anterior todavía envía `email`; antes de integrarlo habrá que cambiar ese formulario y payload a `username`. Los endpoints de resultados y los tokens Bearer mantienen el formato existente.
