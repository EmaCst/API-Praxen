# Invitaciones a asociaciones

## Modelo de acceso

El registro público crea una cuenta general de Praxen. Tener cuenta y tener membresía institucional son conceptos distintos. Una cuenta general no recibe automáticamente una membresía ni acceso a los datos privados de una asociación.

La afiliación se concede por invitación de un administrador autorizado. El rol de la cuenta sigue siendo independiente de su membresía.

## Flujo inicial de invitación

1. Un administrador de la asociación invita una cuenta de deportista existente mediante su nombre de usuario.
2. La API comprueba que el administrador tenga membresía activa en esa asociación (un superadmin puede operar globalmente).
3. La API genera un token aleatorio de un solo uso, guarda únicamente su hash y devuelve el token al administrador una sola vez para que lo comparta por el canal acordado.
4. El deportista inicia sesión con su cuenta y acepta la invitación mediante `POST /api/auth/accept-invitation`.
5. La API valida el token, el nombre de usuario destinatario, el estado y la expiración; crea/reactiva la membresía y asocia su perfil de atleta a la organización.
6. Las invitaciones caducan a los siete días. Los tokens se almacenan como SHA-256 y no se devuelven nuevamente.

## Endpoints

### Crear invitación

`POST /api/admin/asociaciones/:associationId/invitaciones`

Requiere token de administrador del panel.

Entrada:

```json
{ "username": "usuario_destino" }
```

Respuesta 201: metadatos de invitación y token de un solo uso. El administrador debe compartirlo con el usuario destinatario. No se envía correo automáticamente en esta primera etapa.

### Aceptar invitación

`POST /api/auth/accept-invitation`

Requiere sesión autenticada de deportista.

Entrada:

```json
{ "token": "token_recibido_del_administrador" }
```

La invitación solo puede aceptarse desde la cuenta cuyo nombre de usuario fue invitado. Una vez aceptada, no puede reutilizarse.

## Limitaciones deliberadas de esta etapa

- No se implementa envío de correo/SMS ni generación de carnet/QR todavía.
- El administrador invita una cuenta ya registrada por su username; la invitación no crea cuentas automáticamente.
- La interfaz web para gestionar invitaciones queda para un issue independiente de Praxen Web.
- La vista analítica de usuarios generales frente a miembros institucionales queda fuera de esta PR.

## Seguridad y operación

- El token completo se muestra una sola vez al crear la invitación.
- La base conserva únicamente el hash SHA-256 del token.
- Se valida que el administrador pertenezca a la asociación solicitada.
- Se valida que el destinatario sea una cuenta activa con rol de deportista.
- La aceptación y el cambio de membresía ocurren dentro de una transacción.
- Las invitaciones expiran después de siete días.
