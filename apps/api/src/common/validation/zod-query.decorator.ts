import { Query } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

/** `@ZodQuery(schema)` = `@Query()` validado con Zod. */
export const ZodQuery = <T>(schema: ZodType<T>): ParameterDecorator => Query(new ZodValidationPipe(schema));
