# API Praxen

API REST para cuentas de deportistas y resultados de ejercicios de la app Unity Praxen. Usa Node.js, Express, Sequelize y PostgreSQL (Neon).

## Ejecutar localmente

1. Requiere Node.js 20 o posterior y PostgreSQL.
2. Ejecuta `npm install`.
3. Copia `.env.example` como `.env` y configura `DATABASE_URL` y un `JWT_SECRET` aleatorio de al menos 32 caracteres.
4. Ejecuta `npm start`.

Al iniciar, la API comprueba la conexión, crea las tablas que falten y aplica la migración compatible con los atletas ya creados. No usa sincronización destructiva. En producción configura también SMTP y el cliente OAuth de Google.

## Variables de entorno

- `DATABASE_URL`: URL de PostgreSQL/Neon. Usa la URL con pooler para el despliegue.
- `JWT_SECRET`: secreto privado de 32 caracteres o más; no lo incluyas en Unity ni en Git.
- `JWT_EXPIRES_IN`: duración del token (por defecto `12h`).
- `GOOGLE_CLIENT_IDS`: client IDs OAuth permitidos, separados por comas. El servidor verifica los ID tokens que envía la app.
- `PASSWORD_RESET_URL`: deep link que abre la pantalla de cambio de contraseña en Praxen.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: servidor de correo para enviar enlaces de recuperación.
- `PORT`: puerto HTTP (por defecto 8080).
- `CORS_ORIGINS`: orígenes web permitidos separados por comas; Unity nativa normalmente no envía `Origin`.
- `DB_POOL_MAX`: máximo de conexiones PostgreSQL por proceso (por defecto 5).
- `DB_SSL`: habilita SSL para PostgreSQL (por defecto según la configuración del proveedor).
- `NODE_ENV`: entorno, por ejemplo `development` o `production`.

## Autenticación

Todas las rutas de `/api/atletas` y `/api/sesiones` requieren `Authorization: Bearer <token>`. Los tokens los emite la API después de validar correo/contraseña o un ID token de Google. El `athleteId` enviado dentro de una sesión se ignora: el servidor la guarda asociada al atleta autenticado.

### POST `/api/auth/register`

Entrada: `{ "nombre": "Ana Pérez", "federacion": "Atletismo", "email": "ana@example.com", "password": "una-clave-segura" }`.

Crea una cuenta y su perfil de atleta en una transacción, cifra la contraseña con bcrypt y devuelve `token`, `user` y `atleta`.

### POST `/api/auth/login`

Entrada: `{ "email": "ana@example.com", "password": "una-clave-segura" }`. Devuelve un token Bearer y los datos básicos de la cuenta.

### POST `/api/auth/google`

Entrada en el primer registro: `{ "idToken": "<Google ID token>", "federacion": "Atletismo" }`. En inicios posteriores basta el ID token. La federación no se obtiene del correo Google. La API verifica firma, audiencia, emisor, caducidad y correo verificado con Google, y luego emite su propio token. Requiere `GOOGLE_CLIENT_IDS` con los client IDs de OAuth configurados para la app.

### POST `/api/auth/forgot-password`

Entrada: `{ "email": "ana@example.com" }`. Responde con el mismo mensaje tanto si existe la cuenta como si no. Envía un enlace de un solo uso que caduca en 30 minutos. En desarrollo, si no hay SMTP, el enlace se escribe en la consola del servidor; en producción configura un proveedor SMTP.

### POST `/api/auth/reset-password`

Entrada: `{ "token": "<token del enlace>", "newPassword": "otra-clave-segura" }`. Al aceptar el cambio, el token queda invalidado.

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

## Google en Android

La ruta `/api/auth/google` sirve para iniciar sesión con una cuenta Google normal. La app Android debe obtener el ID token usando el flujo Google Identity Services y enviarlo por HTTPS. Iniciar sesión con un perfil de Google Play Games es una integración distinta; requiere configurarla en Play Console y no se debe sustituir un flujo por el otro.

## Pruebas

Ejecuta `npm test`. Las pruebas de validación no necesitan una base de datos Neon. Para probar rutas, configura una base PostgreSQL y usa Postman o curl con el token devuelto al registrar o iniciar sesión.
