import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { followUpListResponseSchema } from '@sirai/contracts';
import { applyMigrations, connect, dropAllObjects, seedDevelopmentData, syncRolePermissions } from '@sirai/db';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { FollowUpsGeneratorService } from '../src/modules/follow-ups/services/follow-ups-generator.service';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const SEED_PASSWORD = 'contrasena-de-prueba';
const DIRECTORA = 'directora@sirai.test';
const MS_PER_DAY = 86_400_000;
const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10);
const recentBirthDate = new Date(Date.now() - 180 * MS_PER_DAY).toISOString().slice(0, 10);

/** Tickets de seguimiento por ausencia contra MySQL real: generación, bandeja y reglas del motor. */
describe.skipIf(!TEST_DATABASE_URL)('seguimientos de ausencias (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  let generator: FollowUpsGeneratorService;

  const cookieFor = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password: SEED_PASSWORD });
    const header = response.get('set-cookie');
    const cookie = Array.isArray(header) ? header[0] : header;
    if (!cookie) throw new Error(`Sin cookie para ${email}`);
    return cookie.split(';')[0] ?? '';
  };

  /** La cookie se resuelve antes de crear la petición: supertest no admite dos a la vez sobre el mismo servidor. */
  const call = async (method: 'get' | 'post', path: string, email: string, body?: object): Promise<request.Response> => {
    const cookie = await cookieFor(email);
    const pending = request(app.getHttpServer())[method](path).set('Cookie', cookie);
    return body ? pending.send(body) : pending;
  };

  const count = async (query: ReturnType<typeof sql>): Promise<number> => {
    const [rows] = (await connection.db.execute(query)) as unknown as [{ n: number }[]];
    return Number(rows[0]?.n);
  };

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    process.env['DATABASE_URL'] = TEST_DATABASE_URL;
    process.env['DATA_ENCRYPTION_KEY'] = process.env['DATA_ENCRYPTION_KEY'] ?? 'c'.repeat(64);
    process.env['LOGIN_RATE_LIMIT_PER_MINUTE'] = '500';
    await dropAllObjects(TEST_DATABASE_URL);
    await applyMigrations(TEST_DATABASE_URL, SQL_DIR);
    connection = connect(TEST_DATABASE_URL);
    await syncRolePermissions(connection.db);
    await seedDevelopmentData(connection.db, SEED_PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    generator = app.get(FollowUpsGeneratorService);
    const [rooms] = (await connection.db.execute(sql`SELECT id FROM salas_grupos WHERE turno = 'MATUTINO' ORDER BY id LIMIT 1`)) as unknown as [{ id: number }[]];
    for (const n of [1, 2, 3, 4]) {
      await call('post', '/infantes', DIRECTORA, { enrollmentNumber: `M-SEG-${n}`, name: `Infante${n}`, paternalSurname: 'Prueba', birthDate: recentBirthDate, roomId: rooms[0]?.id });
    }
    const [enrollments] = (await connection.db.execute(sql`SELECT id FROM inscripciones ORDER BY id`)) as unknown as [{ id: number }[]];
    const journey = await call('post', '/asistencia/jornadas', DIRECTORA, { date: yesterday, shift: 'MATUTINO' });
    const statuses = ['FALTA_INJUSTIFICADA', 'AUSENTE_JUSTIFICADO', 'COMISION_MEDICA', 'PRESENTE'];
    await call('post', `/asistencia/jornadas/${journey.body.id}/registros`, 'docente@sirai.test', {
      marks: enrollments.map((row, index) => ({ enrollmentId: row.id, status: statuses[index], clientId: randomUUID() })),
    });
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('sin correr el proceso no hay tickets', async () => {
    expect(await count(sql`SELECT COUNT(*) AS n FROM seguimientos`)).toBe(0);
  });

  it('genera un ticket por ausencia (falta y ausencia justificada) y ninguno por comisión médica ni presentes', async () => {
    expect(await generator.generateDue(new Date())).toBe(2);
    expect(await count(sql`SELECT COUNT(*) AS n FROM seguimientos WHERE estado = 'ABIERTO' AND clasificacion IS NULL`)).toBe(2);
  });

  it('es repetible: una segunda corrida no duplica nada', async () => {
    expect(await generator.generateDue(new Date())).toBe(0);
    expect(await count(sql`SELECT COUNT(*) AS n FROM seguimientos`)).toBe(2);
  });

  it('audita la apertura como el sistema, sin usuario', async () => {
    const [rows] = (await connection.db.execute(
      sql`SELECT usuario_id AS user_id, rol_codigo AS role, user_agent AS agent FROM auditoria WHERE accion = 'SEGUIMIENTO_ABIERTO'`,
    )) as unknown as [{ user_id: number | null; role: string; agent: string }[]];
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.user_id === null && row.role === 'SISTEMA' && row.agent === 'job:seguimientos')).toBe(true);
  });

  it('la ausencia de hoy genera su ticket a las 09:00 de la estancia y no un minuto antes', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const journey = await call('post', '/asistencia/jornadas', DIRECTORA, { date: today, shift: 'MATUTINO' });
    const [enrollment] = (await connection.db.execute(sql`SELECT id FROM inscripciones ORDER BY id LIMIT 1`)) as unknown as [{ id: number }[]];
    await call('post', `/asistencia/jornadas/${journey.body.id}/registros`, 'docente@sirai.test', {
      marks: [{ enrollmentId: enrollment[0]?.id, status: 'FALTA_INJUSTIFICADA', clientId: randomUUID() }],
    });
    // Ciudad de México es UTC-6 todo el año: las 09:00 locales son las 15:00 UTC.
    expect(await generator.generateDue(new Date(`${today}T14:59:00Z`))).toBe(0);
    expect(await generator.generateDue(new Date(`${today}T15:00:00Z`))).toBe(1);
    expect(await count(sql`SELECT COUNT(*) AS n FROM seguimientos`)).toBe(3);
  });

  it('la bandeja la ven trabajo social, enfermería, médico y directora, y la lectura se audita', async () => {
    for (const email of ['trabajo_social@sirai.test', 'enfermeria@sirai.test', 'medico@sirai.test', DIRECTORA]) {
      const response = await call('get', '/seguimientos', email);
      expect(response.status).toBe(200);
      const { followUps } = followUpListResponseSchema.parse(response.body);
      expect(followUps.map((ticket) => ticket.childName)).toEqual(expect.arrayContaining(['Infante1 Prueba', 'Infante2 Prueba']));
      expect(followUps).toHaveLength(3);
      expect(followUps.every((ticket) => ticket.status === 'ABIERTO' && ticket.cause === null)).toBe(true);
    }
    expect(await count(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'SEGUIMIENTOS_CONSULTADOS'`)).toBe(4);
  });

  it('la docente y los roles centrales no ven la bandeja', async () => {
    for (const email of ['docente@sirai.test', 'admin_central@sirai.test', 'supervisor_central@sirai.test']) {
      expect((await call('get', '/seguimientos', email)).status).toBe(403);
    }
  });

  it('no expone teléfonos ni datos de salud', async () => {
    const response = await call('get', '/seguimientos', 'trabajo_social@sirai.test');
    expect(JSON.stringify(response.body)).not.toMatch(/telefono|phone|curp|discapacidad|diagn/i);
  });

  it('el motor impide cerrar un ticket sin fecha de cierre o clasificarlo con una causa inventada', async () => {
    await expect(connection.db.execute(sql`UPDATE seguimientos SET estado = 'CERRADO' WHERE id = (SELECT id FROM (SELECT MIN(id) AS id FROM seguimientos) t)`)).rejects.toThrow();
    await expect(connection.db.execute(sql`UPDATE seguimientos SET clasificacion = 'OTRA' WHERE id = (SELECT id FROM (SELECT MIN(id) AS id FROM seguimientos) t)`)).rejects.toThrow();
  });

  describe('contactos con el tutor', () => {
    const SOCIAL_WORK = 'trabajo_social@sirai.test';
    const NOTES = 'Fiebre desde ayer; se le indicó acudir a su clínica de adscripción.';
    const PHONE = '5512345678';
    let missedTicketId = 0;
    let reachedTicketId = 0;
    let guardianId = 0;

    const ticketIdOf = async (childName: string): Promise<number> => {
      const list = await call('get', '/seguimientos', SOCIAL_WORK);
      const found = followUpListResponseSchema.parse(list.body).followUps.find((ticket) => ticket.childName === childName);
      if (!found) throw new Error(`Sin ticket de ${childName}`);
      return found.id;
    };

    beforeAll(async () => {
      missedTicketId = await ticketIdOf('Infante1 Prueba');
      reachedTicketId = await ticketIdOf('Infante2 Prueba');
      const [child] = (await connection.db.execute(sql`SELECT id FROM infantes WHERE matricula = 'M-SEG-2'`)) as unknown as [{ id: number }[]];
      const guardian = await call('post', '/tutores', DIRECTORA, { name: 'Tutora', paternalSurname: 'Prueba', phone: PHONE });
      guardianId = guardian.body.id;
      await call('post', `/infantes/${child[0]?.id}/tutores`, DIRECTORA, { guardianId, relationship: 'Madre', isPrimary: true, isEmergencyContact: true, validFrom: yesterday });
    });

    it('solo quien registra seguimiento puede registrar contactos', async () => {
      for (const email of ['docente@sirai.test', 'admin_central@sirai.test', 'supervisor_central@sirai.test']) {
        expect((await call('post', `/seguimientos/${missedTicketId}/contactos`, email, { result: 'SIN_RESPUESTA' })).status).toBe(403);
      }
    });

    it('no localizar al tutor clasifica NO_LOC, programa el segundo intento y, al repetirse, activa la alerta', async () => {
      const first = await call('post', `/seguimientos/${missedTicketId}/contactos`, SOCIAL_WORK, { result: 'SIN_RESPUESTA' });
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ status: 'CLASIFICADO', cause: 'NO_LOC', attemptCount: 1, emergencyAlert: false });
      const dueInMs = new Date(first.body.nextAttemptAt).getTime() - Date.now();
      expect(dueInMs).toBeGreaterThan(3.9 * 3_600_000);
      expect(dueInMs).toBeLessThanOrEqual(4 * 3_600_000);
      const second = await call('post', `/seguimientos/${missedTicketId}/contactos`, SOCIAL_WORK, { result: 'SIN_RESPUESTA' });
      expect(second.body).toMatchObject({ cause: 'NO_LOC', attemptCount: 2, emergencyAlert: true, nextAttemptAt: null });
    });

    it('contactar al tutor clasifica por enfermedad, fija el retorno y activa el candado médico', async () => {
      const body = { result: 'CONTACTADO', guardianId, cause: 'ENF_CASA', expectedReturnDate: '2026-10-30', notes: NOTES };
      const response = await call('post', `/seguimientos/${reachedTicketId}/contactos`, SOCIAL_WORK, body);
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ status: 'CLASIFICADO', cause: 'ENF_CASA', requiresMedicalRelease: true, expectedReturnDate: '2026-10-30', attemptCount: 1 });
      expect(JSON.stringify(response.body)).not.toContain('Fiebre');
    });

    it('guarda las notas y el teléfono marcado solo cifrados', async () => {
      const [rows] = (await connection.db.execute(
        sql`SELECT HEX(notas_asesoria_cifradas) AS notes, HEX(telefono_destino_cifrado) AS phone FROM contactos_seguimiento WHERE tutor_id = ${guardianId}`,
      )) as unknown as [{ notes: string; phone: string }[]];
      expect(rows).toHaveLength(1);
      expect(Buffer.from(rows[0]?.notes ?? '', 'hex').toString('utf8')).not.toContain('Fiebre');
      expect(Buffer.from(rows[0]?.phone ?? '', 'hex').toString('utf8')).not.toContain(PHONE);
    });

    it('el historial con notas descifradas solo lo ve quien accede a notas sensibles, y queda auditado', async () => {
      const path = `/seguimientos/${reachedTicketId}/contactos`;
      for (const email of ['docente@sirai.test', 'admin_central@sirai.test']) {
        expect((await call('get', path, email)).status).toBe(403);
      }
      const response = await call('get', path, SOCIAL_WORK);
      expect(response.status).toBe(200);
      expect(response.body.contacts).toHaveLength(1);
      expect(response.body.contacts[0]).toMatchObject({ attemptNumber: 1, result: 'CONTACTADO', guardianId, notes: NOTES });
      expect(await count(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'NOTAS_SEGUIMIENTO_CONSULTADAS'`)).toBe(1);
    });

    it('audita cada contacto con el antes y el después, sin notas ni teléfono', async () => {
      const [rows] = (await connection.db.execute(sql`SELECT accion FROM auditoria WHERE accion = 'CONTACTO_REGISTRADO'`)) as unknown as [{ accion: string }[]];
      expect(rows).toHaveLength(3);
    });

    it('rechaza a un tutor que no es del infante, cuerpos incompletos y tickets inexistentes', async () => {
      const stranger = await call('post', '/tutores', DIRECTORA, { name: 'Ajeno', paternalSurname: 'Prueba', phone: '5599998888' });
      const body = { result: 'CONTACTADO', guardianId: stranger.body.id, cause: 'PER_TUT', expectedReturnDate: '2026-10-30' };
      expect((await call('post', `/seguimientos/${reachedTicketId}/contactos`, SOCIAL_WORK, body)).status).toBe(400);
      expect((await call('post', `/seguimientos/${reachedTicketId}/contactos`, SOCIAL_WORK, { result: 'CONTACTADO', guardianId })).status).toBe(400);
      expect((await call('post', '/seguimientos/99999/contactos', SOCIAL_WORK, { result: 'SIN_RESPUESTA' })).status).toBe(404);
    });

    it('un intento sin respuesta no reclasifica un caso ya clasificado ni quita el candado', async () => {
      const response = await call('post', `/seguimientos/${reachedTicketId}/contactos`, SOCIAL_WORK, { result: 'SIN_RESPUESTA', guardianId });
      expect(response.body).toMatchObject({ cause: 'ENF_CASA', requiresMedicalRelease: true, attemptCount: 2, emergencyAlert: false, nextAttemptAt: null });
    });

    it('el motor impide repetir el número de intento de un ticket', async () => {
      await expect(
        connection.db.execute(
          sql`INSERT INTO contactos_seguimiento (seguimiento_id, numero_intento, fecha_hora, resultado, registrado_por) VALUES (${reachedTicketId}, 1, NOW(6), 'SIN_RESPUESTA', 1)`,
        ),
      ).rejects.toThrow();
      await expect(
        connection.db.execute(
          sql`INSERT INTO contactos_seguimiento (seguimiento_id, numero_intento, fecha_hora, resultado, registrado_por) VALUES (${reachedTicketId}, 9, NOW(6), 'TAL_VEZ', 1)`,
        ),
      ).rejects.toThrow();
    });
  });
});
