import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { verifyDossierResponseSchema } from '@sirai/contracts';
import { applyMigrations, connect, dropAllObjects, seedDevelopmentData, syncRolePermissions } from '@sirai/db';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { DOSSIER_PDF_OPTIONS } from '../src/modules/dossiers/services/dossier.service';
import { FollowUpsGeneratorService } from '../src/modules/follow-ups/services/follow-ups-generator.service';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const SEED_PASSWORD = 'contrasena-de-prueba';
const DIRECTORA = 'directora@sirai.test';
const SOCIAL_WORK = 'trabajo_social@sirai.test';
const MS_PER_DAY = 86_400_000;
const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10);
const recentBirthDate = new Date(Date.now() - 180 * MS_PER_DAY).toISOString().slice(0, 10);
const year = new Date().getUTCFullYear();
const NOTES = 'Fiebre desde ayer; se indicó acudir a su clínica.';
const OBSERVATIONS = 'Sin fiebre desde hace 48 horas.';
const PHONE = '5512345678';

/** Texto de un PDF sin comprimir: PDFKit escribe cada cadena en hexadecimal y partida por ajustes de espacio. */
const pdfText = (buffer: Buffer): string =>
  [...buffer.toString('latin1').matchAll(/\[([^\]]*)\] TJ/g)]
    .map((match) => [...(match[1] ?? '').matchAll(/<([0-9a-f]*)>/gi)].map((hex) => Buffer.from(hex[1] ?? '', 'hex').toString('latin1')).join(''))
    .join('\n');

/** Expediente del infante para traslados: emisión, folio, sello y verificación contra MySQL real. */
describe.skipIf(!TEST_DATABASE_URL)('expediente para traslados (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;
  let childId = 0;

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

  const download = async (email: string, id: number): Promise<request.Response> => {
    const cookie = await cookieFor(email);
    return request(app.getHttpServer())
      .get(`/expedientes/${id}`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
  };

  const issuedRows = async (): Promise<Array<{ id: number; seal: string; hash: string }>> => {
    const [rows] = (await connection.db.execute(sql`SELECT id, HEX(sello) AS seal, HEX(contenido_sha256) AS hash FROM expedientes_emitidos ORDER BY id`)) as unknown as [
      Array<{ id: number; seal: string; hash: string }>,
    ];
    return rows;
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DOSSIER_PDF_OPTIONS).useValue({ compress: false }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    // Historia completa: infante, tutora con teléfono, consentimiento, falta, llamada con notas, alta médica y cierre.
    const [rooms] = (await connection.db.execute(sql`SELECT id FROM salas_grupos WHERE turno = 'MATUTINO' ORDER BY id LIMIT 1`)) as unknown as [{ id: number }[]];
    const child = await call('post', '/infantes', DIRECTORA, { enrollmentNumber: 'M-EXP-1', name: 'Infante', paternalSurname: 'Prueba', maternalSurname: 'Dos', birthDate: recentBirthDate, hasDisability: true, disabilityGroup: 'Motriz', roomId: rooms[0]?.id });
    childId = child.body.id;
    const guardian = await call('post', '/tutores', DIRECTORA, { name: 'Tutora', paternalSurname: 'Prueba', phone: PHONE });
    await call('post', `/infantes/${childId}/tutores`, DIRECTORA, { guardianId: guardian.body.id, relationship: 'Madre', isPrimary: true, isEmergencyContact: true, canPickUp: true, validFrom: yesterday });
    await call('post', `/infantes/${childId}/consentimientos`, DIRECTORA, { guardianId: guardian.body.id, type: 'CONTACTO_TELEFONICO' });
    const journey = await call('post', '/asistencia/jornadas', DIRECTORA, { date: yesterday, shift: 'MATUTINO' });
    const [enrollment] = (await connection.db.execute(sql`SELECT id FROM inscripciones LIMIT 1`)) as unknown as [{ id: number }[]];
    await call('post', `/asistencia/jornadas/${journey.body.id}/registros`, 'docente@sirai.test', { marks: [{ enrollmentId: enrollment[0]?.id, status: 'FALTA_INJUSTIFICADA', clientId: randomUUID() }] });
    await app.get(FollowUpsGeneratorService).generateDue(new Date());
    const [ticket] = (await connection.db.execute(sql`SELECT id FROM seguimientos LIMIT 1`)) as unknown as [{ id: number }[]];
    const ticketId = ticket[0]?.id;
    await call('post', `/seguimientos/${ticketId}/contactos`, SOCIAL_WORK, { result: 'CONTACTADO', guardianId: guardian.body.id, cause: 'ENF_CASA', expectedReturnDate: yesterday, notes: NOTES });
    await call('post', `/seguimientos/${ticketId}/alta`, 'medico@sirai.test', { dischargeDate: yesterday, folio: 'ALTA-0042', observations: OBSERVATIONS });
    await call('post', `/seguimientos/${ticketId}/cierre`, SOCIAL_WORK);
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('solo la directora emite y verifica expedientes', async () => {
    for (const email of ['docente@sirai.test', SOCIAL_WORK, 'medico@sirai.test', 'enfermeria@sirai.test', 'admin_central@sirai.test', 'supervisor_central@sirai.test']) {
      expect((await download(email, childId)).status).toBe(403);
      expect((await call('post', '/expedientes/verificar', email, { folio: `EXP-${year}-000001`, seal: 'a'.repeat(64) })).status).toBe(403);
    }
    expect(await issuedRows()).toHaveLength(0);
  });

  it('la directora descarga el PDF foliado con todo el expediente descifrado', async () => {
    const response = await download(DIRECTORA, childId);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe(`attachment; filename="expediente-EXP-${year}-000001.pdf"`);
    const raw = response.body as Buffer;
    expect(raw.subarray(0, 5).toString()).toBe('%PDF-');
    const text = pdfText(raw);
    for (const expected of ['Infante Prueba Dos', 'M-EXP-1', 'Motriz', 'Tutora Prueba', PHONE, 'CONTACTO_TELEFONICO', 'FALTA_INJUSTIFICADA', 'ENF_CASA', NOTES, OBSERVATIONS, 'ALTA-0042', `EXP-${year}-000001`, 'Estancia de prueba 01']) {
      expect(text).toContain(expected);
    }
  });

  it('registra la emisión con su sello y la huella del contenido, y el PDF imprime ese sello', async () => {
    const [issued] = await issuedRows();
    expect(issued?.seal).toMatch(/^[0-9A-F]{64}$/);
    expect(issued?.hash).toMatch(/^[0-9A-F]{64}$/);
    const second = await download(DIRECTORA, childId);
    expect(second.headers['content-disposition']).toContain(`EXP-${year}-000002`);
    expect(pdfText(second.body as Buffer)).toContain((await issuedRows())[1]?.seal.toLowerCase() ?? 'x');
  });

  it('el mismo contenido da la misma huella; un cambio en el expediente la altera', async () => {
    const rows = await issuedRows();
    expect(rows[0]?.hash).toBe(rows[1]?.hash);
    expect(rows[0]?.seal).not.toBe(rows[1]?.seal);
    await call('post', `/infantes/${childId}/consentimientos`, DIRECTORA, { guardianId: (await connection.db.execute(sql`SELECT id FROM tutores LIMIT 1`).then((r) => (r as unknown as [{ id: number }[]])[0][0]?.id)), type: 'TRATAMIENTO_DATOS_SENSIBLES' });
    await download(DIRECTORA, childId);
    expect((await issuedRows())[2]?.hash).not.toBe(rows[0]?.hash);
  });

  it('verifica un expediente auténtico, y solo revela cuándo y dónde se emitió', async () => {
    const [issued] = await issuedRows();
    const response = await call('post', '/expedientes/verificar', DIRECTORA, { folio: `EXP-${year}-000001`, seal: issued?.seal.toLowerCase() });
    expect(response.status).toBe(200);
    const body = verifyDossierResponseSchema.parse(response.body);
    expect(body).toMatchObject({ valid: true, originEstancia: 'Estancia de prueba 01' });
    expect(JSON.stringify(response.body)).not.toMatch(/Infante|Prueba Dos|M-EXP|Motriz/);
  });

  it('rechaza un sello falso, un folio inexistente y un sello de otro expediente, sin distinguirlos', async () => {
    const rows = await issuedRows();
    const cases = [
      { folio: `EXP-${year}-000001`, seal: 'f'.repeat(64) },
      { folio: `EXP-${year}-000999`, seal: rows[0]?.seal.toLowerCase() },
      { folio: `EXP-${year}-000001`, seal: rows[1]?.seal.toLowerCase() },
    ];
    for (const body of cases) {
      const response = await call('post', '/expedientes/verificar', DIRECTORA, body);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ valid: false });
    }
    expect((await call('post', '/expedientes/verificar', DIRECTORA, { folio: 'mal', seal: 'a'.repeat(64) })).status).toBe(400);
  });

  it('un expediente emitido no se puede modificar ni borrar en la base', async () => {
    await expect(connection.db.execute(sql`UPDATE expedientes_emitidos SET sello = UNHEX(SHA2('x', 256)) WHERE id = 1`)).rejects.toThrow();
    await expect(connection.db.execute(sql`DELETE FROM expedientes_emitidos WHERE id = 1`)).rejects.toThrow();
  });

  it('audita cada emisión y verificación sin copiar el contenido del expediente', async () => {
    const [rows] = (await connection.db.execute(
      sql`SELECT accion, rol_codigo AS role FROM auditoria WHERE accion IN ('EXPEDIENTE_EXPORTADO', 'EXPEDIENTE_VERIFICADO') ORDER BY id`,
    )) as unknown as [Array<{ accion: string; role: string }>];
    expect(rows.filter((row) => row.accion === 'EXPEDIENTE_EXPORTADO')).toHaveLength(3);
    expect(rows.filter((row) => row.accion === 'EXPEDIENTE_VERIFICADO').length).toBeGreaterThanOrEqual(4);
    expect(rows.every((row) => row.role === 'DIRECTORA')).toBe(true);
  });

  it('un infante que no existe responde 404 y no emite nada', async () => {
    const before = (await issuedRows()).length;
    expect((await download(DIRECTORA, 99999)).status).toBe(404);
    expect((await issuedRows()).length).toBe(before);
  });
});
