import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { schoolYearListResponseSchema } from '@sirai/contracts';
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
const ADMIN = 'admin_central@sirai.test';
const DIRECTORA = 'directora@sirai.test';
const SOCIAL = 'trabajo_social@sirai.test';
const MEDICO = 'medico@sirai.test';
const MS_PER_DAY = 86_400_000;
const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);
const nextWeek = new Date(Date.now() + 7 * MS_PER_DAY).toISOString().slice(0, 10);
const recentBirthDate = new Date(Date.now() - 180 * MS_PER_DAY).toISOString().slice(0, 10);
const NEXT_YEAR = { code: '2027-2028', startDate: '2027-08-23', endDate: '2028-07-14' };

/** Ciclos escolares, solo lectura y depuración (RNF-05) contra MySQL real, con datos sensibles de verdad. */
describe.skipIf(!TEST_DATABASE_URL)('retención por ciclo escolar (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  let generator: FollowUpsGeneratorService;
  let oldCode = '';
  let oldId = 0;
  let oldJourneyId = 0;
  let oldEnrollmentId = 0;
  let oldTicketId = 0;

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

  const rows = async <T>(query: ReturnType<typeof sql>): Promise<T[]> => ((await connection.db.execute(query)) as unknown as [T[]])[0];
  let guardianId = 0;

  /** Dos infantes con un tutor con teléfono, y una jornada de ayer en la que uno falta. */
  const seedPeople = async (): Promise<{ enrollmentIds: number[] }> => {
    const [room] = await rows<{ id: number }>(sql`SELECT id FROM salas_grupos WHERE turno = 'MATUTINO' ORDER BY id LIMIT 1`);
    const roomId = room?.id;
    const childA = await call('post', '/infantes', DIRECTORA, { enrollmentNumber: 'M-RET-1', name: 'Infante1', paternalSurname: 'Prueba', birthDate: recentBirthDate, roomId });
    await call('post', '/infantes', DIRECTORA, { enrollmentNumber: 'M-RET-2', name: 'Infante2', paternalSurname: 'Prueba', birthDate: recentBirthDate, roomId });
    const guardian = await call('post', '/tutores', DIRECTORA, { name: 'Tutor', paternalSurname: 'Prueba', phone: '5511223344' });
    guardianId = guardian.body.id;
    await call('post', `/infantes/${childA.body.id}/tutores`, DIRECTORA, { guardianId, relationship: 'Madre', validFrom: recentBirthDate, isEmergencyContact: true });
    return { enrollmentIds: (await rows<{ id: number }>(sql`SELECT id FROM inscripciones ORDER BY id`)).map((row) => row.id) };
  };

  const seedOldYear = async () => {
    const [active] = await rows<{ id: number; codigo: string }>(sql`SELECT id, codigo FROM ciclos_escolares WHERE estado = 'ACTIVO'`);
    oldId = active?.id ?? 0;
    oldCode = active?.codigo ?? '';
    const { enrollmentIds } = await seedPeople();
    oldEnrollmentId = enrollmentIds[0] ?? 0;
    const journey = await call('post', '/asistencia/jornadas', DIRECTORA, { date: yesterday, shift: 'MATUTINO' });
    oldJourneyId = journey.body.id;
    await call('post', `/asistencia/jornadas/${oldJourneyId}/registros`, 'docente@sirai.test', {
      marks: enrollmentIds.map((id, index) => ({ enrollmentId: id, status: index === 0 ? 'FALTA_INJUSTIFICADA' : 'PRESENTE', clientId: randomUUID() })),
    });
    await generator.generateDue(new Date());
    oldTicketId = (await rows<{ id: number }>(sql`SELECT id FROM seguimientos ORDER BY id LIMIT 1`))[0]?.id ?? 0;
  };

  const years = async () => schoolYearListResponseSchema.parse((await call('get', '/administracion/ciclos', ADMIN)).body).schoolYears;

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

    await seedOldYear();
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('solo el administrador central abre ciclos, los consulta y los depura', async () => {
    for (const email of [DIRECTORA, 'docente@sirai.test', SOCIAL, MEDICO, 'supervisor_central@sirai.test']) {
      expect((await call('get', '/administracion/ciclos', email)).status).toBe(403);
      expect((await call('post', '/administracion/ciclos', email, NEXT_YEAR)).status).toBe(403);
      expect((await call('post', `/administracion/ciclos/${oldId}/depurar`, email, { confirmCode: oldCode })).status).toBe(403);
    }
  });

  it('el ciclo activo muestra lo que impide cerrarlo', async () => {
    const active = (await years()).find((year) => year.status === 'ACTIVO');
    expect(active).toMatchObject({ code: oldCode, usage: { openJourneys: 1, openFollowUps: 1 }, canPurge: false, archivedAt: null });
  });

  it('no se puede cerrar con una jornada abierta, ni con un seguimiento sin cerrar, y no se cambia nada', async () => {
    const first = await call('post', '/administracion/ciclos', ADMIN, NEXT_YEAR);
    expect(first.status).toBe(409);
    expect(first.body.error.message).toContain('1 jornada abierta');
    expect((await call('post', `/asistencia/jornadas/${oldJourneyId}/cierre`, DIRECTORA)).status).toBe(201);
    const second = await call('post', '/administracion/ciclos', ADMIN, NEXT_YEAR);
    expect(second.status).toBe(409);
    expect(second.body.error.message).toContain('1 seguimiento sin cerrar');
    const [state] = await rows<{ estado: string }>(sql`SELECT estado FROM ciclos_escolares WHERE id = ${oldId}`);
    expect(state?.estado).toBe('ACTIVO');
  });

  it('con todo cerrado, abre el ciclo nuevo y archiva el anterior con quién y cuándo', async () => {
    const contact = await call('post', `/seguimientos/${oldTicketId}/contactos`, SOCIAL, {
      result: 'CONTACTADO',
      guardianId,
      cause: 'ENF_CASA',
      expectedReturnDate: nextWeek,
      notes: 'Nota sensible de asesoría (ciclo anterior)',
    });
    expect(contact.status).toBe(201);
    const release = await call('post', `/seguimientos/${oldTicketId}/alta`, MEDICO, { dischargeDate: today, observations: 'Observación médica sensible (ciclo anterior)' });
    expect(release.status).toBe(201);
    expect((await call('post', `/seguimientos/${oldTicketId}/cierre`, SOCIAL)).status).toBe(201);

    const opened = await call('post', '/administracion/ciclos', ADMIN, NEXT_YEAR);
    expect(opened.status).toBe(201);
    expect(opened.body).toMatchObject({ code: '2027-2028', status: 'ACTIVO', archivedAt: null });

    const [old] = await rows<{ estado: string; archivado: number; por: number | null }>(sql`SELECT estado, (archivado_at IS NOT NULL) AS archivado, archivado_por AS por FROM ciclos_escolares WHERE id = ${oldId}`);
    expect(old).toMatchObject({ estado: 'ARCHIVADO' });
    expect(Number(old?.archivado)).toBe(1);
    expect(old?.por).not.toBeNull();
    const [activeCount] = await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ciclos_escolares WHERE estado = 'ACTIVO'`);
    expect(Number(activeCount?.n)).toBe(1);
  });

  it('el ciclo archivado es de solo lectura: una captura sin conexión anterior al cierre tampoco entra', async () => {
    const response = await call('post', '/sincronizacion', 'docente@sirai.test', {
      operations: [
        {
          operationId: randomUUID(),
          type: 'ATTENDANCE_MARKS',
          capturedAt: new Date(Date.now() - 3600_000).toISOString(),
          payload: { journeyId: oldJourneyId, marks: [{ enrollmentId: oldEnrollmentId, status: 'PRESENTE', clientId: randomUUID() }] },
        },
      ],
    });
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain('archivado');
    const [mark] = await rows<{ estado: string }>(sql`SELECT estado FROM asistencias WHERE inscripcion_id = ${oldEnrollmentId} AND jornada_id = ${oldJourneyId}`);
    expect(mark?.estado).toBe('FALTA_INJUSTIFICADA');
  });

  it('lo nuevo nace en el ciclo nuevo: jornadas e infantes', async () => {
    const [room] = await rows<{ id: number }>(sql`SELECT id FROM salas_grupos WHERE turno = 'MATUTINO' ORDER BY id LIMIT 1`);
    const child = await call('post', '/infantes', DIRECTORA, { enrollmentNumber: 'M-RET-3', name: 'Infante3', paternalSurname: 'Prueba', birthDate: recentBirthDate, roomId: room?.id });
    expect(child.status).toBe(201);
    const journey = await call('post', '/asistencia/jornadas', DIRECTORA, { date: today, shift: 'MATUTINO' });
    expect(journey.status).toBe(201);
    const [year] = await rows<{ codigo: string }>(sql`SELECT c.codigo FROM jornadas_asistencia j JOIN ciclos_escolares c ON c.id = j.ciclo_escolar_id WHERE j.id = ${journey.body.id}`);
    expect(year?.codigo).toBe('2027-2028');
  });

  it('rechaza una clave repetida y un rango invertido, sin tocar el ciclo activo', async () => {
    expect((await call('post', '/administracion/ciclos', ADMIN, { ...NEXT_YEAR, code: oldCode })).status).toBe(409);
    expect((await call('post', '/administracion/ciclos', ADMIN, { code: 'X-1', startDate: '2028-01-01', endDate: '2027-01-01' })).status).toBe(400);
    const [activeCount] = await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ciclos_escolares WHERE estado = 'ACTIVO' AND codigo = '2027-2028'`);
    expect(Number(activeCount?.n)).toBe(1);
  });

  it('un ciclo archivado hace menos de 5 años no se depura y dice desde cuándo podrá', async () => {
    const list = await years();
    expect(list.find((year) => year.id === oldId)).toMatchObject({ status: 'ARCHIVADO', canPurge: false, usage: null });
    const response = await call('post', `/administracion/ciclos/${oldId}/depurar`, ADMIN, { confirmCode: oldCode });
    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('podrá depurarse a partir del');
    const [contact] = await rows<{ notas: Buffer | null }>(sql`SELECT notas_asesoria_cifradas AS notas FROM contactos_seguimiento LIMIT 1`);
    expect(contact?.notas).not.toBeNull();
  });

  it('el ciclo activo tampoco se depura', async () => {
    const [active] = await rows<{ id: number; codigo: string }>(sql`SELECT id, codigo FROM ciclos_escolares WHERE estado = 'ACTIVO'`);
    const response = await call('post', `/administracion/ciclos/${active?.id}/depurar`, ADMIN, { confirmCode: active?.codigo });
    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('no está archivado');
  });

  describe('cumplidos los 5 años', () => {
    let newTicketId = 0;

    it('prepara un seguimiento del ciclo nuevo con notas, que la depuración no debe tocar', async () => {
      const [enrollment] = await rows<{ id: number }>(sql`SELECT id FROM inscripciones ORDER BY id DESC LIMIT 1`);
      const [journey] = await rows<{ id: number }>(sql`SELECT j.id FROM jornadas_asistencia j JOIN ciclos_escolares c ON c.id = j.ciclo_escolar_id WHERE c.codigo = '2027-2028' LIMIT 1`);
      await call('post', `/asistencia/jornadas/${journey?.id}/registros`, 'docente@sirai.test', { marks: [{ enrollmentId: enrollment?.id, status: 'FALTA_INJUSTIFICADA', clientId: randomUUID() }] });
      await generator.generateDue(new Date(`${today}T20:00:00Z`));
      const [ticket] = await rows<{ id: number }>(sql`SELECT id FROM seguimientos ORDER BY id DESC LIMIT 1`);
      newTicketId = ticket?.id ?? 0;
      expect(newTicketId).not.toBe(oldTicketId);
      const contact = await call('post', `/seguimientos/${newTicketId}/contactos`, SOCIAL, { result: 'SIN_RESPUESTA', notes: 'Nota del ciclo vigente' });
      expect(contact.status).toBe(201);
    });

    it('exige escribir la clave del ciclo; con otra no depura nada', async () => {
      await connection.db.execute(sql`UPDATE ciclos_escolares SET archivado_at = DATE_SUB(NOW(6), INTERVAL 6 YEAR) WHERE id = ${oldId}`);
      expect((await years()).find((year) => year.id === oldId)).toMatchObject({ canPurge: true });
      const wrong = await call('post', `/administracion/ciclos/${oldId}/depurar`, ADMIN, { confirmCode: 'OTRO' });
      expect(wrong.status).toBe(400);
      expect((await call('post', `/administracion/ciclos/${oldId}/depurar`, ADMIN, {})).status).toBe(400);
      const [state] = await rows<{ depurado: number }>(sql`SELECT (depurado_at IS NOT NULL) AS depurado FROM ciclos_escolares WHERE id = ${oldId}`);
      expect(Number(state?.depurado)).toBe(0);
    });

    it('vacía teléfono, notas y observaciones del ciclo viejo sin borrar ninguna fila, y no toca el ciclo vigente', async () => {
      const before = await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM contactos_seguimiento`);
      const response = await call('post', `/administracion/ciclos/${oldId}/depurar`, ADMIN, { confirmCode: oldCode });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ contacts: 1, releases: 1 });

      const after = await rows<{ n: number }>(sql`SELECT COUNT(*) AS n FROM contactos_seguimiento`);
      expect(Number(after[0]?.n)).toBe(Number(before[0]?.n));
      const [oldContact] = await rows<{ tel: Buffer | null; notas: Buffer | null; resultado: string }>(
        sql`SELECT telefono_destino_cifrado AS tel, notas_asesoria_cifradas AS notas, resultado FROM contactos_seguimiento WHERE seguimiento_id = ${oldTicketId}`,
      );
      expect(oldContact).toMatchObject({ tel: null, notas: null, resultado: 'CONTACTADO' });
      const [release] = await rows<{ obs: Buffer | null; folio: string | null }>(sql`SELECT observaciones_cifradas AS obs, folio FROM altas_medicas WHERE seguimiento_id = ${oldTicketId}`);
      expect(release?.obs).toBeNull();
      const [current] = await rows<{ notas: Buffer | null }>(sql`SELECT notas_asesoria_cifradas AS notas FROM contactos_seguimiento WHERE seguimiento_id = ${newTicketId}`);
      expect(current?.notas).not.toBeNull();
    });

    it('lo depurado se ve como un historial sin notas, y el ciclo queda marcado con quién y cuándo', async () => {
      const contacts = await call('get', `/seguimientos/${oldTicketId}/contactos`, SOCIAL);
      expect(contacts.status).toBe(200);
      expect((contacts.body.contacts as { notes: string | null; result: string }[])[0]).toMatchObject({ notes: null, result: 'CONTACTADO' });
      const [state] = await rows<{ depurado: number; por: number | null }>(sql`SELECT (depurado_at IS NOT NULL) AS depurado, depurado_por AS por FROM ciclos_escolares WHERE id = ${oldId}`);
      expect(Number(state?.depurado)).toBe(1);
      expect(state?.por).not.toBeNull();
      expect((await years()).find((year) => year.id === oldId)).toMatchObject({ canPurge: false, purgedAt: expect.any(String) as string });
    });

    it('no se depura dos veces', async () => {
      const again = await call('post', `/administracion/ciclos/${oldId}/depurar`, ADMIN, { confirmCode: oldCode });
      expect(again.status).toBe(409);
      expect(again.body.error.message).toContain('ya se depuró');
    });

    it('un ciclo inexistente responde 404', async () => {
      expect((await call('post', '/administracion/ciclos/99999/depurar', ADMIN, { confirmCode: 'X' })).status).toBe(404);
    });
  });

  it('audita archivar, abrir y depurar, con los conteos de lo depurado', async () => {
    const actions = await rows<{ accion: string; rol: string | null }>(sql`SELECT accion, rol_codigo AS rol FROM auditoria WHERE accion IN ('CICLO_ARCHIVADO', 'CICLO_ABIERTO', 'CICLO_DEPURADO') ORDER BY id`);
    expect(actions.map((a) => a.accion)).toEqual(['CICLO_ARCHIVADO', 'CICLO_ABIERTO', 'CICLO_DEPURADO']);
    expect(actions.every((a) => a.rol === 'ADMIN_CENTRAL')).toBe(true);
  });
});
