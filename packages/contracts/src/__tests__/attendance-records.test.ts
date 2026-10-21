import { describe, expect, it } from 'vitest';
import { markAttendanceRequestSchema, rosterResponseSchema } from '../attendance/record.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mark = (n: number, overrides: Record<string, unknown> = {}) => ({ enrollmentId: n, status: 'PRESENTE', clientId: uuid(n), ...overrides });

describe('markAttendanceRequestSchema', () => {
  it('acepta un lote de marcas y fija el método manual por omisión', () => {
    const result = markAttendanceRequestSchema.safeParse({ marks: [mark(1), mark(2, { status: 'FILTRO_SANITARIO' })] });
    expect(result.success && result.data.marks[0]?.method).toBe('MANUAL');
  });

  it('rechaza estados que no existen y identificadores que no son UUID', () => {
    expect(markAttendanceRequestSchema.safeParse({ marks: [mark(1, { status: 'DORMIDO' })] }).success).toBe(false);
    expect(markAttendanceRequestSchema.safeParse({ marks: [mark(1, { clientId: 'no-uuid' })] }).success).toBe(false);
  });

  it('rechaza lotes vacíos o demasiado grandes', () => {
    expect(markAttendanceRequestSchema.safeParse({ marks: [] }).success).toBe(false);
    const tooMany = Array.from({ length: 501 }, (_, index) => mark(index + 1));
    expect(markAttendanceRequestSchema.safeParse({ marks: tooMany }).success).toBe(false);
  });

  it('rechaza repetir un infante o un identificador de operación dentro del lote', () => {
    expect(markAttendanceRequestSchema.safeParse({ marks: [mark(1), mark(1, { clientId: uuid(9) })] }).success).toBe(false);
    expect(markAttendanceRequestSchema.safeParse({ marks: [mark(1), mark(2, { clientId: uuid(1) })] }).success).toBe(false);
  });
});

describe('rosterResponseSchema', () => {
  const entry = { enrollmentId: 1, childId: 5, childName: 'Infante Prueba', enrollmentNumber: 'M-1', roomId: 7, roomName: 'Lactantes', status: null, medicalLock: false };

  it('acepta la lista con infantes sin marcar o con su estado', () => {
    expect(rosterResponseSchema.safeParse({ entries: [entry, { ...entry, enrollmentId: 2, status: 'PRESENTE' }] }).success).toBe(true);
  });

  it('solo indica si hay candado médico, sin diagnósticos ni contacto', () => {
    // De la salida y las incidencias (S-27) solo viajan la hora y cuántas hay: ni el tutor ni la descripción.
    expect(Object.keys(rosterResponseSchema.shape.entries.element.shape).sort()).toEqual(
      ['childId', 'childName', 'enrollmentId', 'enrollmentNumber', 'incidentCount', 'leftAt', 'medicalLock', 'roomId', 'roomName', 'status'].sort(),
    );
  });
});
