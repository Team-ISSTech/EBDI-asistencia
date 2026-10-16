# SRS: Especificación de requisitos de SIRAI

- Fuente: SRS del cliente, agosto 2026.
- Fecha de esta versión: 2026-10-07

Este documento reformula los requisitos del cliente con identificadores
estables (`RF-nn` funcionales, `RNF-nn` no funcionales) para que la matriz de
trazabilidad (`RTM.md`) pueda mapear cada uno a un paquete, una verificación y
un estado. No modifica el alcance acordado: el SRS del cliente sigue siendo la
fuente de verdad y, ante cualquier diferencia, prevalece. La desviación de
stack (PHP + CodeIgniter en el SRS, TypeScript en este repositorio) se trata
en `docs/architecture/decisions.md`, no aquí.

Los requisitos marcados con "(Fase 2)" quedan fuera de la primera entrega
funcional. Los demás pertenecen a Fase 1.

## Requisitos funcionales

### Módulo 1: Autenticación y RBAC

- RF-01: El sistema define los roles Directora de Estancia, Capturista/Docente, Supervisor Regional y Administrador Central.
- RF-02: (Fase 2) El sistema agrega los roles Trabajo Social/Enfermería y Médico de Estancia.
- RF-03: Toda sesión queda acotada a una estancia; el usuario solo opera sobre datos de la estancia activa de su sesión.
- RF-04: El acceso se realiza con correo electrónico y contraseña.
- RF-05: La cuenta se bloquea temporalmente tras un número de intentos de acceso fallidos consecutivos.
- RF-06: (Fase 2) Docente: consulta asistencia y la registra únicamente mientras la jornada esté abierta; no accede a seguimiento ni notas.
- RF-07: (Fase 2) Trabajo Social/Enfermería: consulta asistencia, registra llamadas de seguimiento, lee notas médicas y familiares y cierra casos.
- RF-08: (Fase 2) Médico de Estancia: mismos permisos que Trabajo Social/Enfermería más el registro de alta médica.
- RF-09: (Fase 2) Directora de Estancia: mismos permisos que Trabajo Social/Enfermería más supervisión de su estancia.
- RF-10: (Fase 2) Supervisor Central: consulta únicamente estadísticas agregadas, sin datos identificables de infantes.
- RF-11: (Fase 2) Administrador Central: administra usuarios y roles y consulta la bitácora de auditoría.

### Módulo 2: Asistencia rápida

- RF-12: El pase de lista por sala/grupo se completa en menos de 3 clics desde la pantalla del grupo.
- RF-13: El sistema registra entrada y salida escaneando credenciales QR o código de barras de infantes y tutores.
- RF-14: Cada registro de asistencia toma uno de los estados Presente, Ausente justificado, Falta injustificada, Comisión médica o Filtro sanitario.
- RF-15: La jornada de asistencia se abre y se cierra por estancia, fecha y turno; solo una jornada por combinación.

### Módulo 3: Reportes

- RF-16: Tablero semaforizado en tiempo real con la asistencia de las 212 estancias.
- RF-17: Exportación a Excel y PDF con cortes diario, mensual y trimestral.
- RF-18: Los reportes para roles centrales se entregan anonimizados, sin datos identificables de infantes ni tutores.
- RF-19: Exportación a PDF del expediente completo de un infante para traslados entre estancias.

### Módulo 4: Operación offline

- RF-20: La web encola los registros capturados sin conexión en IndexedDB mediante un Service Worker.
- RF-21: Al recuperar conexión, la cola se sincroniza automáticamente sin intervención del usuario.
- RF-22: Cada evento de sincronización es idempotente: reenviar el mismo evento no duplica ni altera registros.
- RF-23: Ningún registro capturado offline se pierde, aunque el dispositivo se reinicie antes de sincronizar.

### Módulo 5: Seguimiento de inasistencias (Fase 2)

- RF-24: (Fase 2) Al cierre de las 09:00 cada ausencia genera automáticamente un ticket de seguimiento asignado a Trabajo Social.
- RF-25: (Fase 2) El ticket exige registrar al menos un contacto telefónico con el tutor.
- RF-26: (Fase 2) La causa se clasifica como ENF_CASA, ACC_EXT, PER_TUT o NO_LOC.
- RF-27: (Fase 2) Un resultado NO_LOC programa un segundo intento a las 4 h y alerta a los contactos de emergencia.
- RF-28: (Fase 2) El ticket registra la fecha estimada de retorno del infante.
- RF-29: (Fase 2) El ticket puede activar el candado médico "requiere alta para ingresar", que impide marcar Presente hasta el alta.
- RF-30: (Fase 2) Solo el Médico de Estancia registra el alta médica que libera el candado.

### Módulo 6: Catálogos y consentimiento

- RF-31: Catálogo de estancias con clave EBDI, región, zona horaria y estatus.
- RF-32: Catálogo de salas/grupos por estancia, con turno y capacidad.
- RF-33: Catálogo de infantes con matrícula, CURP y datos de identificación.
- RF-34: Catálogo de tutores y su relación con cada infante (parentesco, autorizado a recoger, contacto de emergencia).
- RF-35: Inscripciones de infantes a una estancia y sala/grupo con vigencia y movimientos de traslado.
- RF-36: Registro del consentimiento del tutor para el tratamiento de datos, con versión del aviso, fecha y evidencia.

## Requisitos no funcionales

### Seguridad y protección de datos

- RNF-01: Diagnósticos, teléfonos y notas familiares se cifran en reposo con AES-256.
- RNF-02: Bitácora de auditoría inmutable con usuario, rol, IP, user agent, marca de tiempo y diff del payload por cada operación sensible.
- RNF-03: La auditoría incluye las lecturas de notas confidenciales, no solo escrituras.
- RNF-04: Los registros sensibles usan borrado lógico; la API nunca ejecuta DELETE físico sobre ellos.
- RNF-05: Retención: datos activos durante el ciclo escolar y archivados durante 5 años.
- RNF-06: La autorización se aplica siempre en el backend; la web no es una barrera de seguridad.
- RNF-07: El repositorio no contiene datos reales de menores, tutores ni personal.

### Rendimiento

- RNF-08: p95 < 1.5 s en operaciones de asistencia y seguimiento con 212 estancias concurrentes.

### Calidad de código

- RNF-09: Cobertura de pruebas de al menos 80 % sobre la lógica de negocio.
- RNF-10: Complejidad ciclomática menor a 10 por método.
- RNF-11: Sin salidas de depuración (`console`) ni código muerto en código de producción; lint sin errores.
- RNF-12: Lint, typecheck y pruebas se ejecutan como compuertas bloqueantes en CI antes de integrar a `main`.

### Entregables por fase (ISO/IEC 33000 e ISO/IEC 12207)

- RNF-13: Fase 1 entrega SRS y RTM.
- RNF-14: Fase 2 entrega diagrama entidad-relación y prototipos de interfaz.
- RNF-15: Fase 3 entrega el repositorio con 80 % de cobertura.
- RNF-16: Fase 4 entrega el script de migración y el manual de instalación.
- RNF-17: Fase 5 entrega las pruebas de aceptación (UAT) con 3 a 5 estancias piloto.

## Supuestos

Puntos donde el SRS del cliente es ambiguo. Se registran como supuestos
explícitos hasta obtener confirmación; varios coinciden con las preguntas de
`docs/architecture/data-model.md`.

- S-01: "Supervisor Regional" del SRS es el rol `SUPERVISOR_CENTRAL` del catálogo; el alcance por región se resolverá con la pregunta P9 del modelo de datos.
- S-02: "Capturista/Docente" es un solo rol (`DOCENTE`).
- S-03: Trabajo Social y Enfermería son dos roles del catálogo con la misma fila de permisos.
- S-04: El SRS etiqueta la matriz de permisos completa como Fase 2. Se asume que los roles de Fase 1 operan desde Fase 1 con los permisos mínimos que su fila les asigna; la matriz completa se verifica en Fase 2.
- S-05: "Menos de 3 clics" se cuenta a partir de la pantalla del grupo ya cargada, con sesión iniciada.
- S-06: El umbral de bloqueo (RF-05) no está definido; se asume 5 intentos fallidos y 15 minutos de bloqueo, configurables en `packages/config`.
- S-07: El cierre de las 09:00 (RF-24) se evalúa en la zona horaria de cada estancia.
- S-08: "Ausencia" en RF-24 comprende Ausente justificado y Falta injustificada; Comisión médica y Filtro sanitario no generan ticket salvo indicación del cliente.
- S-09: Los contactos de emergencia (RF-27) son tutores marcados como tales; no existe entidad separada (pregunta P6).
- S-10: "Anonimizado" (RF-18) significa sin nombre, CURP, matrícula ni datos de contacto; solo conteos y porcentajes.
- S-11: RNF-11 y RNF-12 no aparecen literalmente en el SRS del cliente; se derivan de los procesos de ISO/IEC 12207 y de la tabla de equivalencias de `docs/architecture/decisions.md`.
- S-12: La cobertura de RNF-09 se mide sobre `packages/domain`, `packages/auth` y los módulos de `apps/api`; no sobre componentes visuales.
- S-13: El p95 de RNF-08 se mide en la latencia de la API, sin incluir la red del cliente.
- S-15: Los umbrales del semáforo (RF-16) no están definidos; se asumen verde desde 90 %, amarillo desde 75 % y rojo por debajo, calculados sobre los inscritos de los turnos con jornada ese día. Deben confirmarse con el cliente.
- S-14: Los valores de `turno`, `estado` y `clasificacion` se fijan en `packages/domain`, no como `ENUM` en MySQL (pregunta P11).
