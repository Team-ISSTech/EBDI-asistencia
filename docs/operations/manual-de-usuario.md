# Manual de usuario

SIRAI registra la asistencia diaria de los infantes de las estancias y da seguimiento a las ausencias. Este manual se organiza
por **rol**: lee «Entrar al sistema» y la sección de tu rol. Los nombres entre comillas son los que verás en pantalla.

> Los datos de los infantes son confidenciales. No compartas tu contraseña, no dejes la sesión abierta sin atención
> y no anotes teléfonos ni nombres fuera del sistema.

## 1. Entrar al sistema

1. Abre la dirección de SIRAI en el navegador de la tablet o la computadora.
2. Escribe tu **correo institucional** y tu **contraseña**, y pulsa «Entrar».
3. **Primera vez:** tu contraseña es temporal y el sistema te pide cambiarla antes de seguir (mínimo 10 caracteres y distinta de la
   actual). La temporal caduca a los 7 días; si caducó, pide a tu administrador que la restablezca.
4. Si tienes asignada más de una estancia, elige con cuál trabajar en «Selecciona una estancia». Puedes cambiarla después desde
   el menú. Solo ves y modificas lo de la estancia activa.
5. Tras 5 intentos fallidos la cuenta se bloquea 15 minutos. Para salir, pulsa «Cerrar sesión».

Tu menú muestra solo lo que tu rol puede hacer. Si abres algo que no te corresponde verás «Esta sección no está disponible para tu rol».

### Cambiar tu contraseña
Menú de tu usuario → «Cambiar contraseña». Cambiarla cierra tus otras sesiones.

## 2. Docente: pasar lista

La docente registra la asistencia del turno. **La jornada la abre la directora**; si ves «Todavía no hay jornada abierta», avísale.

1. Entra a «Pase de lista». Verás la lista de los infantes del turno con una fila por infante.
2. Marca a cada infante con uno de estos estados:
   - **Presente**.
   - **Ausente justificado** (la familia avisó).
   - **Falta injustificada**.
   - **Comisión médica**.
   - **Filtro sanitario** (no ingresa por revisión de salud).
3. Para ahorrar tiempo usa «Marcar a todos presentes» y corrige solo las excepciones.
4. Pulsa «Guardar asistencia». Lo marcado se guarda de una vez.

**Con lector o cámara.** Si la estancia usa credenciales con código: pasa el lector por el gafete, usa la cámara de la tablet o escribe la
matrícula, y pulsa «Comprobar». El infante queda marcado **Presente** en pantalla; recuerda «Guardar asistencia».

**Infante con candado médico.** Si un caso exige alta médica, ese infante no se puede marcar Presente hasta que el médico registre el alta.
El sistema lo indica en la fila.

**Corregir un error.** Mientras la jornada siga abierta puedes cambiar el estado de un infante y guardar de nuevo; queda en la bitácora.
Con la jornada cerrada ya no se modifica: avisa a la directora.

### Si se cae el internet
No dejes de trabajar. Si entraste ese día con conexión, puedes seguir pasando lista: «Guardar asistencia» muestra
*«Sin conexión: la asistencia se guardó en esta tablet y se enviará sola»*. Arriba verás cuántas capturas esperan enviarse y se
mandan solas al volver la red (o con «Enviar ahora»). Si una captura no se pudo aplicar aparece en «Revisar». **No cierres la sesión con
capturas pendientes** si puedes evitarlo. El procedimiento completo, con los formatos de papel de respaldo, está en
`protocolo-caida-de-enlace.md`.

## 3. Directora de estancia

La directora tiene todo lo de la docente y el personal de seguimiento, y además administra su estancia.

### Abrir y cerrar la jornada
En «Pase de lista», si no hay jornada del día y turno, pulsa «Abrir jornada». Al terminar el turno, **antes de cerrar** confirma que ninguna
tablet tenga capturas pendientes y pulsa «Cerrar jornada». Una jornada cerrada no admite cambios. A las 09:00 (hora de la estancia) cada ausencia
de la jornada matutina genera su seguimiento.

### Infantes y tutores («Infantes»)
- «Nuevo infante» (o «Registrar infante»): matrícula, nombre, fecha de nacimiento y sala. La sala debe corresponder a su edad, turno y cupo.
- Abre la ficha de un infante para **editarlo**, **vincular tutores** («Guardar tutor»: parentesco, tutor principal, quién puede recoger y
  si es contacto de emergencia) o darlo de baja lógica. Solo puede haber un tutor principal.
- **Consentimiento:** registra la aceptación del aviso de privacidad de cada tutor («Registrar aceptación»). Puedes revocarla.
- **Movimientos** («Registrar movimiento»): *Cambio de sala*, *Traslado a otra estancia* y *Baja*. La baja y el traslado piden un motivo. Un
  traslado deja al infante «en tránsito» hasta que la directora de la otra estancia lo recibe en «Traslados pendientes» («Recibir a …») y le
  asigna una sala.
- **Expediente:** descarga el expediente del infante en PDF, con folio y sello de integridad. Con «Verificar un expediente recibido» se
  comprueba que un PDF es auténtico.

### Salas («Salas»)
«Crear sala» (nombre, turno, edades y capacidad), editar, desactivar y reactivar.

### Reportes
«Reportes» muestra el tablero de asistencia de tu estancia (ver sección 6).

## 4. Trabajo social, enfermería y médico: seguimiento de ausencias

Trabajo social y enfermería tienen los mismos permisos. El médico además registra altas médicas.

### La bandeja («Seguimientos»)
Cada ausencia (justificada o falta) abre un seguimiento. La bandeja lista los pendientes de tu estancia, los más antiguos primero, con la
causa, la fecha de retorno probable y si requiere alta médica.

### Registrar una llamada
1. Abre el seguimiento y pulsa «Registrar llamada».
2. Elige el **tutor** al que llamaste y el **resultado**:
   - **Contactado:** selecciona la causa (*Enfermedad en casa*, *Accidente fuera del plantel* o *Permiso del tutor*), la fecha probable de
     retorno y, si quieres, notas de asesoría. Enfermedad o accidente activan el **candado médico**: el infante no podrá marcarse Presente
     hasta que el médico registre el alta.
   - **Sin respuesta:** el sistema programa el **segundo intento a las 4 horas**.
3. Si el **segundo intento también falla**, el seguimiento muestra *«No se localizó al tutor en dos intentos: avisa a estas personas»* con los
   **contactos de emergencia** del infante. Además, cuando la estancia tiene configurada la cuenta de WhatsApp, el sistema les manda
   un aviso automático sin datos del menor.
4. Las **notas de asesoría** y el **teléfono** son datos sensibles: el teléfono solo aparece con «Ver teléfono» (y «Ocultar teléfono») y cada consulta
   queda registrada.
5. Cuando ya hubo contacto, la causa está clasificada y, si había candado, existe el alta, pulsa «Cerrar seguimiento».

### Alta médica (médico)
En el seguimiento con candado, «Registrar alta médica»: fecha del alta, folio y observaciones (estas últimas se guardan cifradas). Libera
al infante para ingresar.

## 5. Supervisor central y reportes

### Tablero («Reportes»)
Muestra, para la fecha elegida, las estancias con su **semáforo** de asistencia (verde desde 90 %, amarillo desde 75 %, rojo por debajo),
inscritos, presentes, ausentes y llamadas. Puedes filtrar por región y consultar el día, el mes o el trimestre (por trimestre calendario).
Es información agregada: **no muestra nombres de infantes ni de tutores**.
- «Descargar PDF» y «Descargar Excel» exportan la tabla que ves.
- El supervisor regional solo ve las estancias de su región.

## 6. Administrador central

### Usuarios («Usuarios»)
- «Nuevo usuario»: nombre, correo, contraseña temporal y roles con su estancia. Comunica la contraseña por un canal seguro; la persona debe cambiarla al entrar.
- «Editar roles» → «Agregar rol» / «Quitar rol» → «Guardar roles».
- «Restablecer contraseña» (da una temporal nueva y cierra sus sesiones). Úsalo también si se pierde una tablet.
- «Dar de baja»: la cuenta deja de entrar; no se borra (baja lógica).

### Estancias («Estancias»)
«Crear estancia» (clave EBDI, nombre, región y zona horaria), editar, desactivar y reactivar.

### Ciclos escolares («Ciclos escolares»)
«Archivar el actual y abrir este» abre el ciclo nuevo; solo se puede si todas las jornadas y seguimientos del actual están cerrados. Un
ciclo archivado queda **de solo lectura**. A los 5 años se puede «Depurar el ciclo …»: vacía teléfonos, notas y observaciones médicas de ese
ciclo y **no se puede deshacer**; pide escribir la clave del ciclo.

### Sistemas («Sistemas»)
Registra sistemas externos que consultan la API con token: «Crear sistema» muestra el *secreto (clientSecret)* **una sola vez** («Ya guardé el
secreto»). «Revocar» lo desactiva al instante.

### Auditoría («Auditoría»)
Bitácora de quién hizo qué y cuándo: acción, registro afectado, IP y navegador, y los **nombres de los campos** que cambiaron (nunca sus valores).
Filtra por persona, acción, tabla y fechas («Aplicar filtros», «Limpiar», «Cargar más»). Consultar la bitácora también queda registrado.

## 7. Preguntas frecuentes

| Pregunta | Respuesta |
| --- | --- |
| No me deja marcar Presente a un infante | Tiene un caso que requiere alta médica; el médico debe registrarla |
| No encuentro a un infante en la lista | Revisa que esté inscrito en una sala del turno y que no esté dado de baja o en traslado |
| La lista se ve con «datos guardados» | Estás sin conexión; la lista es la última descargada |
| Olvidé mi contraseña | Pide a tu administrador que la restablezca |
| Mi cuenta está bloqueada | Espera 15 minutos o pide el restablecimiento |
| Cerré sesión con capturas pendientes | Quedan cifradas en la tablet; vuelve a entrar con tu cuenta y se enviarán |
| ¿Quién ve mis consultas? | Cada lectura de datos sensibles queda en la bitácora del administrador central |
