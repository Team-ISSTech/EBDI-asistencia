const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function* namesOf(side: unknown): Generator<string> {
  if (!isRecord(side)) return;
  for (const [key, value] of Object.entries(side)) {
    if (key === 'fields' && Array.isArray(value)) {
      for (const item of value) if (typeof item === 'string') yield item;
    } else {
      yield key;
    }
  }
}

/**
 * Nombres de los campos que cambió una operación, a partir de lo que la
 * bitácora guardó antes y después. Es lo único que la consulta de auditoría
 * muestra del cambio: nunca los valores, que pueden ser datos de menores. Solo
 * pasan nombres con forma de identificador; cualquier otra cosa se descarta.
 */
export function changedFieldNames(before: unknown, after: unknown): string[] {
  const names = new Set<string>();
  for (const side of [before, after]) {
    for (const name of namesOf(side)) if (FIELD_NAME.test(name)) names.add(name);
  }
  return [...names].sort();
}
