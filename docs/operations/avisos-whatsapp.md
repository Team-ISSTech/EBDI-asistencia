# Avisos de emergencia por WhatsApp (RF-27)

Cuando se llama dos veces al tutor de un infante ausente y no contesta (NO_LOC), SIRAI avisa
por WhatsApp a sus contactos de emergencia. Este documento explica cómo se activa y qué falta.

## Estado

La función está construida y probada con un canal simulado. **No se ha probado contra WhatsApp
real** porque requiere una cuenta del cliente. Mientras no se configure, el sistema funciona
igual: los avisos quedan en la tabla `avisos_emergencia` como PENDIENTE y se envían solos
cuando se configure la cuenta (no se pierden).

## Qué se envía y a quién

- **A quién:** a cada tutor del infante marcado como contacto de emergencia, vigente y activo, que
  tenga teléfono (10 dígitos; se envía con lada de México, 52).
- **Cuándo:** solo cuando el **segundo** intento de localizar al tutor también falla. No tras el primero.
- **Texto** (fijo; no nombra al menor ni el motivo):

  > No lo logramos contactar por un problema de su estudiante asignado, por favor contáctenos a la brevedad dado que es un tema urgente.

- **Una sola vez** por contacto y seguimiento. Un tercer intento fallido no repite el aviso.
- **Reintentos:** si WhatsApp falla, 3 intentos (espera de 5 y 10 minutos). Después queda FALLIDO.
- Un contacto sin teléfono, con teléfono inválido o dado de baja queda como SIN_TELEFONO.
- Cada resultado queda en la bitácora como el sistema (`AVISO_EMERGENCIA_ENVIADO` / `AVISO_EMERGENCIA_FALLIDO`),
  sin el número de teléfono.

## Lo que debe proporcionar el cliente

1. Una cuenta de **WhatsApp Business Platform** (Meta Business) con un número dedicado a la red de estancias.
2. Una **plantilla de mensaje** aprobada por Meta, categoría *Utility*, idioma español (México), **sin variables**, con el
   texto exacto de arriba. WhatsApp solo permite iniciar conversaciones con plantillas aprobadas. Nombre sugerido: `aviso_urgente_sirai`.
3. El **identificador del número de teléfono** (*Phone number ID*) y un **token de acceso permanente** (usuario del sistema de Meta
   Business con el permiso `whatsapp_business_messaging`).
4. La revisión del **texto y del aviso de privacidad** por el área jurídica: el aviso llega a un tercero, y los contactos
   de emergencia deben saber que la estancia puede escribirles.

## Cómo activarlo

En el `.env` del servidor (nunca en Git):

```
WHATSAPP_PHONE_NUMBER_ID=<Phone number ID>
WHATSAPP_ACCESS_TOKEN=<token permanente>
WHATSAPP_TEMPLATE_NAME=aviso_urgente_sirai
WHATSAPP_TEMPLATE_LANGUAGE=es_MX
```

El número y el token se configuran juntos; si falta uno, la API no arranca. Se reinicia la API y el proceso
de envío (cada `EMERGENCY_NOTICE_JOB_SECONDS`, 60 por defecto) toma los avisos pendientes.

## Cómo probarlo con la cuenta del cliente

1. En el entorno de pruebas, configurar la cuenta y crear un infante de prueba (datos inventados) con un contacto de
   emergencia cuyo teléfono sea un número propio.
2. Registrar la ausencia, abrir su seguimiento y registrar dos llamadas «sin respuesta».
3. En menos de un minuto debe llegar el mensaje. Verificar en la base:
   `SELECT estado, intentos, error_codigo FROM avisos_emergencia;` → `ENVIADO`, 1, `NULL`.
4. Si queda PENDIENTE o FALLIDO, `error_codigo` trae el código de Meta (`WHATSAPP_131030`: número no autorizado en
   modo de pruebas; `WHATSAPP_132001`: la plantilla no existe o no está aprobada; `WHATSAPP_190`: token vencido).
5. En la bitácora debe aparecer `AVISO_EMERGENCIA_ENVIADO` hecho por el sistema.

## Qué no cubre

- No hay pantalla que muestre el estado de los avisos al personal de la estancia: hoy se consulta en la base. Si el
  aviso no sale (FALLIDO), el personal sigue viendo la alerta en pantalla y debe llamar a mano.
- No se reciben respuestas de WhatsApp (estado de entrega, respuestas del contacto).
- El texto es único; no hay variantes por tipo de ausencia.
