# Protocolo de caída de enlace

Manual de contingencia operativa para las estancias (sección 6 de la especificación del
cliente: qué hace el personal cuando no hay internet y cómo se reconcilian los datos al
restablecerse el servicio). **Borrador para validar con el cliente**: las reglas marcadas
con «S-20» y «S-25» del SRS son supuestos del equipo.

Quién lo lee: directoras, docentes, personal de trabajo social y enfermería, y quien dé
soporte en la estancia.

## 1. Qué pasa cuando se cae la conexión

SIRAI sigue funcionando en la tablet si la persona **ya entró con conexión** ese día. Lo que
captura se guarda en la propia tablet, cifrado, y se envía solo cuando vuelve la conexión.
No hay que hacer nada especial: la pantalla avisa con una franja arriba.

| Franja | Qué significa | Qué hacer |
| --- | --- | --- |
| «Sin conexión. Lo que captures se guarda en esta tablet…» | No hay red. Se puede seguir trabajando. | Pasar lista y registrar llamadas con normalidad. |
| «N capturas pendientes de enviar» | Hay capturas en la tablet que aún no llegan al servidor. | Esperar: se envían solas. Con conexión, «Enviar ahora». |
| «Mostrando datos guardados en esta tablet; pueden no estar al día» | La lista que se ve es la última que se descargó. | Tomarla como válida para pasar lista; puede faltar un alta de última hora. |
| «N capturas requieren revisión» | El servidor no pudo aplicar algo (por ejemplo, la jornada ya estaba cerrada). | Ver la sección 5. |

### Qué sí se puede hacer sin conexión

- Abrir la aplicación y la sesión (si se usó antes con conexión en esa tablet).
- Ver la lista de la jornada abierta, la bandeja de seguimientos y los tutores de los infantes
  cuyos tutores ya se abrieron con conexión.
- Pasar lista (incluido con lector de matrículas) y registrar llamadas de seguimiento.

### Qué no se puede hacer sin conexión

- Iniciar sesión por primera vez ese día, cambiar de estancia o cambiar la contraseña.
- Abrir o cerrar una jornada, registrar altas médicas o cerrar seguimientos.
- Ver teléfonos de tutores, el historial de notas de asesoría, reportes, expedientes y
  todo lo de administración. Estos datos sensibles nunca se guardan en la tablet para leerlos.
- Dar de alta infantes, tutores o salas.

## 2. Antes de empezar el día

1. Iniciar sesión **con conexión** y abrir «Pase de lista»: así la lista del día queda
   guardada en la tablet. Quien da seguimiento abre también la bandeja y, para cada
   llamada que pueda necesitar, la ficha del infante (así queda guardada la lista de tutores).
2. Tener la tablet cargada.
3. La directora abre la jornada con conexión antes de que empiece el turno.

## 3. Cuando no se puede usar la tablet

Si la tablet no abre, no tiene la sesión del día guardada o se quedó sin batería, se captura en
el **formato físico de respaldo** (Anexo A para el pase de lista, Anexo B para llamadas).
Cada hoja lleva fecha, turno, sala y la firma de quien la llenó.

Una hoja física no sustituye al registro: **se captura en el sistema en cuanto hay conexión**
(sección 5) y se conserva archivada como evidencia.

## 4. Mientras hay capturas pendientes

- **No cerrar la sesión** salvo que sea necesario. Si se hace, la tablet avisa y las capturas se
  conservan cifradas hasta que la misma persona vuelva a entrar.
- **Una captura se envía solo con la sesión de quien la hizo.** En una tablet compartida, otra
  persona verá únicamente «hay N capturas de otra persona»; no puede verlas ni enviarlas.
- La directora **no debe cerrar la jornada** hasta confirmar que ninguna tablet del turno
  muestra capturas pendientes (revisar cada franja, o preguntar a cada docente). El servidor
  rechaza lo que llegue después del cierre.
- Si la tablet se pierde o la roban, avisar de inmediato a la directora. El administrador
  central puede **restablecer la contraseña** de esa cuenta, lo que cierra todas sus sesiones.
  Lo guardado en la tablet está cifrado, pero **no se recupera sin la tablet**: reconstruirlo
  con el formato físico.

## 5. Al restablecerse el servicio: reconciliación

1. **Esperar a que el contador de pendientes llegue a cero.** El envío es automático, por
   lotes y en el orden en que se capturó. Si tarda, «Enviar ahora».
2. **Comprobar que la lista del servidor coincide**: la directora revisa el pase de lista del
   turno.
3. **Capturas por revisar.** Abrir «Revisar» en la franja. Cada captura muestra lo que se
   capturó, cuándo, y por qué no se aplicó (por ejemplo, la jornada ya estaba cerrada, o un
   infante con candado médico). Para cada una:
   - Confrontarla con el formato físico del turno.
   - Si el dato correcto ya está en el sistema, **descartar** la captura (pide confirmación).
   - Si falta, registrarlo manualmente. Si la jornada ya está cerrada, **no se puede
     modificar hoy**: anotarlo en la bitácora de incidencias y avisar a la directora (ver el
     punto «Pendiente de definir» abajo).
4. **Hojas físicas.** Capturar en el sistema las hojas del Anexo A y B que se llenaron, y
   archivarlas con la fecha en que se capturaron.
5. **Registrar el incidente** (sección 6).

### Pendiente de definir con el cliente

- **Capturas que llegan después del cierre de la jornada.** Hoy se aceptan si se hicieron
  *antes* del cierre (S-20) y se rechazan si se hicieron *después*. Un dato de un formato físico
  de una jornada ya cerrada no tiene dónde entrar. El cliente debe definir si habrá una forma de
  corregir una jornada cerrada y quién la autoriza.
- **Plazo máximo** para capturar las hojas físicas.

## 6. Bitácora de incidencias de conexión

La directora lleva un registro sencillo de cada caída: fecha, estancia, hora de inicio y fin,
turno afectado, qué tablets se usaron y cuáles hojas físicas se llenaron, cuántas capturas
quedaron por revisar y cómo se resolvieron. Sirve para el seguimiento del proyecto y para
decidir si una estancia necesita mejor conectividad.

## 7. Responsabilidades

| Rol | Responsabilidad |
| --- | --- |
| Docente | Pasar lista (en la tablet o en el formato físico), no cerrar sesión con pendientes, avisar si la tablet falla. |
| Trabajo social / enfermería | Registrar llamadas (tablet o Anexo B) y capturarlas al volver la conexión. |
| Directora | Abrir la jornada con conexión, no cerrarla con pendientes, reconciliar y llevar la bitácora. |
| Administrador central | Restablecer contraseñas de tablets perdidas, atender dudas de reconciliación. |

## Anexo A. Formato físico de respaldo: pase de lista

Fecha: __________  Turno: ☐ Matutino ☐ Vespertino  Sala: ______________  Docente: ______________

| Matrícula | Nombre del infante | Estado (P, AJ, FI, CM, FS) | Hora | Observaciones |
| --- | --- | --- | --- | --- |
| | | | | |
| | | | | |
| | | | | |

P = Presente · AJ = Ausente justificado · FI = Falta injustificada · CM = Comisión médica ·
FS = Filtro sanitario. Firma de la docente: ______________  Capturada en el sistema el: __________  por: __________

## Anexo B. Formato físico de respaldo: llamada de seguimiento

Fecha y hora de la llamada: ______________  Infante (matrícula): ______________

| Tutor con quien se habló | Resultado (habló / no contestó) | Causa | Fecha estimada de retorno |
| --- | --- | --- | --- |
| | | | |

Notas de asesoría: ____________________________________________________________

Este formato contiene datos sensibles: se guarda bajo llave y no se deja a la vista. Capturada en el sistema el: __________  por: __________
