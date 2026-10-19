import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../common/auth/auth-context';
import { UsersService } from '../services/users.service';
import { docenteRecord, FakeHasher, InMemoryUsers, RecordingAudit, request, testEnv } from './in-memory';

const adminAuth: AuthContext = {
  sessionId: 1,
  userId: 100,
  principal: { userId: 100, assignments: [{ role: 'ADMIN_CENTRAL', estanciaId: null }] },
  activeEstanciaId: null,
};

const adminRecord = (email: string, id: number) => ({
  ...docenteRecord({ email, assignments: [{ role: 'ADMIN_CENTRAL', estanciaId: null, estanciaName: null }] }),
  id,
});

describe('baja de usuarios (RNF-04)', () => {
  let users: InMemoryUsers;
  let audit: RecordingAudit;
  let service: UsersService;

  beforeEach(() => {
    users = new InMemoryUsers();
    audit = new RecordingAudit();
    service = new UsersService(users, new FakeHasher(), audit.asService(), testEnv);
    users.seed(adminRecord('admin@sirai.test', adminAuth.userId));
  });

  it('da de baja con borrado lógico atribuido a quien lo hace, y lo audita en la misma transacción', async () => {
    const target = users.seed(docenteRecord());
    await service.retire(adminAuth, target.id, request);
    expect(users.retired).toEqual([{ userId: target.id, byUserId: 100 }]);
    expect(audit.entries[0]).toMatchObject({ action: 'USUARIO_DADO_DE_BAJA', recordId: String(target.id), userId: 100, roleCode: 'ADMIN_CENTRAL' });
    expect(audit.transactional).toBe(1);
  });

  it('un usuario inexistente o ya dado de baja responde NO_ENCONTRADO', async () => {
    await expect(service.retire(adminAuth, 999, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    const target = users.seed(docenteRecord());
    await service.retire(adminAuth, target.id, request);
    await expect(service.retire(adminAuth, target.id, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });

  it('nadie puede darse de baja a sí mismo', async () => {
    await expect(service.retire(adminAuth, adminAuth.userId, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
    expect(users.retired).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });
});
