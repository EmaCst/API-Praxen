# API Praxen

API REST para cuentas de deportistas y resultados de ejercicios de la app Unity Praxen. Usa Node.js, Express, Sequelize y PostgreSQL (Neon).

## Ejecutar localmente

1. Requiere Node.js 20 o posterior y PostgreSQL.
2. Ejecuta `npm install`.
3. Copia `.env.example` como `.env` y configura `DATABASE_URL` y un `JWT_SECRET` aleatorio de al menos 32 caracteres.
4. Ejecuta `npm start`.

Al iniciar, la API comprueba la conexión, crea las tablas que falten y aplica las migraciones. No borra datos ni tablas existentes automáticamente. **Una base nueva** se crea con `users.username`, `users.password_hash`, `users.role` y `users.is_active`, sin columnas de correo ni proveedores externos de autenticación.

## Variables de entorno

- `DATABASE_URL`: URL de PostgreSQL/Neon. Usa la URL con pooler para el despliegue.
- `JWT_SECRET`: secreto privado de 32 caracteres o más; no lo incluyas en Unity ni en Git.
- `JWT_EXPIRES_IN`: duración del token (por defecto `12h`).
- `PORT`: puerto HTTP (por defecto 8080).
- `CORS_ORIGINS`: orígenes web permitidos separados por comas; Unity nativa normalmente no envía `Origin`.
- `DB_POOL_MAX`: máximo de conexiones PostgreSQL por proceso (por defecto 5).
- `DB_SSL`: habilita SSL para PostgreSQL (por defecto según la configuración del proveedor).
- `NODE_ENV`: entorno, por ejemplo `development` o `production`.

## Autenticación

Todas las rutas de `/api/atletas` y `/api/sesiones` requieren autenticación. Los tokens los emite la API después de validar **usuario y contraseña**; el cliente los maneja internamente. El `athleteId` enviado dentro de una sesión se ignora: el servidor la guarda asociada al atleta autenticado.

### POST `/api/auth/register`

Entrada: `{ "nombre": "Ana Pérez", "federacion": "Atletismo", "username": "ana_123", "password": "una-clave-segura" }`.

Crea una cuenta y su perfil de atleta en una transacción, cifra la contraseña con bcrypt y devuelve `token`, `user` y `atleta`.

### POST `/api/auth/login`

Entrada: `{ "username": "ana_123", "password": "una-clave-segura" }`. Devuelve un token de sesión y los datos básicos de la cuenta.

Las rutas de autenticación tienen límite de solicitudes por IP. Las contraseñas no se guardan en claro.

## Datos de la cuenta

### GET `/api/atletas/me`

Devuelve el perfil de atleta asociado al usuario autenticado, incluyendo `nombre` y `federacion`.

### PATCH `/api/atletas/me`

Entrada: `{ "federacion": "Atletismo" }`. Permite completar o cambiar la federación del propio atleta. Los registros anteriores conservan `null` hasta que se complete el campo; no se inventa una federación para datos existentes.

### GET `/api/atletas/me/sesiones`

Devuelve las sesiones del usuario autenticado, de más reciente a más antigua.

## Sesiones de ejercicios

### POST `/api/sesiones`

Guarda un resultado con el formato `SessionResultData` de Unity. Requiere `Content-Type: application/json` y un token Bearer. La operación es idempotente por `sessionId`; repetir una sesión de otra cuenta responde HTTP 409.

Una sesión nueva devuelve HTTP 201 con `created: true`; un reintento de la misma cuenta devuelve HTTP 200 con `created: false`.

### GET `/api/sesiones?limit=20&offset=0`

Devuelve las sesiones de la cuenta autenticada con paginación.

### GET `/api/sesiones/:sessionId`

Devuelve una sesión propia por UUID; no revela si una sesión ajena existe.

## Roles, permisos y estadísticas de entrenamiento

Las credenciales de la app y del panel administrativo utilizan una misma tabla `users`, con los roles `athlete`, `admin` y `superadmin`. El registro público crea únicamente atletas; **ningún cliente puede registrarse como administrador**.

El primer superadministrador debe crearse de forma controlada en PostgreSQL con una contraseña previamente cifrada con bcrypt; después crea otros administradores desde el panel. El servidor comprueba el rol actual en PostgreSQL en cada petición y no confía en roles enviados por el cliente.

**Resultados para la app:** `GET /api/resultados/me/{ultima,resumen,evolucion,sesiones,metricas}` (rutas reales sin las llaves), siempre limitados al atleta autenticado.

**Resultados para el panel:** `GET /api/admin/resultados/{ultima,resumen,evolucion,sesiones,metricas}`, consultas de atletas y federaciones y resumen por federación. Los endpoints de resumen, evolución y última sesión permiten filtrar por `federacion`, `athleteId`, `exerciseType`, fechas y modo. También existe una comparación de todas las federaciones. Los datos históricos se calculan por ejercicio, con unidades y sentido de mejora explícitos.

Consulta **[la documentación completa de roles, ejemplos de peticiones y respuestas, estadísticas y despliegue](docs/admin-results-api.md)**. Las migraciones de esquema son aditivas para bases existentes; una base nueva se genera directamente con nombres de usuario. Las estadísticas se calculan con sesiones reales, no con datos ficticios.

## Pruebas

Ejecuta `npm test`. Las pruebas de validación no necesitan una base de datos Neon. Para probar rutas, configura una base PostgreSQL y usa Postman o curl con el token devuelto al registrar o iniciar sesión.


## Envío de resultados a la nube

1. Crea PostgreSQL en Neon y copia su URL de conexión pooled en las variables del hosting como `DATABASE_URL`. No la pongas en Unity ni en Git.
2. Despliega este repositorio con Node 22, `npm ci --omit=dev` y `npm start`, o con el Dockerfile incluido. Configura `NODE_ENV=production`, `DB_SSL=true` y un `JWT_SECRET` aleatorio de al menos 32 caracteres. Genera uno con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
3. El hosting debe proporcionar HTTPS y `PORT`. Si termina TLS detrás de un proxy, establece `TRUST_PROXY_HOPS` al número de proxies confiables del proveedor. Por defecto es 0.
4. Comprueba `GET https://TU-API/api/health`: responde 200 y `database: "ok"` solo si PostgreSQL responde. Si falla, devuelve 503 sin exponer credenciales.
5. En Praxen abre **Cuenta y nube**, indica `https://TU-API` (sin `/api`) e inicia sesión con usuario y contraseña. **La interfaz actual de Unity debe adaptarse a `username`**; no es compatible con el contrato nuevo si todavía envía `email`.
6. Al terminar se envía `POST /api/sesiones` con `Authorization: Bearer TOKEN`. Los resultados incluyen los tres tipos de ejercicios y conservan sets, duración, descanso, métricas e intentos dentro de cada resultado.

El mismo UUID y contenido devuelve 200 con `created: false`; si el UUID ya contiene resultados diferentes devuelve 409 sin sobrescribirlos. `athleteId` siempre procede del token. `GET /api/sesiones?limit=20&offset=0` y `GET /api/sesiones/:sessionId` devuelven únicamente los resultados del usuario autenticado.

La app conserva pendientes en el teléfono y reintenta con esperas de hasta 120 segundos. Los pendientes quedan vinculados al servidor y atleta originales. Una sesión de invitado se conserva localmente y no se atribuye automáticamente a otra cuenta. El token solo vive en memoria: después de reiniciar o caducar hay que iniciar sesión de nuevo. Los errores permanentes (400, 403, 409, 413) conservan el archivo para diagnóstico sin reintentos continuos.

`npm test` ejecuta validadores y pruebas HTTP de autenticación, aislamiento entre cuentas, persistencia simulada, idempotencia, consulta y fallos de DB. Estas pruebas no sustituyen la comprobación con Neon real. GitHub Actions ejecuta las mismas pruebas en cada push y PR.
