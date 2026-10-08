import { describe, expect, it } from 'vitest';
import { apiErrorSchema } from '../common/error.js';
import { healthResponseSchema } from '../common/health.js';

describe('apiErrorSchema', () => {
  it('exige código y mensaje', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'NO_AUTORIZADO', message: 'x' } }).success).toBe(true);
    expect(apiErrorSchema.safeParse({ error: { message: 'x' } }).success).toBe(false);
  });
});

describe('healthResponseSchema', () => {
  it('solo admite los estados conocidos', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok', db: 'up' }).success).toBe(true);
    expect(healthResponseSchema.safeParse({ status: 'ok', db: 'maybe' }).success).toBe(false);
  });
});
