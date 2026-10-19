/** Nombres de las cuentas y matrículas sintéticas de la prueba de carga; compartidos por la semilla y el ejecutor. */
export const LOAD_DOMAIN = 'carga.test';
export const LOAD_PASSWORD = 'contrasena-de-carga-1';

export const pad = (value: number, width = 3): string => String(value).padStart(width, '0');
export const loadEmail = (role: string, estancia: number): string => `${role.toLowerCase()}-${pad(estancia)}@${LOAD_DOMAIN}`;
export const loadEnrollmentNumber = (estancia: number, child: number): string => `CARGA-${pad(estancia)}-${pad(child, 2)}`;
