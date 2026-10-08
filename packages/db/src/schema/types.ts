import { customType } from 'drizzle-orm/mysql-core';

/**
 * drizzle-orm/mysql-core tipa BINARY y VARBINARY como string, pero mysql2
 * entrega Buffer. Estos tipos propios conservan Buffer en ambos sentidos.
 */
export const binaryBytes = (length: number) =>
  customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => `binary(${length})` });

export const varbinaryBytes = (length: number) =>
  customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => `varbinary(${length})` });

export const longblob = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'longblob' });
