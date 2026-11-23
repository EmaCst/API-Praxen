# Invitaciones a asociaciones

## Modelo de acceso
El registro público crea una cuenta general de Praxen. Tener cuenta y tener membresía institucional son conceptos distintos. La afiliación se concede por invitación de un administrador autorizado.

## Flujo
1. Un administrador invita una cuenta de deportista existente por nombre de usuario.
2. La API valida su membresía activa en la asociación (el superadmin tiene alcance global).
3. Se genera un token aleatorio de un solo uso; la base guarda únicamente su hash SHA-256 y el token se muestra una sola vez.
4. El deportista autenticado acepta mediante `POST /api/auth/accept-invitation`.
5. La API valida destinatario, estado y vencimiento; crea/reactiva la membresía y vincula el perfil del atleta.
6. Las invitaciones vencen a los siete días.

## Endpoints
### Crear
`POST /api/admin/asociaciones/:associationId/invitaciones`

Entrada: `{ "username": "usuario_destino" }`. Devuelve metadatos y token de un solo uso. No envía correo automáticamente.

### Listar
`GET /api/admin/asociaciones/:associationId/invitaciones?status=pending&limit=25&offset=0`

Estados admitidos: `pending`, `accepted`, `expired`, `revoked`. La respuesta es paginada e incluye destinatario, estado, fechas y creador/revocador. Nunca incluye token ni hash. Las pendientes vencidas se actualizan a `expired` al consultar.

### Revocar
`DELETE /api/admin/asociaciones/:associationId/invitaciones/:invitationId`

Solo se revocan invitaciones pendientes y vigentes. Se registra quién revocó y cuándo; también se agrega un evento a `admin_audit_logs` cuando la cuenta destinataria existe. Las aceptadas, vencidas o ya revocadas no se pueden revocar.

### Aceptar
`POST /api/auth/accept-invitation`

Requiere sesión de deportista y recibe `{ "token": "..." }`. Solo puede aceptar la cuenta cuyo username fue invitado y el token no se puede reutilizar.

## Seguridad
- Los administradores solo consultan y revocan invitaciones de asociaciones donde tienen membresía activa; el servidor valida el alcance.
- Solo se invita a cuentas activas con rol de deportista.
- La aceptación y actualización de membresía se realizan en una transacción.
- No se implementan correo/SMS ni carnet/QR en esta etapa.
