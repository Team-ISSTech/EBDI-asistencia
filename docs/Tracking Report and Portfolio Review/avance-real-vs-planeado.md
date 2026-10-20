# Avance real contra lo planeado

## Plan de referencia

El SRS define cinco entregables por fase (RNF-13 a RNF-17). No hay fechas en
el repositorio, de modo que la comparación es por entregable.

| Fase | Entregable planeado | Real | Estado |
| --- | --- | --- | --- |
| F1 | SRS y RTM | Publicados desde 2026-10-07 y mantenidos en cada PR | Completo |
| F2 | ER y prototipos de interfaz | Modelo ER en `data-model.md`; **faltan prototipos UI/UX con revisión de accesibilidad** | Parcial |
| F3 | Repositorio con 80 % de cobertura | 97.9 % de líneas, CI con compuertas | Completo (supera la meta) |
| F4 | Script de migración y manual | 16+ migraciones, comando de primer administrador, manuales de instalación y usuario | Completo |
| F5 | UAT con 3 a 5 estancias piloto | No iniciado | Pendiente |

## Análisis

- **Adelantado en construcción.** Las fases 3 y 4 se cerraron antes de iniciar
  F5, y la cobertura duplica casi la exigencia. Se implementaron también RF-37
  (API con Bearer tokens) y RF-38 (cambio de contraseña), agregados el
  2026-10-16, es decir, alcance añadido sin romper el avance.
- **Rezagado en lo que depende de terceros.** Las cuatro piezas parciales
  esperan al cliente o a infraestructura real, no a desarrollo:
  RF-13 (credenciales de tutores y salida: el documento no las define, S-22),
  RF-27 (cuenta y plantilla de WhatsApp Business, S-26), RNF-08 (medir en
  infraestructura real) y RNF-14 (prototipos).
- **Ruta crítica restante:** definir con el cliente las 3 a 5 estancias
  piloto, cerrar RF-13 y RF-27, medir carga en el entorno real, y ejecutar el
  UAT. El UAT es la única actividad sin arrancar y la que da el cierre formal.
- **Desviación principal:** el desarrollo se concentró en 14 días tras ~2 semanas
  de documentación (del 2026-09-22 al 10-07 solo hay commits de arranque), por
  lo que la velocidad actual no es sostenible como referencia futura.

## Pronóstico

Con SPI 0.96 y los bloqueos externos como único freno, el desarrollo
termina cuando el cliente entregue S-22 y S-26: de 1 a 2 semanas después de
recibirlos. El UAT depende del calendario de los pilotos.
