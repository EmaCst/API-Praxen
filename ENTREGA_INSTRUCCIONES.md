# Praxen API — paquete de finalización del backend

Este paquete **no es el repositorio completo**. Contiene archivos y un script que descarga
la rama `main` actual de `EmaCst/API-Praxen` y genera un ZIP completo con los ajustes finales.

## Para obtener el ZIP completo

1. Instala Python 3.10+ si no lo tienes.
2. Descomprime este paquete.
3. Ejecuta `python preparar_api_completa.py` en la carpeta extraída (necesitas Internet).
4. Se generará `API-Praxen-lista-para-subir.zip`. Descomprímelo y súbelo a GitHub, **sin reemplazar** tus variables de entorno de Render.

## Cambios del paquete

- CRUD y asignación N:M de grupos (ya está en `main`).
- Resultados filtrables por `groupId` (ya está en `main`).
- Federación Natación por defecto en la API (ya está en `main`).
- Directorio administrativo de cuentas con validación y paginación reforzadas.
- Restablecimiento por Super Admin validando token y contraseña, con contraseña temporal
  `praxen01`, auditoría, cambio obligatorio e invalidación de sesiones anteriores.
- Cambio de contraseña propia con token válido y comprobación de contraseña actual.
- Índice de unicidad de username sin distinguir mayúsculas (requiere ausencia de colisiones).

## AVISOS antes de desplegar

- Haz respaldo de Neon antes del despliegue.
- El backend ejecuta `sequelize.sync()` y las migraciones SQL al iniciar.
- Los JWT emitidos antes del cambio a `token_version` dejarán de funcionar (requiere volver a iniciar sesión).
- El restablecimiento con `praxen01` es una contraseña pública y compartida. Existe riesgo de
  acceso indebido antes de que la persona la cambie. No se recomienda para producción sin
  un método adicional para confirmar al destinatario.
- El backend exige cambio obligatorio; para administradores debe estar listo el diálogo
  de Analytics y para deportistas la app Unity aún no tiene ese flujo (por tu instrucción no se tocó Unity).
- No se han realizado pruebas reales contra la base de datos de Neon ni Render.
- Si hay usernames duplicados solo por uso de mayúsculas, la migración 006 fallará de forma
  deliberada para no alterar cuentas sin revisión.

## Endpoints

- `GET /api/admin/grupos`
- `POST /api/admin/grupos`
- `PATCH /api/admin/grupos/:groupId`
- `DELETE /api/admin/grupos/:groupId`
- `GET /api/admin/grupos/:groupId/usuarios`
- `POST /api/admin/grupos/:groupId/usuarios` con `{ "userId": 1 }`
- `DELETE /api/admin/grupos/:groupId/usuarios/:userId`
- `GET /api/admin/usuarios?role=athlete&limit=25&offset=0`
- `POST /api/admin/usuarios/:userId/restablecer-password` con `{ "adminPassword": "..." }` (Super Admin)
- `POST /api/auth/change-password` con `{ "currentPassword": "...", "newPassword": "..." }`
- `groupId` puede enviarse a las consultas administrativas de resúmenes, evolución, sesiones y atletas.
