import { attendanceRate, type DateRange, type ReportPeriod, trafficLight, type TrafficLight } from '@sirai/domain';
import type { DayFact, EstanciaInfo, PeriodDetailRow, PeriodReport, PeriodSummaryRow } from '../reports.types.js';

const PRIORITY: Readonly<Record<TrafficLight, number>> = { ROJO: 0, AMARILLO: 1, SIN_CAPTURA: 2, VERDE: 3 };

const marksOf = (fact: Pick<DayFact, 'present' | 'absent' | 'other'>): number => fact.present + fact.absent + fact.other;

const summaryRow = (info: EstanciaInfo, days: readonly DayFact[]): PeriodSummaryRow => {
  const present = days.reduce((total, fact) => total + fact.present, 0);
  const absent = days.reduce((total, fact) => total + fact.absent, 0);
  const other = days.reduce((total, fact) => total + fact.other, 0);
  const marks = present + absent + other;
  const rate = attendanceRate(present, marks);
  return { ...info, days: new Set(days.map((fact) => fact.date)).size, marks, present, absent, other, rate, light: trafficLight(rate) };
};

/**
 * Arma el corte a partir de los hechos por día. Solo hay conteos y porcentajes:
 * ningún dato identificable de infantes ni tutores (RF-18, S-10). Las estancias
 * del alcance sin jornadas aparecen igual, como SIN_CAPTURA.
 */
export function buildPeriodReport(period: ReportPeriod, range: DateRange, estancias: readonly EstanciaInfo[], days: readonly DayFact[], generatedAt: Date): PeriodReport {
  const byEstancia = new Map<number, DayFact[]>(estancias.map((info) => [info.estanciaId, []]));
  for (const fact of days) byEstancia.get(fact.estanciaId)?.push(fact);

  const summary = estancias
    .map((info) => summaryRow(info, byEstancia.get(info.estanciaId) ?? []))
    .sort((a, b) => PRIORITY[a.light] - PRIORITY[b.light] || (a.rate ?? 1) - (b.rate ?? 1) || a.name.localeCompare(b.name, 'es'));

  const infoById = new Map(estancias.map((info) => [info.estanciaId, info]));
  const details: PeriodDetailRow[] = days
    .filter((fact) => infoById.has(fact.estanciaId))
    .map((fact) => ({ ...(infoById.get(fact.estanciaId) as EstanciaInfo), date: fact.date, present: fact.present, absent: fact.absent, other: fact.other, rate: attendanceRate(fact.present, marksOf(fact)) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'es'));

  const captured = summary.filter((row) => row.marks > 0);
  const present = captured.reduce((total, row) => total + row.present, 0);
  const marks = captured.reduce((total, row) => total + row.marks, 0);
  return {
    period,
    range,
    generatedAt,
    summary,
    totals: {
      estancias: summary.length,
      days: summary.reduce((total, row) => total + row.days, 0),
      marks,
      present,
      absent: captured.reduce((total, row) => total + row.absent, 0),
      other: captured.reduce((total, row) => total + row.other, 0),
      rate: attendanceRate(present, marks),
    },
    details,
  };
}
