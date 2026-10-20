# Tablero de métricas

Corte: 2026-10-20. Fuente: RTM, git y reportes de `docs/operations`.

## Resumen

| Indicador | Valor |
| --- | --- |
| Requisitos totales | 55 (38 RF + 17 RNF) |
| Implementados | 50 (90.9 %) |
| Parciales | 4 (RF-13, RF-27, RNF-08, RNF-14) |
| Pendientes | 1 (RNF-17, UAT) |
| Avance ponderado (parcial = 0.5) | 52 / 55 = **94.5 %** |
| Cobertura de líneas (lógica de negocio) | 97.9 % (umbral 80 %) |
| Cobertura de ramas | 83.6 % (umbral 75 %) |

## Velocidad

| Medida | Valor |
| --- | --- |
| Periodo de código | 2026-10-07 a 2026-10-20 (14 días; 10 con actividad) |
| PR fusionados | 49 (3.5 por día calendario, 4.9 por día activo) |
| Commits | 127 (120 sin bots; 40 `feat`, 13 `docs`, 9 `chore`, 4 `test`, 4 `fix`) |
| Requisitos cerrados | 50 en 14 días = **3.6 por día** (≈ 25 por semana) |
| Código | ≈ 51 800 líneas añadidas, ≈ 37 700 en TypeScript |
| Archivos de prueba | 159 |



## SPI (índice de desempeño del cronograma)

SPI = EV / PV. **Línea base**: el alcance de las fases F1 a F4
(54 requisitos, todo salvo el UAT de F5) debía estar terminado a la fecha de
corte, así PV = 54.

| Concepto | Cálculo | Valor |
| --- | --- | --- |
| PV | requisitos de F1–F4 | 54 |
| EV | 50 implementados + 2 (4 parciales × 0.5), RNF-17 excluido | 52 |
| **SPI** | 52 / 54 | **0.96** |

Lectura: ligeramente por debajo del plan, dentro de tolerancia (0.95 a 1.05).
Las fechas del plan original no se consultaron; PV se fijó con el criterio
anterior.

## CPI

No se calculó: no hay costo real (AC) ni presupuesto (BAC). Indicador
sustituto, **rendimiento por PR**: 50 requisitos / 49 PR ≈ 1.02 requisitos
por PR fusionado, con 4 PR de corrección (`fix`) sobre 40 de `feat`
(tasa de retrabajo ≈ 10 %).

## Calidad

| Medida | Resultado |
| --- | --- |
| Cobertura líneas / sentencias / funciones / ramas | 97.9 % / 95.6 % / 96.8 % / 83.6 % |
| Rama más débil | `dossiers` 72.4 % en ramas; `school-years` 74 % |
| Rutas con permiso declarado | 63 de 63 |
| Rendimiento (RNF-08) | cumple en 2 de 3 corridas; p95 0.65 a 1.3 s (meta 1.5 s) |
| Hallazgo de rendimiento | p95 inicial 3.2 a 3.9 s, resuelto con índices y sin subconsulta por infante |
| Dependencias | sin avisos en `pnpm audit` |

## Semáforo

| Área | Estado | Motivo |
| --- | --- | --- |
| Alcance | Verde | 90.9 % implementado |
| Cronograma | Ámbar | SPI 0.96; UAT sin iniciar |
| Calidad | Verde | cobertura muy por encima del umbral |
| Riesgo externo | Ámbar | WhatsApp Business del cliente, infraestructura real, prueba de penetración externa |
