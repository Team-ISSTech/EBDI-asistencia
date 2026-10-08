import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../errors/api-error';
import { describeForLog, toErrorBody } from '../errors/api-exception.filter';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';

describe('toErrorBody', () => {
  it('serializa ApiError con su código y estado', () => {
    const result = toErrorBody(new ApiError('SIN_PERMISO', 'no'));
    expect(result).toEqual({ status: HttpStatus.FORBIDDEN, body: { error: { code: 'SIN_PERMISO', message: 'no' } } });
  });

  it('mapea el throttler a DEMASIADAS_SOLICITUDES', () => {
    expect(toErrorBody(new ThrottlerException()).body.error.code).toBe('DEMASIADAS_SOLICITUDES');
  });

  it('mapea un 404 de Nest a NO_ENCONTRADO', () => {
    const result = toErrorBody(new HttpException('x', HttpStatus.NOT_FOUND));
    expect(result.body.error.code).toBe('NO_ENCONTRADO');
  });

  it('oculta el detalle de errores no controlados', () => {
    const result = toErrorBody(new Error('stack con rutas internas'));
    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body.error.message).not.toContain('internas');
  });
});

describe('describeForLog', () => {
  it('no incluye el mensaje del error (puede llevar consultas y parámetros)', () => {
    const driverError = Object.assign(new Error('ER_DUP_ENTRY: insert into usuarios ... hash:secreto'), { code: 'ER_DUP_ENTRY' });
    const wrapped = new Error('Failed query: insert into usuarios params: secreto', { cause: driverError });
    const line = describeForLog(wrapped, 'req-1');
    expect(line).toBe('Error no controlado: Error (ER_DUP_ENTRY) requestId=req-1');
    expect(line).not.toContain('secreto');
  });
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ email: z.email(), age: z.number().int().positive() }));

  it('devuelve el valor transformado cuando es válido', () => {
    expect(pipe.transform({ email: 'a@b.mx', age: 3 })).toEqual({ email: 'a@b.mx', age: 3 });
  });

  it('lanza DATOS_INVALIDOS nombrando el campo', () => {
    let thrown: unknown;
    try {
      pipe.transform({ email: 'x', age: 3 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).code).toBe('DATOS_INVALIDOS');
    expect((thrown as ApiError).message).toContain('email');
  });
});
