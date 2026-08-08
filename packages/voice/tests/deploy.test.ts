import { deployAgents } from '../src/deploy';

function fakeClient(existing: Array<{ name: string; agentId: string }>) {
  const created: any[] = [];
  const updated: any[] = [];
  return {
    created, updated,
    conversationalAi: {
      agents: {
        list: async () => ({ agents: existing }),
        create: async (a: any) => { const agentId = 'new_' + created.length; created.push(a); return { agentId }; },
        update: async (id: string, a: any) => { updated.push({ id, a }); return { agentId: id }; },
      },
    },
  } as any;
}

test('creates both agents when none exist', async () => {
  const c = fakeClient([]);
  const ids = await deployAgents(c, 'https://api.example.com');
  expect(c.created).toHaveLength(2);
  expect(ids.guided).toBeDefined();
  expect(ids.realistic).toBeDefined();
});

test('updates in place when agents already exist (idempotent)', async () => {
  const c = fakeClient([
    { name: 'FreshCase — Alex (guided)', agentId: 'g1' },
    { name: 'FreshCase — Alex (realistic)', agentId: 'r1' },
  ]);
  await deployAgents(c, 'https://api.example.com');
  expect(c.created).toHaveLength(0);
  expect(c.updated.map((u: any) => u.id).sort()).toEqual(['g1', 'r1']);
});
