# Gestión de asociaciones y administradores

## Roles

- `superadmin`: único rol que puede crear, editar, activar/desactivar asociaciones y asignar/revocar administradores.
- `admin`: puede consultar las asociaciones a las que pertenece y seleccionar el contexto activo. Sus operaciones existentes quedan limitadas al contexto seleccionado.
- `athlete`: no tiene acceso al panel administrativo ni a la gestión institucional.

El rol no se recibe del cliente. La API lo resuelve desde la cuenta autenticada y verifica las membresías activas en PostgreSQL.

## Asociaciones

### Listar asociaciones visibles
`GET /api/admin/asociaciones`

El superadmin recibe todas las asociaciones. Un admin recibe únicamente las asociaciones activas de sus membresías.

### Crear asociación
`POST /api/admin/asociaciones`

```json
{ "name": "Asociación de Natación del Norte", "slug": "natacion-del-norte" }
```

El slug es opcional; si se omite, se genera a partir del nombre. El endpoint solo acepta nombre y slug. No acepta estado, roles ni membresías.

### Consultar, editar y cambiar estado
- `GET /api/admin/asociaciones/:associationId`
- `PATCH /api/admin/asociaciones/:associationId` con `{ "name": "...", "slug": "..." }`
- `PATCH /api/admin/asociaciones/:associationId/estado` con `{ "isActive": false }`

No se permite desactivar la última asociación activa. Desactivar una asociación no elimina sus datos ni membresías; al reactivarla, las membresías activas vuelven a tener efecto.

## Administradores por asociación

### Listar administradores
`GET /api/admin/asociaciones/:associationId/administradores`

### Asignar una cuenta admin existente
`POST /api/admin/asociaciones/:associationId/administradores`

```json
{ "userId": 42 }
```

Solo se asignan cuentas existentes con rol `admin` y estado activo. No se puede promover una cuenta atleta ni asignar un superadmin.

### Revocar membresía
`DELETE /api/admin/asociaciones/:associationId/administradores/:userId`

La membresía se marca inactiva; no se elimina la cuenta. Si era el contexto activo del administrador, la API selecciona automáticamente la única membresía restante o deja el contexto sin seleccionar si quedan varias.

## Contexto activo de administrador

### Consultar contexto
`GET /api/admin/contexto-asociacion`

Devuelve las asociaciones activas asignadas, `activeAssociationId` y `requiresSelection`. Si el administrador tiene una sola asociación, se usa automáticamente.

### Seleccionar contexto
`PUT /api/admin/contexto-asociacion`

```json
{ "associationId": 3 }
```

La selección se guarda en `users.active_association_id`. La preferencia no concede acceso: debe existir una membresía activa y la asociación debe estar activa. Si el administrador tiene varias asociaciones y no ha seleccionado una, las operaciones de datos responden HTTP 409 hasta seleccionar contexto.

## Crear administradores

El endpoint existente `POST /api/admin/administradores` admite ahora `associationId` opcional. El superadmin puede asignar la cuenta recién creada a la asociación indicada; si no se envía, se conserva la asociación inicial para compatibilidad.

```json
{
  "nombre": "Administradora Norte",
  "username": "admin_norte",
  "password": "cambiar-esta-clave",
  "associationId": 3
}
```

El servidor fuerza el rol `admin`, estado activo y membresía. Nunca acepta `role`, `permissions` ni `isActive` del cliente.

## Auditoría

Las operaciones institucionales registran eventos en `admin_audit_logs`: `association_created`, `association_updated`, `association_activated`, `association_deactivated`, `association_admin_assigned`, `association_admin_revoked` y `association_context_selected`.

## Migración

La migración `009-admin-association-context.sql` añade `users.active_association_id` como preferencia nullable con FK a `associations`. Es aditiva y no modifica membresías ni datos históricos. El runner existente la aplica transaccionalmente al iniciar la API.
