import { randomUUID } from 'node:crypto';
import { type Account, LoadClient } from './client';
import { mapLimit } from './concurrency';
import { LOAD_PASSWORD, loadEmail } from './naming';
import { evaluate, formatReport } from './report';

/**
 * Prueba de carga de RNF-08: las 212 estancias trabajan a la vez, como a las 08:00 (todas abren la jornada, pasan
 * lista y consultan la bandeja al mismo tiempo), más las tablets que reconectan juntas y la consulta del tablero
 * central. Requiere la API levantada contra la base que dejó `load:seed` y `LOGIN_RATE_LIMIT_PER_MINUTE` alto.
 */
const API_URL = process.env['LOAD_API_URL'] ?? 'http://localhost:3000';
const ESTANCIAS = Number(process.env['LOAD_ESTANCIAS'] ?? 212);
const ROUNDS = Number(process.env['LOAD_ROUNDS'] ?? 5);
const LIMIT_MS = Number(process.env['LOAD_P95_MS'] ?? 1500);
const SHIFT = 'MATUTINO';
const LOGIN_CONCURRENCY = Number(process.env['LOAD_LOGIN_CONCURRENCY'] ?? 20);
const today = new Date().toLocaleDateString('en-CA');

/** Operaciones de asistencia y seguimiento que RNF-08 exige bajo el límite. */
const GATED = ['abrir jornada', 'lista de asistencia', 'guardar asistencia', 'sincronizar capturas', 'bandeja de seguimientos', 'registrar llamada', 'notas del seguimiento'];

interface Team {
  readonly directora: Account;
  readonly docente: Account;
  readonly social: Account;
}

interface Roster {
  readonly entries: ReadonlyArray<{ enrollmentId: number }>;
}
interface Inbox {
  readonly followUps: ReadonlyArray<{ id: number }>;
}

async function loginTeam(client: LoadClient, estancia: number): Promise<Team> {
  const [directora, docente, social] = await Promise.all(['DIRECTORA', 'DOCENTE', 'TRABAJO_SOCIAL'].map((role) => client.login('inicio de sesión', loadEmail(role, estancia), LOAD_PASSWORD)));
  if (!directora || !docente || !social) throw new Error('Faltan cuentas.');
  return { directora, docente, social };
}

/** Lo que hace una estancia en la mañana: abre la jornada, pasa lista y la revisa. */
async function morning(client: LoadClient, team: Team): Promise<{ journeyId: number; enrollmentIds: number[] } | null> {
  const opened = (await client.call('abrir jornada', 'POST', '/asistencia/jornadas', team.directora.cookie, { date: today, shift: SHIFT })) as { id: number } | null;
  if (!opened) return null;
  const roster = (await client.call('lista de asistencia', 'GET', `/asistencia/jornadas/${opened.id}/lista`, team.docente.cookie)) as Roster | null;
  const enrollmentIds = roster?.entries.map((entry) => entry.enrollmentId) ?? [];
  await client.call('guardar asistencia', 'POST', `/asistencia/jornadas/${opened.id}/registros`, team.docente.cookie, { marks: enrollmentIds.map((enrollmentId) => ({ enrollmentId, status: 'PRESENTE', clientId: randomUUID() })) });
  return { journeyId: opened.id, enrollmentIds };
}

/** Una tablet que estuvo sin conexión y manda lo capturado al reconectar. */
async function reconnect(client: LoadClient, team: Team, journey: { journeyId: number; enrollmentIds: number[] }): Promise<void> {
  const marks = journey.enrollmentIds.slice(0, 3).map((enrollmentId) => ({ enrollmentId, status: 'AUSENTE_JUSTIFICADO', clientId: randomUUID() }));
  const operation = { operationId: randomUUID(), type: 'ATTENDANCE_MARKS', capturedAt: new Date(Date.now() - 60_000).toISOString(), payload: { journeyId: journey.journeyId, marks } };
  await client.call('sincronizar capturas', 'POST', '/sincronizacion', team.docente.cookie, { operations: [operation] });
}

/** Trabajo social atiende la bandeja: la ve, llama y revisa las notas. */
async function followUpWork(client: LoadClient, team: Team, round: number): Promise<void> {
  const inbox = (await client.call('bandeja de seguimientos', 'GET', '/seguimientos', team.social.cookie)) as Inbox | null;
  const ticket = inbox?.followUps[round % Math.max(1, inbox.followUps.length)];
  if (!ticket) return;
  await client.call('registrar llamada', 'POST', `/seguimientos/${ticket.id}/contactos`, team.social.cookie, { result: 'SIN_RESPUESTA' });
  await client.call('notas del seguimiento', 'GET', `/seguimientos/${ticket.id}/contactos`, team.social.cookie);
}

async function estanciaDay(client: LoadClient, team: Team): Promise<void> {
  const journey = await morning(client, team);
  if (!journey) return;
  await reconnect(client, team, journey);
  for (let round = 0; round < ROUNDS; round += 1) {
    await Promise.all([
      client.call('lista de asistencia', 'GET', `/asistencia/jornadas/${journey.journeyId}/lista`, team.directora.cookie),
      followUpWork(client, team, round),
    ]);
  }
}

async function dashboardLoad(client: LoadClient): Promise<void> {
  const supervisor = await client.login('inicio de sesión', 'supervisor_central@sirai.test', LOAD_PASSWORD);
  for (let round = 0; round < ROUNDS; round += 1) await client.call('tablero central', 'GET', `/reportes/tablero?date=${today}`, supervisor.cookie);
}

async function main(): Promise<void> {
  const client = new LoadClient(API_URL);
  // Nadie inicia sesión los 636 a la vez: se escalonan; el inicio de sesión se reporta aparte y no entra al veredicto.
  const teams = await mapLimit(Array.from({ length: ESTANCIAS }, (_, index) => index + 1), LOGIN_CONCURRENCY, (estancia) => loginTeam(client, estancia));
  const started = Date.now();
  await Promise.all([...teams.map((team) => estanciaDay(client, team)), dashboardLoad(client)]);
  const rows = client.report();
  const verdict = evaluate(rows, GATED, LIMIT_MS);
  process.stdout.write(`${formatReport(rows, GATED, LIMIT_MS)}\n\n${ESTANCIAS} estancias simultáneas, ${ROUNDS} rondas, ${Math.round((Date.now() - started) / 1000)} s en total.\n`);
  process.stdout.write(verdict.pass ? 'RESULTADO: cumple RNF-08.\n' : `RESULTADO: NO cumple RNF-08.\n${verdict.failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exitCode = verdict.pass ? 0 : 1;
}

void main();
