# Justificación de la priorización

SIRAI da servicio a 212 estancias infantiles y maneja datos de menores. El
repositorio no contiene un portafolio con otros proyectos, por lo que este
documento justifica la prioridad dentro del proyecto y enumera los factores
para compararlo con otros.

## Criterios usados

1. **Riesgo para menores y cumplimiento.** Autenticación, aislamiento entre
   estancias, cifrado, auditoría y borrado lógico antes que cualquier pantalla.
2. **Valor operativo diario.** Pase de lista en dos clics y modo sin conexión,
   porque las estancias dependen de tabletas con red inestable.
3. **Dependencias técnicas.** Identidad y esquema de base antes de asistencia;
   asistencia antes de seguimiento, reportes y expediente.
4. **Incertidumbre.** Lo que depende del cliente se aisló con supuestos
   (S-22, S-26) para no frenar el resto.

## Orden efectivo de ejecución

| Orden | Bloque | Fechas | Por qué primero |
| --- | --- | --- | --- |
| 1 | Requisitos, ADR de stack y CI | 10-07 | Decisiones caras de revertir |
| 2 | Identidad, sesiones por estancia, RBAC | 10-07 a 10-08 | Toda autorización vive en la API |
| 3 | Padrón de infantes y tutores (cifrado) | 10-14 | Datos que sostienen la asistencia |
| 4 | Asistencia, seguimientos, tablero, reportes, expediente | 10-15 | Valor central del producto |
| 5 | Sincronización, catálogos, movimientos, escaneo | 10-16 a 10-17 | Cobertura de casos reales |
| 6 | Auditoría, Bearer tokens, retención, sin conexión | 10-18 | Cumplimiento y resiliencia |
| 7 | Revisión de seguridad, carga, cobertura, manuales | 10-18 a 10-19 | Cerrar con evidencia |

## Prioridad de lo que falta

| Prioridad | Pendiente | Razón |
| --- | --- | --- |
| Alta | UAT (RNF-17) | Único criterio de aceptación sin cubrir |
| Alta | RNF-08 en infraestructura real | Riesgo de incumplir p95 en escrituras |
| Media | RF-27 con WhatsApp real | Afecta alerta de niños no localizados |
| Media | RNF-14 prototipos | Documental; ayuda a validar con el piloto |
| Baja | RF-13 credenciales de tutores | Requiere definición del cliente |

## Para el portafolio

Si SIRAI se compara con otros proyectos, los factores a pesar son: alcance
nacional (212 estancias), manejo de datos sensibles de menores, ya con
cobertura y seguridad revisadas, y un único bloqueo mayor (el UAT). La
inversión restante es pequeña frente a lo ya construido, lo que favorece
terminarlo antes que abrir trabajo nuevo.
