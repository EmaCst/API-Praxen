# API Praxen

API REST para guardar las sesiones de ejercicios de la app Unity Praxen. Está construida con Node.js, Express, Sequelize y PostgreSQL (Neon).

## Requisitos

- Node.js 20 o posterior
- Una base de datos PostgreSQL
- Una clave de API de prueba para proteger las rutas

## Ejecutar localmente

1. Instala dependencias con `npm install`.
2. Copia `.env.example` a `.env` y completa DATABASE_URL y API_KEY.
3. Ejecuta `npm start`.

Al iniciar, Sequelize verifica la conexión y crea las tablas si aún no existen. No se debe habilitar sincronización destructiva.

## Variables de entorno

- DATABASE_URL: URL PostgreSQL de Neon; usar la URL con pooler.
- API_KEY: clave de prueba enviada en el encabezado x-api-key.
- PORT: puerto del servidor (por defecto 8080).
- CORS_ORIGINS: orígenes web permitidos separados por comas. Las llamadas nativas de Unity no envían Origin.
- DB_POOL_MAX: máximo de conexiones por proceso (por defecto 5).
- NODE_ENV: development o production.

La clave compartida sirve para pruebas controladas. Una clave incluida dentro de un APK se puede extraer; para una publicación con cuentas se debe sustituir por autenticación con tokens de usuario.

## Rutas

### GET /api/health

Comprueba que el proceso HTTP está activo.

### POST /api/atletas

Crea un atleta con el campo nombre. La respuesta contiene el id que Unity debe enviar como athleteId en las sesiones.

### GET /api/atletas?limit=20&offset=0

Lista atletas con paginación.

### GET /api/atletas/:id

Consulta un atleta.

### GET /api/atletas/:id/sesiones

Consulta las sesiones de un atleta.

### POST /api/sesiones

Guarda una sesión con el formato de SessionResultData de Unity. Requiere Content-Type: application/json y x-api-key. La operación es idempotente por sessionId: un reintento con el mismo UUID no duplica el registro. athleteId debe referenciar un atleta previamente registrado.

La respuesta de una sesión nueva es HTTP 201 con created: true. Un reintento recibe HTTP 200 con created: false.

### GET /api/sesiones?athleteId=1&limit=20&offset=0

Devuelve las sesiones del atleta ordenadas por fecha descendente.

### GET /api/sesiones/:sessionId

Devuelve una sesión por UUID.

## Ejemplo de envío

```bash
curl -X POST http://localhost:8080/api/sesiones \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: cambia-esta-clave' \
  --data @session.json
```

## Modelo de almacenamiento

La tabla athletes guarda los registros básicos de deportistas y training_sessions los relaciona mediante athleteId. Los arreglos de resultados se conservan en columnas JSONB para no descartar intentos, métricas ni coordenadas del área calibrada.

## Pruebas

Ejecuta `npm test` para validar el contrato de entrada. Las pruebas no requieren una base Neon.
