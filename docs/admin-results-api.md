# Praxen — API de resultados y administración (RBAC)

## Arquitectura de cuentas

Se utiliza **una sola tabla `users`** con un campo `role`, en lugar de dos tablas independientes de credenciales. Cada usuario de la app sigue teniendo su perfil en `athletes`. Las cuentas administrativas no necesitan perfil de atleta.

| Rol persistido | Token | Acceso |
|---|---|---|
| `athlete` | JWT con audiencia `praxen-app` y `athleteId` | App, perfil, carga y consulta de **sus propias** sesiones y resultados |
| `admin` | JWT con audiencia `praxen-dashboard` **sin** `athleteId` | Página administrativa: resultados globales, por federación y por atleta, y listados |

Las capacidades se determinan en `app/security/roles.js`. Un `admin` dispone de `results:all:read`, `results:federation:read`, `results:athlete:read`, `athletes:list` y `federations:list`. Un `athlete` dispone de `results:own:read` y `results:own:write`.

**Seguridad:**
- Cada petición valida firma, emisor y audiencia del JWT, y vuelve a leer el **rol actual desde PostgreSQL**. Un JWT antiguo no permite conservar derechos administrativos tras una revocación.
- No se confía en un `role`, `permissions` ni `athleteId` enviado por el frontend.
- `POST /api/auth/register` y el registro con Google solo crean atletas, nunca administradores.
- Los administradores inician sesión por correo y contraseña; Google no puede vincularse desde la app a una cuenta administrativa.
- Los tokens del panel no son válidos para rutas exclusivas de atletas y viceversa.
- Los usuarios atletas solo pueden ver sus sesiones. Para los resultados propios el servidor obtiene su `athleteId` del JWT verificado y comprueba que siga perteneciendo a su cuenta.
- No existe un endpoint público para crear, promover o elevar administradores.

### Crear la primera cuenta administrativa

Tras desplegar las migraciones, desde una **terminal confiable del servidor** (o una ejecución manual restringida del hosting):

```bash
ADMIN_EMAIL=directora@example.com \
ADMIN_NAME="Administración Praxen" \
ADMIN_PASSWORD="una-contraseña-segura" \
npm run admin:provision
```

No compartas credenciales ni las guardes en el repositorio o Unity. En entornos compartidos es preferible proporcionar esas variables desde un almacén de secretos o de forma temporal; revócalas/elíminalas al terminar. Si el correo ya pertenece a un atleta, el comando **rechaza** elevarlo a administrador. Ejecutarlo con un correo administrativo existente actualiza su contraseña, sin crear duplicados.

El token administrativo caduca por defecto en **2 horas** (`JWT_ADMIN_EXPIRES_IN`); el token de la app mantiene sus 12 horas configurables. Para recuperar contraseñas del panel por email puede configurarse `ADMIN_PASSWORD_RESET_URL` (HTTPS obligatorio en producción). Sin esa URL, un administrador debe recuperar su acceso con el comando interno `admin:provision`; nunca recibe por correo el enlace `praxen://` destinado a la app.

Se aplica la migración aditiva `002-roles.sql`: los usuarios anteriores reciben `role='athlete'`, sin borrar sesiones ni perfiles. No hay autoasignación de administradores.

### Autenticación para el panel

`POST /api/auth/login` con `{ "email": "...", "password": "..." }` devuelve para un administrador:

```json
{
  "token": "<jwt-para-dashboard>",
  "user": {
    "id": 10,
    "nombre": "Administración Praxen",
    "email": "directora@example.com",
    "role": "admin",
    "permissions": [
      "results:all:read",
      "results:federation:read",
      "results:athlete:read",
      "athletes:list",
      "federations:list"
    ]
  },
  "atleta": null
}
```

`GET /api/auth/me` (con token) permite a la página consultar el rol y los permisos activos. La aplicación Unity conserva su flujo de tokens de atleta y las rutas existentes de `/api/sesiones`.

## API de resultados para la app (solo atleta)

Todas requieren `Authorization: Bearer <JWT-app>`.

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/resultados/me/metricas` | Catálogo de ejercicios y métricas conocidas |
| GET | `/api/resultados/me/ultima` | Sesión más reciente del atleta; admite `exerciseType` |
| GET | `/api/resultados/me/resumen` | Número de sesiones, promedios históricos y métricas por ejercicio |
| GET | `/api/resultados/me/evolucion` | Serie temporal de cada sesión y variación respecto a la anterior |
| GET | `/api/resultados/me/sesiones` | Listado paginado de resultados propios |

Siguen disponibles `GET /api/sesiones`, `GET /api/sesiones/:sessionId` y `POST /api/sesiones` para compatibilidad con Unity.

## API exclusiva para administradores

Todas requieren `Authorization: Bearer <JWT-dashboard>`.

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/admin/atletas` | Listar y buscar atletas (nombre, federación, paginación) |
| GET | `/api/admin/federaciones` | Listar federaciones declaradas con su número de atletas |
| GET | `/api/admin/resultados/metricas` | Metadatos de ejercicios y métricas |
| GET | `/api/admin/resultados/ultima` | Última sesión en el alcance consultado |
| GET | `/api/admin/resultados/resumen` | Promedios y totales en el alcance consultado |
| GET | `/api/admin/resultados/evolucion` | Tendencias globales, de federación o de un atleta |
| GET | `/api/admin/resultados/sesiones` | Sesiones del alcance, paginadas |
| GET | `/api/admin/resultados/sesiones/:sessionId` | Detalle de una sesión verificado contra filtros |
| GET | `/api/admin/resultados/federaciones/resumen` | Comparativo de promedios de todas las federaciones |

**La misma ruta administrativa admite tres alcances:**

- **Global**: sin `athleteId` ni `federacion`. Ej.: `GET /api/admin/resultados/resumen`.
- **Por federación**: `?federacion=Atletismo`. Ej.: `GET /api/admin/resultados/resumen?federacion=Atletismo`.
- **Por usuario**: `?athleteId=42`. Ej.: `GET /api/admin/resultados/evolucion?athleteId=42&exerciseType=aimlab`.

Si se envían ambos filtros, la API verifica que el atleta pertenezca a esa federación y responde 404 si no coincide. Una cuenta normal no puede acceder a ninguna de estas rutas, aunque añada filtros o modifique su token. Estos endpoints son **solo de lectura**.

### Filtros compatibles

```
exerciseType = aimlab | feet_targets | running_direction_change
metric       = hits | misses | accuracyPercent | targetsReached | ...
mode         = individual | circuit | custom
from         = AAAA-MM-DD       (inclusive UTC)
to           = AAAA-MM-DD       (inclusive UTC)
period       = day | week | month  (para las series de población)
limit        = 1..100
offset       = entero >= 0
```

En administración se añaden `federacion` y `athleteId`. Los filtros de intervalo se interpretan como fechas **UTC completas**; por ejemplo, `to=2026-10-31` incluye sesiones del 31 de octubre hasta antes del 1 de noviembre UTC.

Ejemplos:

```
GET /api/resultados/me/ultima?exerciseType=feet_targets
GET /api/resultados/me/resumen?from=2026-01-01&to=2026-12-31
GET /api/resultados/me/evolucion?exerciseType=aimlab&metric=accuracyPercent&limit=30

GET /api/admin/resultados/resumen?federacion=Atletismo&exerciseType=aimlab
GET /api/admin/resultados/evolucion?federacion=Atletismo&exerciseType=aimlab&metric=hits&period=month
GET /api/admin/resultados/ultima?athleteId=42&exerciseType=running_direction_change
GET /api/admin/atletas?federacion=Atletismo&limit=25&offset=0
```

### Contrato de respuestas

`/resumen`:

```json
{
  "scope": { "type": "athlete", "athleteId": 42, "federacion": "Atletismo" },
  "summary": {
    "aggregationBasis": "equal_weight_per_session",
    "totalSessions": 3,
    "athleteCount": 1,
    "firstSessionAt": "2026-01-01T12:00:00.000Z",
    "lastSessionAt": "2026-03-01T12:00:00.000Z",
    "averageDurationSeconds": 180,
    "exercises": [
      {
        "exerciseType": "aimlab",
        "sessions": 3,
        "results": 3,
        "athletes": 1,
        "metrics": {
          "accuracyPercent": {
            "key": "accuracyPercent",
            "label": "Precisión",
            "unit": "%",
            "direction": "higher",
            "average": 75,
            "min": 50,
            "max": 95,
            "samples": 3
          }
        }
      }
    ]
  }
}
```

Los campos de métricas son **dinámicos**: aparecen cuando existen en los JSON guardados de Unity. El ejemplo es ilustrativo; no representa datos reales. `GET /ultima` devuelve `latest` (sesión completa o `null`) y `metrics` (interpretación resumida). `GET /evolucion` devuelve `evolution.series[]` con `exerciseType`, `metric` y `points[]`.

Para el atleta, cada punto de evolución corresponde a una sesión (orden cronológico). Para global/federación cada punto corresponde a un período UTC agregado (`day`, `week` o `month`). Cada serie identifica su propia unidad y sentido de mejora.

## Cómo se calculan los resultados

Praxen guarda las sesiones en `training_sessions` con las tres listas JSONB originales. No se inventan puntuaciones ni se promedian unidades incompatibles:

- `exercises` → `aimlab` (manos).
- `runningExercises` → `running_direction_change` (carrera).
- `footExercises` → `feet_targets` (pies).

Las métricas conocidas incluyen `hits`, `misses`, `score`, `targetsReached`, `averageReactionSeconds`, `totalTravelledMeters`, además de los parámetros `sets`, `setDurationSeconds` y `restDurationSeconds` cuando la app los envía. Sets, descanso y duración configurada se tratan como parámetros **neutrales**: no se presentan automáticamente como mejoras. La precisión se calcula como `hits / (hits + misses) * 100` únicamente si existen ambos contadores y hay al menos un intento. Los demás valores numéricos simples añadidos por futuras versiones de Unity se conservan con dirección `neutral`; no se presupone que subir o bajar implique una mejora.

- **Promedio individual:** cada sesión cuenta una vez, incluso si se registraron varios resultados del mismo ejercicio en ella. Para esos registros se obtiene primero el promedio de la sesión; la precisión (`accuracyPercent`) pondera por el **número real de intentos** cuando hay contadores de aciertos y fallos en todos los registros, evitando que un set con un intento pese igual que uno con cien.
- **Promedio global/federación:** primero se promedian las sesiones de cada atleta; después se promedian los atletas con el mismo peso. Evita que un deportista que entrenó 100 veces domine sobre otro que entrenó 5.
- **Evolución global/federación:** el mismo promedio equitativo entre atletas se calcula dentro de cada período.
- **Mejora:** se calcula respecto a la sesión/período anterior solo cuando está justificada la dirección (`higher`: aciertos, precisión; `lower`: fallos, reacción). Distancia recorrida y métricas desconocidas se clasifican como neutrales. Un `improvement` positivo significa una mejora en unidades de esa métrica.
- **Duración:** se calcula a partir de `startedAt` y `endedAt` de cada sesión, sin confundirla con tiempo de reacción ni descanso.
- Si una federación o usuario todavía no tiene sesiones, el resumen devuelve cero sesiones y arreglos de métricas vacíos; la última sesión es `null`.

**Limitaciones deliberadas:** la federación es por ahora un campo declarado/editable por el atleta, no una membresía certificada. El panel debe señalarlo hasta incorporar una tabla de federaciones y un proceso de validación de afiliación. Los análisis históricos consultan hasta 50 000 sesiones por solicitud; si se supera el límite, la API responde con un error explícito 413, **nunca con un promedio truncado silenciosamente**. Para grandes volúmenes se recomienda un pipeline de agregación persistente por sesión/atleta.

## Seguridad y despliegue

- Los resultados requieren un JWT verificado con audiencia correcta.
- Se revocan permisos en tiempo real consultando el rol almacenado.
- No se permite registrar administradores desde la app.
- Las rutas con datos personales indican `Cache-Control: no-store`.
- Las rutas de autenticación mantienen rate limiting por IP y las consultas analíticas cuentan con un límite adicional de 60 solicitudes por minuto.
- La API devuelve errores 400 ante filtros inválidos y 404 si el atleta no pertenece al alcance solicitado.
- Se añadieron índices para sesiones por fecha, atletas por federación y usuarios por rol mediante migración SQL aditiva.
- Configure HTTPS y `CORS_ORIGINS` con el dominio real de la página administrativa. El CORS del navegador **no sustituye** la autorización JWT.
- Si es importante bloquear todos los cambios del atleta tras el entrenamiento, añada posteriormente certificación/gestión de federaciones desde el panel.
- No realizar `sequelize.sync({ force: true })` ni migraciones destructivas con datos existentes.

## Pruebas

```bash
npm ci
npm test
```

Las pruebas en CI cubren separación atleta/admin, autorización por federación, sesiones ajenas, tokens revocados, creación pública sin escalada de rol, sesiones con los tres ejercicios, promedios ponderados y tendencias.

Antes de desplegar: verificar la migración `002-roles.sql`, aprovisionar una cuenta administrativa separada, iniciar sesión en el panel, cargar sesiones con Unity y consultar los tres alcances contra Neon real. Las pruebas HTTP emplean modelos simulados y no sustituyen esa verificación integrada con una instancia real de PostgreSQL.
