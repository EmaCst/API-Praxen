# Solicitudes de incorporación de administradores

## Regla de acceso

Las cuentas conservan su rol global (`admin` o `superadmin`) y la autorización institucional depende de `association_memberships`.

- Una asociación sin administradores activos permite al superadmin asignar directamente al primer administrador.
- Cuando existe al menos un administrador activo, el superadmin no puede conceder acceso directamente: debe crear una solicitud para una cuenta existente con rol `admin`.
- Cualquier administrador activo de esa asociación puede aprobar o rechazar la solicitud. La primera decisión resuelve el caso; no se requiere unanimidad.
- Si una asociación vuelve a quedarse sin administradores activos, se habilita nuevamente la asignación directa como mecanismo de recuperación.
- Aprobar una solicitud crea o reactiva únicamente la membresía de esa cuenta en la asociación indicada.

## Endpoints

Todas las rutas requieren JWT de dashboard.

| Método | Ruta | Permiso / alcance |
|---|---|---|
| POST | `/api/admin/asociaciones/:associationId/solicitudes-administrador` | Solo superadmin; crea solicitud |
| GET | `/api/admin/asociaciones/:associationId/solicitudes-administrador?status=pending` | Superadmin o administrador activo de esa asociación |
| PATCH | `/api/admin/asociaciones/:associationId/solicitudes-administrador/:requestId` | Administrador activo de la asociación |
| GET | `/api/admin/asociaciones/:associationId/auditoria-administradores` | Superadmin o administrador activo de esa asociación |

Crear solicitud:

```json
{ "userId": 42 }
```

Decidir solicitud:

```json
{ "decision": "approved" }
```

La decisión también puede ser `rejected`. Las solicitudes pendientes duplicadas para la misma cuenta y asociación se bloquean mediante un índice único parcial en PostgreSQL.

El endpoint existente `POST /api/admin/asociaciones/:associationId/administradores` se conserva exclusivamente para la asignación inicial cuando no existe ningún administrador activo. Si ya hay uno, responde 409 y exige crear una solicitud.

## Auditoría

Se reutiliza `admin_audit_logs`. Se registran:
- `association_admin_assigned_initial`
- `association_admin_request_created`
- `association_admin_request_approved`
- `association_admin_request_rejected`
- `association_admin_revoked`
- `association_admin_account_deactivated`
- `association_admin_account_reactivated`

Cada evento incluye actor, cuenta afectada, asociación y, cuando corresponde, identificador de solicitud. Las decisiones y la actualización de membresía se guardan dentro de una sola transacción. Los administradores solo pueden consultar eventos de asociaciones donde mantienen una membresía activa; el superadmin puede consultar cualquier asociación.

La desactivación o reactivación global de una cuenta administrativa también se registra en cada asociación donde mantiene una membresía activa. No se almacenan contraseñas, tokens ni secretos en el registro.
