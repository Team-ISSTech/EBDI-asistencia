# Lecciones aprendidas y recomendaciones

## Lo que funcionó

- **Decisiones registradas (ADR) y RTM viva.** Cada PR actualiza la matriz;
  el avance se lee sin reuniones.
- **Compuertas de calidad desde el día 1** (lint, tipos, pruebas, complejidad
  ≤ 10, cobertura). La cobertura final (97.9 %) no requirió un esfuerzo de
  última hora.
- **Aislar supuestos** (S-12 a S-26): el equipo avanzó sin esperar respuestas
  del cliente.
- **PR cortos y ramas por funcionalidad** permitieron trabajo en paralelo
  (cinco ramas fusionadas el mismo día, 10-15 y 10-16).
- **Pruebas de carga tempranas** hallaron un cuello de botella real (p95 de
  3.2 a 3.9 s) y se corrigió antes del piloto.

## Lo que costó

- **Línea base fuera del repositorio.** Sin fechas ni costo en el repo no se
  puede calcular un SPI/CPI defendible.
- **Velocidad en picos.** Trabajo concentrado en pocos días y un arranque
  lento (del 09-22 al 10-07 sin código).
- **Dependencia del cliente** para cuatro requisitos parciales.
- **Un PR de corrección de seguridad y autorización tras la primera
  revisión** (`fix: cerrar las brechas de autorización`): la revisión debe
  ocurrir antes, no después de fusionar.

## Recomendaciones

1. **Exportar la línea base** (fechas y esfuerzo de las 32 actividades) del
   GitHub Project a `docs/` y recalcular SPI. Registrar horas para obtener CPI.
2. **Agendar ya el piloto** (3 a 5 estancias) y pedir al cliente S-22 y S-26;
   son la ruta crítica.
3. **Repetir RNF-08 en infraestructura real** y añadir la corrida a una
   rutina periódica, no solo manual.
4. **Contratar la prueba de penetración externa** (pendiente en RNF-06).
5. **Subir las ramas débiles** (`dossiers` 72.4 %, `school-years` 74 %).
6. **Cerrar el entregable de prototipos UI/UX** (RNF-14) con revisión de
   accesibilidad antes del UAT.
7. **Medir ritmo semanal** con esta misma plantilla para detectar picos y
   cuellos de botella con tiempo.
