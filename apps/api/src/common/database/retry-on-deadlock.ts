const DEADLOCK = 'ER_LOCK_DEADLOCK';
const MAX_ATTEMPTS = 3;

const driverCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  return typeof code === 'string' ? code : driverCode(cause);
};

/**
 * MySQL resuelve un interbloqueo entre transacciones concurrentes abortando una de ellas, y
 * documenta que lo correcto es repetirla. Ejemplo: dos inicios de sesión de la misma cuenta a la
 * vez. Solo debe envolver una transacción completa y sin efectos fuera de la base.
 */
export async function retryOnDeadlock<T>(transaction: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await transaction();
    } catch (error) {
      if (driverCode(error) !== DEADLOCK || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}
