# Mapa de arquitectura

SIRAI se construye como un monolito modular dentro de un monorepo. Compartir repositorio facilita mantener contratos compatibles, pero no mezcla la aplicación web, la API ni la persistencia.

```text
apps/web ── HTTP/REST ──> apps/api ──> packages/db ──> MySQL 8 (Drizzle ORM)
   │                          │
   ├──> packages/ui           ├──> packages/contracts
   ├──> packages/contracts    ├──> packages/domain
   ├──> packages/domain       └──> packages/auth
   └──> packages/auth
```

## Responsabilidades

- `apps/web`: presentación, accesibilidad, interacción, captura offline y comunicación del estado de sincronización.
- `apps/api`: autenticación, autorización, validación, casos de uso, auditoría, sincronización y persistencia.
- `packages/domain`: conceptos y reglas de negocio independientes de frameworks.
- `packages/contracts`: esquemas Zod y tipos de los límites HTTP.
- `packages/db`: esquema Drizzle, migraciones SQL (`sql/`, empezando por el esquema del equipo), cliente MySQL y semilla de desarrollo. Único paquete que importa el driver (decisión 4 en `decisions.md`). Modelo en `data-model.md`.
- `packages/auth`: roles, permisos y la matriz rol → permiso, fuente de verdad del sistema; expone `can()` y `permissionsFor()` sin dependencias de framework.
- `packages/ui`: primitivas visuales reutilizables exclusivamente por la web.
- `packages/config`: esquemas Zod de variables de entorno; valida al arrancar y nunca contiene secretos.

## Dependencias prohibidas

- `apps/web` hacia `apps/api` o `packages/db`.
- `apps/api` hacia `apps/web` o `packages/ui`.
- `packages/domain` hacia React, NestJS, cualquier ORM o APIs del navegador.
- Dependencias circulares.

## Mapa futuro del frontend

Las carpetas se crearán cuando empiece su fase, no antes:

```text
apps/web/src/
├── app/
├── components/
├── features/
│   ├── auth/
│   ├── attendance/
│   ├── children/
│   ├── follow-ups/
│   ├── reports/
│   └── administration/
├── offline/
├── lib/
└── styles/
```

## Mapa futuro del backend

```text
apps/api/src/
├── modules/
│   ├── health/
│   ├── identity/      # implementado: login, sesiones, cambio de estancia, usuarios
│   ├── attendance/
│   ├── children/
│   ├── follow-ups/
│   ├── reports/
│   └── administration/
├── common/            # config, database, audit, crypto, auth (guards), errors, validation, http
└── infrastructure/
```

## Identidad y autorización

Roles y permisos viven en `packages/auth`; la matriz rol → permiso en código es
la fuente de verdad y desde ella se siembra `rol_permiso`. Una asignación con
`estancia_id` concede solo en esa estancia; con `estancia_id` nulo (roles
centrales) concede en todas.

| Rol | Permisos |
| --- | --- |
| DOCENTE | ASISTENCIA_CONSULTAR, ASISTENCIA_REGISTRAR |
| TRABAJO_SOCIAL, ENFERMERIA | ASISTENCIA_CONSULTAR, SEGUIMIENTO_CONSULTAR, SEGUIMIENTO_REGISTRAR, NOTA_SENSIBLE_CONSULTAR |
| MEDICO | los de TRABAJO_SOCIAL + ALTA_MEDICA_REGISTRAR |
| DIRECTORA | los de DOCENTE y TRABAJO_SOCIAL + JORNADA_CERRAR, REPORTE_AGREGADO_CONSULTAR |
| SUPERVISOR_CENTRAL | REPORTE_AGREGADO_CONSULTAR |
| ADMIN_CENTRAL | USUARIO_ADMINISTRAR, AUDITORIA_CONSULTAR, REPORTE_AGREGADO_CONSULTAR |

Flujo en la API:

1. `AuthGuard` (global) lee la cookie `sirai_session`, resuelve la sesión en
   `sesiones` y adjunta el `AuthContext` (principal, estancia activa).
2. `PermissionsGuard` (global) exige que cada ruta declare `@Public`,
   `@Authenticated` o `@RequirePermission(código)`; sin marca, niega. El
   permiso se evalúa con `can(principal, código, { estanciaId: estanciaActiva })`.
3. Toda operación sensible escribe en `auditoria` en la misma transacción,
   con IP, user agent, id de petición y diff cifrado (AES-256-GCM).

| Ruta | Marca | Qué hace |
| --- | --- | --- |
| `POST /auth/login` | pública, con límite por IP | argon2id; bloqueo tras `LOGIN_MAX_ATTEMPTS` fallos; cookie httpOnly SameSite=Strict |
| `POST /auth/logout` | sesión | revoca la sesión |
| `GET /auth/me` | sesión | usuario, asignaciones, estancia activa y permisos resueltos |
| `POST /auth/contrasena` | sesión (también con contraseña temporal) | cambia la contraseña de quien la pide (RF-38). Verifica la actual (un fallo cuenta para el bloqueo igual que en el login), exige el largo mínimo y que sea distinta, cierra las demás sesiones y audita sin guardar la contraseña |
| `POST /auth/estancia` | sesión | cambia la estancia activa (solo a una asignada) |
| `GET/POST /usuarios`, `PATCH /usuarios/:id/roles` | USUARIO_ADMINISTRAR | administración de usuarios; nadie puede quitarse su propio rol central. Un usuario nuevo nace con contraseña temporal que caduca en `TEMP_PASSWORD_DAYS` |
| `POST /usuarios/:id/contrasena-temporal` | USUARIO_ADMINISTRAR | restablece la contraseña de otra persona: temporal nueva, cuenta desbloqueada y todas sus sesiones cerradas. No sirve para la propia contraseña |
| `GET /salas` | INFANTE_CONSULTAR | salas activas de la estancia activa |
| `GET /infantes` | INFANTE_CONSULTAR | padrón de la estancia activa; se audita como lectura |
| `POST /infantes` | INFANTE_ADMINISTRAR | alta con inscripción inicial, movimiento ALTA y auditoría en una transacción; cifra el grupo de discapacidad |
| `POST /tutores` | INFANTE_ADMINISTRAR | alta de tutor; teléfono cifrado (AES-256-GCM) y hash con llave (HMAC) |
| `GET/POST /infantes/:id/tutores` | INFANTE_CONSULTAR / INFANTE_ADMINISTRAR | tutores del infante y su vínculo; un solo tutor principal; nunca devuelve el teléfono |
| `GET /tutores/:id/telefono` | NOTA_SENSIBLE_CONSULTAR | teléfono descifrado; se audita antes de responder |
| `GET/POST /infantes/:id/consentimientos` | INFANTE_CONSULTAR / CONSENTIMIENTO_REGISTRAR | historial y registro de aceptación o rechazo del tutor; la versión del aviso la fija el servidor (`PRIVACY_NOTICE_VERSION`), nunca el cliente |
| `POST /consentimientos/:id/revocar` | CONSENTIMIENTO_REGISTRAR | marca `revocado_at`; nunca borra la evidencia |
| `GET /asistencia/jornadas/:id/lista` | ASISTENCIA_CONSULTAR | infantes con inscripción activa en salas del turno de la jornada, su estado y si tienen candado médico (RF-29, solo el indicador); sin datos de salud ni contacto; se audita |
| `POST /asistencia/jornadas/:id/registros` | ASISTENCIA_REGISTRAR | marca asistencia por lote, todo o nada y solo en jornada abierta; un infante con candado médico (caso abierto que requiere alta y no la tiene) no se puede marcar Presente; cada marca lleva un `clientId` (UUID) y un reintento no duplica ni audita; un cambio de estado se audita con el antes y el después |
| `GET /seguimientos` | SEGUIMIENTO_CONSULTAR | bandeja de tickets abiertos de la estancia, sin teléfonos ni notas; se audita |
| `POST /seguimientos/:id/contactos` | SEGUIMIENTO_REGISTRAR | registra un intento de llamada: hablar con el tutor exige tutor vinculado, causa (ENF_CASA, ACC_EXT o PER_TUT) y fecha de retorno; no contestar clasifica NO_LOC, programa el segundo intento a las 4 h y, al repetirse, activa la alerta a contactos de emergencia. Notas y teléfono marcado se guardan cifrados |
| `GET /seguimientos/:id/contactos` | NOTA_SENSIBLE_CONSULTAR | historial con las notas descifradas; cada consulta se audita |
| `POST /seguimientos/:id/alta` | ALTA_MEDICA_REGISTRAR (solo el médico) | registra el alta médica y libera el candado; la fecha no puede ser futura; las observaciones se guardan cifradas |
| `POST /seguimientos/:id/cierre` | SEGUIMIENTO_REGISTRAR | cierra el caso: exige al menos una llamada, la causa clasificada y, si hay candado médico, el alta |
| proceso `FOLLOW_UP_JOB_SECONDS` | interno | cada minuto abre un ticket por cada ausencia (ausente justificado o falta injustificada) de jornadas matutinas cuyo cierre de las 09:00 ya pasó en la zona horaria de la estancia; es repetible y se audita como `SISTEMA` |
| `GET /reportes/tablero?date=` | REPORTE_AGREGADO_CONSULTAR | semáforo de asistencia por estancia: solo conteos y porcentajes (RF-18). Alcance por rol: administrador y supervisor sin región, todas; supervisor con región, la suya (P9); directora, su estancia. Verde desde 90 %, amarillo desde 75 %, rojo por debajo, sin captura si no hubo jornada (umbrales por confirmar, S-15) |
| `GET /reportes/exportacion?period=&date=&format=` | REPORTE_AGREGADO_CONSULTAR | descarga el corte diario, mensual o trimestral que contiene a `date`, en `xlsx` (hojas Resumen y Detalle diario) o `pdf` (con "Página x de y"); solo conteos y porcentajes, acotado al alcance del usuario; cada exportación se audita |
| `GET /expedientes/:childId` | EXPEDIENTE_EXPORTAR (solo la directora) | expediente completo del infante en PDF para traslados: datos generales, inscripciones y movimientos, tutores con teléfono, consentimientos, resumen de asistencia y seguimientos con notas y alta médica descifrados. Cada emisión recibe un folio `EXP-año-######` (el id de `expedientes_emitidos`), se sella con HMAC-SHA256 con la llave del servidor, imprime folio y "Página x de y" en cada hoja y se audita; un expediente sellado es inmutable en la base |
| `POST /expedientes/verificar` | EXPEDIENTE_EXPORTAR | comprueba folio y sello de un expediente recibido; responde solo auténtico (con fecha y estancia de emisión) o no auténtico, sin distinguir la causa ni revelar datos del infante |
| `POST /sincronizacion` | sesión; cada operación se autoriza por tipo (ASISTENCIA_REGISTRAR o SEGUIMIENTO_REGISTRAR) | recibe hasta 50 operaciones capturadas sin conexión, con UUID y hora de captura, y las aplica en orden. El acuse de cada una (`APLICADA`, `PARCIAL` o `RECHAZADA`) se guarda en `sincronizaciones`: un reintento recibe el mismo acuse con `replayed: true` y no repite el efecto; una llamada de seguimiento además lleva su UUID en `contactos_seguimiento`, así que ni perder el acuse la duplica. Un rechazo del dominio no detiene el lote; una falla inesperada no se guarda y se puede reintentar. El acuse no contiene datos de menores |
| `GET/POST /administracion/estancias`, `PATCH /administracion/estancias/:id`, `POST /administracion/estancias/:id/baja` | `ESTANCIA_ADMINISTRAR` (Admin Central) | catálogo de estancias (RF-31): clave única, zona horaria IANA validada; la baja es lógica y se rechaza con inscripciones activas o jornadas abiertas; cada cambio se audita con solo los campos modificados |
| `GET/POST /administracion/salas`, `PATCH /administracion/salas/:id`, `POST /administracion/salas/:id/baja` | `SALA_ADMINISTRAR` (Directora) | catálogo de salas de la estancia activa (RF-32), con inscritos por sala; no se cambia el turno, no se baja la capacidad por debajo de los inscritos ni se desactiva una sala con infantes; la inscripción rechaza una sala llena |
| `PATCH /infantes/:id`, `DELETE /infantes/:id` | `INFANTE_ADMINISTRAR` | corrige los datos del infante (la matrícula no cambia; el grupo de discapacidad se vuelve a cifrar y nunca llega a la bitácora, que guarda solo los nombres de los campos). `DELETE` es borrado lógico para corregir un alta equivocada y se rechaza con 409 si el infante tiene asistencia registrada |
| `PATCH /tutores/:id`, `PATCH /infantes/:id/tutores/:tutorId`, `DELETE /infantes/:id/tutores/:tutorId` | `INFANTE_ADMINISTRAR` | edita al tutor (un teléfono nuevo se cifra de nuevo y recalcula su hash) y los permisos de su vínculo. `DELETE` desvincula: la vigencia termina ayer y el vínculo queda como historial; si el vínculo empezó hoy no hay historia y se da de baja con borrado lógico. Vincular otra vez al mismo tutor reactiva la fila |
| `POST /infantes/:id/movimientos` | `INFANTE_ADMINISTRAR` | cambio de sala, baja o traslado de la inscripción activa (RF-35). Se valida con `nextEnrollmentStatus` y con las mismas reglas de sala que el alta (estancia, estatus, cupo y rango de edad). Cada movimiento escribe su renglón en `movimientos_inscripcion` y su auditoría en la misma transacción; la baja y el traslado exigen motivo |
| `GET /traslados/destinos`, `GET /traslados/pendientes`, `POST /traslados/:inscripcionId/recepcion` | `INFANTE_ADMINISTRAR` | la estancia de destino ve los traslados que le enviaron (consulta auditada) y los recibe asignando sala: se crea la inscripción nueva y el movimiento ALTA con la estancia de origen. Un traslado de otra estancia o ya recibido responde 404 |
| `GET /health` | pública | estado de la API, la base y el tiempo activo del proceso |

Todo el padrón se acota a la estancia activa de la sesión: una sala, infante,
tutor o consentimiento de otra estancia responde 404 como si no existiera.

Reglas de sesión: inactividad máxima `SESSION_TTL_HOURS` (12 h) con tope
absoluto `SESSION_MAX_HOURS` (72 h); el bloqueo de cuenta solo se comunica a
quien envía la contraseña correcta, para no revelar qué cuentas existen.

## Principios

- Monolito modular antes que microservicios.
- Menor privilegio y autorización aplicada en el servidor.
- Eventos idempotentes para sincronizar asistencia capturada offline.
- Auditoría inmutable para operaciones sensibles.
- Datos personales de menores tratados como información sensible.
- Abstracciones agregadas solo cuando exista un caso real.
