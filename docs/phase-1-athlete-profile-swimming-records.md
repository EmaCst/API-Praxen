# Fase 1 — Perfil deportivo y marcas de natación

Branch: `feature/phase-1-athlete-profile-swim-marks`

## Perfil del deportista (issue #9)
- Añade `birth_date`, `category` y `specialty` como campos opcionales y compatibles con registros existentes.
- La edad se deriva de `birth_date` en la capa de presentación/consulta; nunca se almacena como valor mutable.
- La fecha de nacimiento es dato personal. Las respuestas públicas/listados administrativos no deben exponerla por defecto. El acceso y la corrección deben limitarse al propio deportista y a personal autorizado dentro de la asociación activa.
- No se incorporan dirección, teléfono, datos médicos ni otros datos sensibles sin una necesidad y política explícitas.

## Marcas de natación (issue #10)
- Una marca es un evento histórico: estilo, distancia en metros, tiempo entero en milisegundos, fecha, tipo (entrenamiento/competencia), origen (manual/sensor), asociación y autor.
- Se conservan marcas empatadas; no se sobrescribe el historial.
- Mejor marca personal (PB) se calcula como el menor `time_ms` para el atleta, estilo y distancia; debe respetar el alcance de asociación y los filtros de autorización.
- `source=sensor` prepara el contrato, pero no integra hardware.
- Las correcciones deben auditarse y preservar autoría; antes de habilitar edición/borrado se debe definir la política de auditoría.

## Migración
La migración 015 es aditiva: los campos nuevos del perfil son NULL para filas existentes. La tabla de marcas empieza vacía. No altera las tablas ni los datos de sesiones actuales.

## Pendiente de completar antes de declarar la fase lista
1. Validadores y controladores HTTP de perfil con autorización por rol y asociación.
2. CRUD de marcas, cálculo de PB, paginación e historial.
3. Pruebas de migración, validación, permisos, aislamiento multi-asociación y empates.
4. Documentación OpenAPI/contratos y verificación en una base de pruebas.
