import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type DashboardResponse, dashboardResponseSchema } from '@sirai/contracts';
import { applyMigrations, connect, dropAllObjects, seedDevelopmentData, syncRolePermissions } from '@sirai/db';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const SEED_PASSWORD = 'contrasena-de-prueba';
const DIRECTORA = 'directora@sirai.test';
const SUPERVISOR = 'supervisor_central@sirai.test';
const ADMIN = 'admin_central@sirai.test';
const MS_PER_DAY = 86_400_000;
const today = new Date().toISOString().slice(0, 10);
const recentBirthDate = new Date(Date.now() - 180 * MS_PER_DAY).toISOString().slice(0, 10);
const NATIONAL_ESTANCIAS = 212;

/** Tablero semaforizado y su alcance por rol, contra MySQL real. */
describe.skipIf(!TEST_DATABASE_URL)('tablero de asistencia (integración)', () => {
  let app: INestApplication;
  let connection: ReturnType<typeof connect>;

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

  /** Valida la respuesta contra el contrato; los casos de error se prueban con `call` directamente. */
  const dashboard = async (email: string, date = today): Promise<{ status: number; body: DashboardResponse }> => {
    const response = await call('get', `/reportes/tablero?date=${date}`, email);
    return { status: response.status, body: dashboardResponseSchema.parse(response.body) };
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
    await connection.db.execute(sql`UPDATE estancias SET region = 'Norte' WHERE clave_ebdi = 'EBDI-TEST-01'`);
    await connection.db.execute(sql`UPDATE estancias SET region = 'Sur' WHERE clave_ebdi = 'EBDI-TEST-02'`);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const [rooms] = (await connection.db.execute(sql`SELECT id FROM salas_grupos WHERE turno = 'MATUTINO' ORDER BY id LIMIT 1`)) as unknown as [{ id: number }[]];
    for (const n of [1, 2, 3, 4]) {
      await call('post', '/infantes', DIRECTORA, { enrollmentNumber: `M-TAB-${n}`, name: `Infante${n}`, paternalSurname: 'Prueba', birthDate: recentBirthDate, roomId: rooms[0]?.id });
    }
    const [enrollments] = (await connection.db.execute(sql`SELECT id FROM inscripciones ORDER BY id`)) as unknown as [{ id: number }[]];
    const journey = await call('post', '/asistencia/jornadas', DIRECTORA, { date: today, shift: 'MATUTINO' });
    const statuses = ['PRESENTE', 'PRESENTE', 'PRESENTE', 'FALTA_INJUSTIFICADA'];
    await call('post', `/asistencia/jornadas/${journey.body.id}/registros`, 'docente@sirai.test', {
      marks: enrollments.map((row, index) => ({ enrollmentId: row.id, status: statuses[index], clientId: randomUUID() })),
    });
  });

  afterAll(async () => {
    await app?.close();
    await connection?.close();
  });

  it('el administrador central ve todas las estancias con su semáforo', async () => {
    const { status, body } = await dashboard(ADMIN);
    expect(status).toBe(200);
    expect(body.estancias).toHaveLength(2);
    const captured = body.estancias.find((row) => row.code === 'EBDI-TEST-01');
    expect(captured).toMatchObject({ enrolled: 4, present: 3, absent: 1, other: 0, pending: 0, rate: 0.75, light: 'AMARILLO', region: 'Norte' });
    expect(body.estancias.find((row) => row.code === 'EBDI-TEST-02')).toMatchObject({ light: 'SIN_CAPTURA', rate: null, enrolled: 0 });
    expect(body.totals).toMatchObject({ estancias: 2, enrolled: 4, present: 3, rate: 0.75, lights: { VERDE: 0, AMARILLO: 1, ROJO: 0, SIN_CAPTURA: 1 } });
  });

  it('un día sin jornadas deja todas las estancias SIN_CAPTURA', async () => {
    const { body } = await dashboard(ADMIN, '2020-01-01');
    expect(body.estancias.every((row) => row.light === 'SIN_CAPTURA')).toBe(true);
    expect(body.totals.rate).toBeNull();
  });

  it('el tablero no trae nada identificable de infantes ni tutores (RF-18)', async () => {
    const response = await call('get', `/reportes/tablero?date=${today}`, ADMIN);
    expect(JSON.stringify(response.body)).not.toMatch(/Infante\d|M-TAB|curp|telefono|phone|matricula/i);
  });

  it('la directora solo ve su estancia', async () => {
    const { body } = await dashboard(DIRECTORA);
    expect(body.estancias.map((row) => row.code)).toEqual(['EBDI-TEST-01']);
  });

  it('un supervisor sin región ve todo y, con región, solo esa región', async () => {
    expect((await dashboard(SUPERVISOR)).body.estancias).toHaveLength(2);
    await connection.db.execute(sql`UPDATE usuario_rol SET region = 'Sur' WHERE usuario_id = (SELECT id FROM usuarios WHERE correo = ${SUPERVISOR})`);
    expect((await dashboard(SUPERVISOR)).body.estancias.map((row) => row.code)).toEqual(['EBDI-TEST-02']);
    await connection.db.execute(sql`UPDATE usuario_rol SET region = 'Norte' WHERE usuario_id = (SELECT id FROM usuarios WHERE correo = ${SUPERVISOR})`);
    expect((await dashboard(SUPERVISOR)).body.estancias.map((row) => row.code)).toEqual(['EBDI-TEST-01']);
  });

  it('la docente, trabajo social y el médico no ven el tablero', async () => {
    for (const email of ['docente@sirai.test', 'trabajo_social@sirai.test', 'medico@sirai.test']) {
      expect((await call('get', `/reportes/tablero?date=${today}`, email)).status).toBe(403);
    }
  });

  it('rechaza una fecha inválida o ausente', async () => {
    expect((await call('get', '/reportes/tablero?date=15-10-2026', ADMIN)).status).toBe(400);
    expect((await call('get', '/reportes/tablero', ADMIN)).status).toBe(400);
  });

  it('responde en menos de 1.5 s con las 212 estancias (RNF-08)', async () => {
    const values = Array.from({ length: NATIONAL_ESTANCIAS }, (_, i) => `('EBDI-NAC-${String(i + 1).padStart(3, '0')}', 'Estancia nacional ${i + 1}', 'Region ${i % 8}')`).join(',');
    await connection.db.execute(sql.raw(`INSERT INTO estancias (clave_ebdi, nombre, region) VALUES ${values}`));
    const cookie = await cookieFor(ADMIN);
    const started = Date.now();
    const response = await request(app.getHttpServer()).get(`/reportes/tablero?date=${today}`).set('Cookie', cookie);
    const elapsed = Date.now() - started;
    expect(response.status).toBe(200);
    expect(dashboardResponseSchema.parse(response.body).estancias.length).toBeGreaterThanOrEqual(NATIONAL_ESTANCIAS);
    expect(elapsed).toBeLessThan(1500);
  });

  describe('exportación (RF-17)', () => {
    const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    /** Descarga un archivo binario con la cookie ya resuelta. */
    const download = async (email: string, query: string): Promise<request.Response> => {
      const cookie = await cookieFor(email);
      return request(app.getHttpServer())
        .get(`/reportes/exportacion?${query}`)
        .set('Cookie', cookie)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });
    };

    const summaryOf = async (buffer: Buffer): Promise<unknown[][]> => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      const rows: unknown[][] = [];
      workbook.getWorksheet('Resumen')?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      return rows;
    };

    it('el administrador descarga el corte mensual en Excel con las cifras de la estancia', async () => {
      const response = await download(ADMIN, `period=MONTH&date=${today}&format=xlsx`);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain(XLSX);
      expect(response.headers['content-disposition']).toMatch(/attachment; filename="sirai-asistencia-mensual-\d{4}-\d{2}-01_\d{4}-\d{2}-\d{2}\.xlsx"/);
      const rows = await summaryOf(response.body as Buffer);
      expect(rows.find((row) => row[0] === 'EBDI-TEST-01')).toMatchObject([ 'EBDI-TEST-01', 'Estancia de prueba 01', 'Norte', 1, 4, 3, 1, 0, 0.75, 'Amarillo' ]);
      expect(rows.find((row) => row[0] === 'EBDI-TEST-02')?.[9]).toBe('Sin captura');
    });

    it('descarga el corte diario y el trimestral en PDF', async () => {
      for (const period of ['DAY', 'QUARTER']) {
        const response = await download(ADMIN, `period=${period}&date=${today}&format=pdf`);
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('application/pdf');
        expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      }
    });

    it('el archivo no contiene nombres ni datos de infantes (RF-18)', async () => {
      const xlsx = await download(ADMIN, `period=DAY&date=${today}&format=xlsx`);
      const pdf = await download(ADMIN, `period=DAY&date=${today}&format=pdf`);
      for (const file of [xlsx.body as Buffer, pdf.body as Buffer]) {
        expect(file.toString('latin1')).not.toMatch(/Infante\d|M-TAB|curp/i);
      }
      expect(JSON.stringify(await summaryOf(xlsx.body as Buffer))).not.toMatch(/Infante|M-TAB/);
    });

    it('un supervisor con región solo recibe su región', async () => {
      const rows = await summaryOf((await download(SUPERVISOR, `period=DAY&date=${today}&format=xlsx`)).body as Buffer);
      const codes = rows.map((row) => String(row[0]));
      expect(codes).toContain('EBDI-TEST-01');
      expect(codes).not.toContain('EBDI-TEST-02');
    });

    it('la directora recibe solo su estancia', async () => {
      const rows = await summaryOf((await download(DIRECTORA, `period=DAY&date=${today}&format=xlsx`)).body as Buffer);
      const codes = rows.map((row) => String(row[0])).filter((code) => code.startsWith('EBDI-'));
      expect(codes).toEqual(['EBDI-TEST-01']);
    });

    it('audita cada exportación', async () => {
      const [rows] = (await connection.db.execute(sql`SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'REPORTE_EXPORTADO'`)) as unknown as [{ n: number }[]];
      expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(5);
    });

    it('la docente y el médico no exportan, y los parámetros inválidos se rechazan', async () => {
      for (const email of ['docente@sirai.test', 'medico@sirai.test']) {
        expect((await download(email, `period=DAY&date=${today}&format=pdf`)).status).toBe(403);
      }
      expect((await download(ADMIN, `period=YEAR&date=${today}&format=pdf`)).status).toBe(400);
      expect((await download(ADMIN, `period=DAY&date=${today}&format=csv`)).status).toBe(400);
      expect((await download(ADMIN, 'period=DAY&format=pdf')).status).toBe(400);
    });
  });
});
