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
- RF-37: La API ofrece endpoints REST protegidos con Bearer tokens para que los sistemas institucionales interoperen con SIRAI. Cada token pertenece a un sistema, tiene permisos y alcance acotados, caduca, se puede revocar y toda su actividad se audita.
- RF-38: Quien ingresa con una contraseña temporal debe cambiarla antes de usar el sistema; cualquier persona puede cambiar su contraseña después. La contraseña temporal caduca y la nueva debe cumplir la política mínima de longitud.

### Módulo 2: Asistencia rápida

- RF-12: El pase de lista por sala/grupo se completa en menos de 3 clics desde la pantalla del grupo.
- RF-13: Lector de código de barras / QR para credenciales de infantes y tutores autorizados (especificación del cliente, módulo de Asistencia Rápida). Qué contiene el código y cómo se usa para la salida no está definido: ver S-22.
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
- S-03: Trabajo Social y Enfermería son el mismo perfil: la matriz de roles del documento del cliente (sección 5) les da una sola fila, «Trabajo Social / Enfermería». El catálogo conserva dos códigos de rol (`TRABAJO_SOCIAL` y `ENFERMERIA`, heredados del script SQL del equipo) solo para nombrar el puesto de cada persona; ambos apuntan a la misma lista de permisos y una prueba de `packages/auth` lo verifica.
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
- S-16: El corte trimestral (RF-17) es el trimestre calendario (enero-marzo, abril-junio, julio-septiembre, octubre-diciembre). En los cortes de periodo, la asistencia se mide sobre los registros capturados (presentes entre presentes, ausentes y otros), no sobre los inscritos. Deben confirmarse con el cliente.
- S-17: El "sellado digital" del expediente (RF-19) es un sello de integridad con llave institucional (HMAC-SHA256 sobre folio, infante, fecha y huella del contenido), verificable en SIRAI; no es firma electrónica avanzada (e.firma) ni sello de tiempo de un tercero. Si el cliente exige e.firma, debe especificarse el proveedor. El expediente incluye datos de contacto y notas de asesoría descifrados: lo emite solo la Directora (permiso EXPEDIENTE_EXPORTAR).
- S-18: El PDF del cliente pide Bearer tokens para interoperabilidad (RF-37) sin decir con qué sistemas ni qué datos. Se asume que son lecturas y altas acotadas por sistema, y que el alcance se define con el cliente en la actividad A21A (#52). Los datos que salgan por esa API respetan las mismas reglas de anonimización y auditoría que los reportes. Primera entrega: un sistema se autentica con credenciales de cliente (`clientId` y `clientSecret`) para obtener un JWT de 15 minutos con los alcances que se le dieron (hoy uno solo: lectura del tablero agregado); el administrador central lo registra y lo puede revocar. No hay endpoints de alta de datos: qué más expone la API se define con el cliente.
- S-19: El plazo de caducidad de la contraseña temporal (RF-38) no está definido; se asume 7 días (`TEMP_PASSWORD_DAYS`) y debe confirmarse con el cliente. Tampoco está definida la política de contraseña: se asume un mínimo de 10 caracteres y que la nueva sea distinta de la actual. Una cuenta nueva o restablecida entra con la temporal, pero hasta cambiarla solo puede ver su sesión, cambiarla y cerrar sesión; una temporal caducada no entra y requiere que un administrador la restablezca. Al cambiar o restablecer una contraseña se cierran las demás sesiones de esa persona.
- S-20: Reglas de conflicto de la captura sin conexión (RF-20 a RF-23). Cada operación lleva un UUID y la hora de captura; se registra con esa hora (nunca en el futuro). Una captura se acepta aunque llegue tarde si se hizo antes de que se cerrara la jornada; si se hizo después, se rechaza completa y debe reconciliarse con el formato físico de respaldo. Una captura de varios infantes se aplica en parte: lo válido se guarda y cada rechazo (infante no inscrito, otro turno, candado médico) se informa por separado. Deben confirmarse con el cliente.
- S-21: Movimientos de inscripción (RF-35). La baja y el traslado exigen motivo escrito; el cambio de sala lo admite pero no lo exige. Un traslado cierra la inscripción de origen como TRASLADADA y queda pendiente hasta que la directora de la estancia de destino lo recibe asignándole una sala (con las mismas reglas de edad, cupo y turno que un alta); mientras tanto el infante no aparece en ninguna estancia. Un reingreso tras una baja es un alta nueva. Un seguimiento abierto de un infante dado de baja o trasladado no se cierra solo. Deben confirmarse con el cliente.
- S-22: Escaneo en el pase de lista (RF-13). Lo que dice el documento del cliente (módulo de Asistencia Rápida) es solo: «Lector de código de barras / QR para credenciales de infantes y tutores autorizados». «Ingreso, egreso y contingencias» aparece en el objetivo general del sistema, sin ligarse al lector. El documento no dice qué contiene el código, quién emite las credenciales ni cómo se usan para recoger a un infante. Supuestos del equipo, por confirmar con el cliente: (a) el código de la credencial del infante contiene únicamente su matrícula, de modo que ningún dato del menor viaja en él; (b) el escaneo se usa para el ingreso en el pase de lista, con lector USB/Bluetooth que escribe como teclado, con la cámara donde el navegador lee códigos, o escribiendo la matrícula, y marca Presente en el borrador con método QR; (c) «tutores autorizados» se refiere a quienes pueden recoger al infante (campo `autorizado_recoger`), pero el flujo de salida y las credenciales de tutores no están implementados hasta definirlos.
- S-23: Consulta de la bitácora (RF-11). La consulta de auditoría la hace el Administrador Central y muestra quién, cuándo, la acción, el registro afectado, la IP y el user-agent; del cambio muestra únicamente los nombres de los campos que cambiaron, nunca sus valores (antes ni después), porque pueden ser datos de menores y el documento del cliente no da a ese rol acceso a ellos. Si el cliente quiere que se vean los valores, debe definirse un permiso y un rol aparte. Consultar la bitácora también queda registrado en ella, sin los filtros ni los resultados. Debe confirmarse con el cliente.
- S-24: Retención por ciclo escolar (RNF-05). El PDF dice que las notas de seguimiento y justificaciones «se conservan activas durante el ciclo escolar y pasan a archivo histórico por 5 años antes de su depuración controlada». Se interpreta así: (a) el administrador central abre el ciclo nuevo y con ello archiva el anterior, siempre que todas sus jornadas estén cerradas y todos sus seguimientos cerrados; (b) un ciclo archivado es de solo lectura (ni una captura sin conexión tardía lo modifica) y sale de las pantallas diarias, pero sus datos siguen consultables con los mismos permisos y la misma auditoría; (c) a los 5 años de archivado, y solo por una acción explícita del administrador central que exige escribir la clave del ciclo, se «depura»: se vacían los teléfonos, las notas de asesoría y las observaciones médicas cifrados de los seguimientos de ese ciclo, sin borrar ninguna fila (RNF-04), de modo que quedan los conteos, los estados y la bitácora; (d) la depuración no es automática ni se puede deshacer; (e) los infantes y tutores no pertenecen a un ciclo y no se depuran por esta vía, y las inscripciones activas siguen vigentes al cambiar de ciclo. Deben confirmarse con el cliente, en particular el plazo de 5 años y qué se considera «depuración».
- S-25: Modo sin conexión del navegador (RF-20 a RF-23). (a) Lo capturado sin conexión (pase de lista y llamadas de seguimiento) se guarda en IndexedDB de la tablet, cifrado con AES-GCM y una llave no extraíble que vive en el mismo navegador: protege contra quien copie los archivos del navegador o un respaldo del dispositivo, no contra código que corra dentro de la propia aplicación. (b) Cada captura pertenece a quien la hizo y solo se envía con su sesión; en una tablet compartida otra persona solo ve cuántas hay. (c) Cerrar sesión con capturas pendientes avisa y las conserva cifradas hasta que la misma persona vuelva a entrar; una tablet perdida se neutraliza restableciendo la contraseña de la cuenta, pero lo guardado en ella no se recupera. (d) Se guardan copias de lectura, cifradas y por persona, de la sesión, la jornada, la lista del día, la bandeja de seguimientos y los tutores de los infantes consultados; se conservan una semana y se borran al cerrar sesión. Nunca se guardan para lectura los teléfonos, las notas de asesoría ni los reportes. (e) La hora de captura es la del reloj de la tablet; el servidor nunca acepta una hora futura. (f) El Service Worker solo guarda el código de la aplicación; una versión nueva espera a que se cierren las pestañas para no recargar a media captura. (g) Capturas anteriores al cierre de la jornada se aceptan (S-20); lo posterior se rechaza y queda en «Capturas por revisar» hasta que una persona lo reconcilie con el formato físico y lo descarte. Debe confirmarse con el cliente, en particular cómo corregir una jornada ya cerrada.
- S-26: Aviso a los contactos de emergencia (RF-27). Decididos con el equipo: (a) el contacto de emergencia es un tutor vinculado al infante y marcado como tal (S-09), vigente y activo; (b) el aviso sale solo cuando el **segundo** intento de localizar al tutor también falla, no tras el primero; (c) el canal es WhatsApp Business (Cloud API de Meta); (d) el texto es fijo y no nombra al menor ni el motivo: «No lo logramos contactar por un problema de su estudiante asignado, por favor contáctenos a la brevedad dado que es un tema urgente.»; (e) un contacto recibe un solo aviso por seguimiento. La implementación está completa y probada con un canal simulado, pero **no se ha probado contra WhatsApp real**: falta la cuenta de WhatsApp Business del cliente y la aprobación de la plantilla por Meta (ver `docs/operations/avisos-whatsapp.md`). Sin cuenta configurada no se envía nada y los avisos quedan pendientes. Por confirmar con el cliente y con el área jurídica: el texto, que el aviso no revele datos del menor a un tercero y que los contactos de emergencia estén informados de que pueden recibirlo (aviso de privacidad).
- S-14: Los valores de `turno`, `estado` y `clasificacion` se fijan en `packages/domain`, no como `ENUM` en MySQL (pregunta P11).
