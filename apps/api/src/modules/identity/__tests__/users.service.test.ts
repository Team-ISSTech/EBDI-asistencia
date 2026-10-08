import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../common/auth/auth-context';
import { UsersService } from '../services/users.service';
import { docenteRecord, FakeHasher, InMemoryUsers, RecordingAudit, request } from './in-memory';

const adminAuth: AuthContext = {
  sessionId: 1,
  userId: 100,
  principal: { userId: 100, assignments: [{ role: 'ADMIN_CENTRAL', estanciaId: null }] },
  activeEstanciaId: null,
};

const newUser = {
  name: 'Nueva',
  email: 'nueva@sirai.test',
  temporaryPassword: 'Temporal-2026',
  assignments: [{ role: 'DOCENTE' as const, estanciaId: 1 }],
};

describe('UsersService', () => {
  let users: InMemoryUsers;
  let audit: RecordingAudit;
  let service: UsersService;

  beforeEach(() => {
    users = new InMemoryUsers();
    audit = new RecordingAudit();
    service = new UsersService(users, new FakeHasher(), audit.asService());
  });

  it('crea un usuario con contraseña hasheada, asignaciones y auditoría con el rol del actor', async () => {
    const created = await service.create(adminAuth, newUser, request);
    expect(created.assignments).toEqual([{ role: 'DOCENTE', estanciaId: 1 }]);
    expect(users.rows.get(created.id)?.passwordHash).toBe('hash:Temporal-2026');
    expect(audit.entries[0]).toMatchObject({ action: 'USUARIO_CREADO', recordId: String(created.id), roleCode: 'ADMIN_CENTRAL' });
    expect(audit.transactional).toBe(1);
  });

  it('un administrador no puede quitarse su propio rol central', async () => {
    users.seed({ ...docenteRecord({ email: 'admin@sirai.test' }), id: adminAuth.userId, assignments: [{ role: 'ADMIN_CENTRAL', estanciaId: null, estanciaName: null }] });
    await expect(
      service.replaceRoles(adminAuth, adminAuth.userId, { assignments: [{ role: 'DOCENTE', estanciaId: 1 }] }, request),
    ).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
    expect(audit.entries).toHaveLength(0);
  });

  it('listar usuarios se audita como lectura de datos personales', async () => {
    users.seed(docenteRecord());
    await service.list(adminAuth, request);
    expect(audit.entries[0]).toMatchObject({ action: 'USUARIOS_CONSULTADOS', userId: adminAuth.userId });
  });

  it('propaga CONFLICTO del repositorio ante correos duplicados', async () => {
    users.seed(docenteRecord({ email: 'nueva@sirai.test' }));
    await expect(service.create(adminAuth, newUser, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    expect(audit.entries).toHaveLength(0);
  });

  it('lista a todos los usuarios con sus asignaciones', async () => {
    users.seed(docenteRecord({ email: 'a@sirai.test' }));
    users.seed(docenteRecord({ email: 'b@sirai.test', assignments: [{ role: 'DOCENTE', estanciaId: 2, estanciaName: 'E2' }] }));
    const listed = await service.list(adminAuth, request);
    expect(listed.map((u) => u.email)).toEqual(['a@sirai.test', 'b@sirai.test']);
    expect(listed[1]?.assignments).toEqual([{ role: 'DOCENTE', estanciaId: 2 }]);
  });

  it('reemplaza roles y audita el antes y el después', async () => {
    const target = users.seed(docenteRecord());
    const updated = await service.replaceRoles(adminAuth, target.id, { assignments: [{ role: 'DIRECTORA', estanciaId: 1 }] }, request);
    expect(updated.assignments).toEqual([{ role: 'DIRECTORA', estanciaId: 1 }]);
    const entry = audit.entries[0];
    expect(entry?.action).toBe('ROLES_REEMPLAZADOS');
    expect(entry?.before).toMatchObject({ assignments: [{ role: 'DOCENTE', estanciaId: 1 }] });
    expect(entry?.after).toMatchObject({ assignments: [{ role: 'DIRECTORA', estanciaId: 1 }] });
  });

  it('responde NO_ENCONTRADO para un usuario inexistente', async () => {
    await expect(service.replaceRoles(adminAuth, 999, { assignments: [] }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });
});
