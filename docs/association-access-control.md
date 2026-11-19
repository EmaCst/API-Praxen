# Autorización y aislamiento entre asociaciones

## Alcance

La API separa el rol global de una cuenta de su pertenencia institucional:

- `superadmin`: alcance global. Puede consultar todas las asociaciones y, cuando lo solicita, filtrar por una asociación concreta.
- `admin`: requiere al menos una membresía activa. Solo consulta y opera sobre las asociaciones activas asignadas a su cuenta.
- `athlete`: las rutas de perfil y resultados usan exclusivamente el `athleteId` validado contra el usuario autenticado.

El JWT identifica la cuenta, pero no es fuente de autoridad para el rol ni para la asociación. El middleware consulta el rol y las membresías vigentes en PostgreSQL en cada petición. Cambios o revocaciones de membresía aplican en la siguiente petición.

## Reglas de autorización

1. No se confía en `associationId`, `athleteId`, `groupId` ni `userId` enviados por el cliente para conceder acceso.
2. Un admin no puede ampliar su alcance cambiando query params, body o segmentos de URL.
3. Los endpoints de resultados aplican el conjunto de asociaciones autorizadas al conjunto de atletas antes de leer sesiones, agregarlas o paginarlas.
4. Las operaciones sobre grupos comprueban la asociación propietaria del grupo antes de listar miembros, editar, eliminar, asignar o retirar deportistas.
5. Las invitaciones comprueban la pertenencia activa del administrador a la asociación indicada.
6. El superadmin conserva alcance global, pero las asociaciones seleccionadas explícitamente deben existir y estar activas.
7. Las cuentas sin membresía activa no pueden usar el panel administrativo.

## Auditoría de intentos entre asociaciones

Los intentos detectados de usar una asociación, grupo o atleta fuera del alcance de un administrador generan un evento `association_access_denied` en `admin_audit_logs`. Se guarda el actor, ruta, método, asociación intentada y motivo. La denegación no depende de que la auditoría pueda guardarse: si falla el registro, la petición sigue bloqueada.

## Row-Level Security (RLS)

RLS de PostgreSQL fue evaluado, pero no se activa en esta etapa. La API usa conexiones Sequelize reutilizadas desde un pool y actualmente no establece un contexto de usuario/asociación dentro de cada transacción de lectura. Habilitar políticas sin ese contrato transaccional, usando además un usuario de base de datos propietario de tablas, podría dar una falsa sensación de aislamiento o causar un comportamiento distinto al esperado.

La implementación actual aplica aislamiento en middleware y en cada consulta de la capa de aplicación. Para una etapa futura con RLS se requiere:

- un usuario de base de datos de runtime que no sea propietario de tablas ni tenga `BYPASSRLS`;
- establecer `app.user_id` y el contexto de asociaciones con `SET LOCAL` dentro de cada transacción;
- activar `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` en tablas multi-tenant;
- políticas explícitas para atletas, grupos, sesiones, membresías e invitaciones;
- pruebas de integración con el mismo rol de base de datos usado en producción y conexiones concurrentes del pool.

No se debe establecer contexto con variables de sesión persistentes en una conexión del pool.

## Pruebas de seguridad

La suite verifica que dos administradores con membresías distintas reciben resultados y directorios diferentes, que un admin no puede seleccionar la asociación de otro ni consultar un atleta ajeno por ID, y que las operaciones de grupos ajenos devuelven recurso no encontrado y generan auditoría.

## Despliegue

No se requiere migración de esquema para esta etapa. La membresía activa ya existe en `association_memberships`; la auditoría utiliza `admin_audit_logs`. Ejecutar la suite completa antes de fusionar y comprobar con cuentas de prueba de dos asociaciones en staging.
