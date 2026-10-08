import { Body } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

/** `@ZodBody(schema)` = `@Body()` validado con Zod. */
export const ZodBody = <T>(schema: ZodType<T>): ParameterDecorator => Body(new ZodValidationPipe(schema));
