import { type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ApiError } from '../errors/api-error';

/** Valida y transforma la entrada con un esquema de `@sirai/contracts`. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'cuerpo'}: ${issue.message}`)
      .join('; ');
    throw new ApiError('DATOS_INVALIDOS', `Datos inválidos. ${detail}`);
  }
}
