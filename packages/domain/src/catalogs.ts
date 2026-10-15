/**
 * Valores válidos de los campos de estado de los catálogos. La base los guarda
 * como VARCHAR (decisión P11); aquí viven las listas y la migración de cada
 * módulo las replica en un CHECK. El primer valor es el de omisión del SQL.
 */
export const SHIFTS = ['MATUTINO', 'VESPERTINO'] as const;
export type Shift = (typeof SHIFTS)[number];

export const ESTANCIA_STATUSES = ['ACTIVA', 'INACTIVA'] as const;
export type EstanciaStatus = (typeof ESTANCIA_STATUSES)[number];

export const ROOM_STATUSES = ['ACTIVO', 'INACTIVO'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const CHILD_STATUSES = ['ACTIVO', 'BAJA'] as const;
export type ChildStatus = (typeof CHILD_STATUSES)[number];

export const ENROLLMENT_STATUSES = ['ACTIVA', 'BAJA', 'TRASLADADA'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

/** Tipos de `movimientos_inscripcion.tipo_movimiento`. */
export const ENROLLMENT_MOVEMENTS = ['ALTA', 'CAMBIO_SALA', 'TRASLADO', 'BAJA'] as const;
export type EnrollmentMovement = (typeof ENROLLMENT_MOVEMENTS)[number];

export const isShift = (value: string): value is Shift => (SHIFTS as readonly string[]).includes(value);
