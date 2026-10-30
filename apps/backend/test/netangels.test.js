const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AxiosError } = require('axios');
const { NetangelsConnector } = require('../dist/connectors/netangels/netangels.connector');
const { mapNetangelsVm } = require('../dist/connectors/netangels/netangels.mapper');

const vm = (id = 1) => ({
  id,
  uid: `vm_test${id}`,
  name: `Test ${id}`,
  tariff: 'optima_1',
  state: 'Active',
  main_ip: '192.0.2.1',
  disk: { size: 10, is_backup_enabled: false },
});
const price = (id = 1) => ({
  vm_name: `vm_test${id}`,
  full_month_price: 551.23,
  full_hour_price: 0.7656,
});
const signal = () => new AbortController().signal;
function stub(handler, authHandler) {
  const c = new NetangelsConnector('test-api-key');
  let authCalls = 0;
  const response = (config, data) => ({ status: 200, statusText: 'OK', headers: {}, config, data });
  c.authHttp.defaults.adapter = async (config) => {
    authCalls++;
    assert.equal(config.url, '/api/gateway/token/');
    assert.equal(config.data, 'api_key=test-api-key');
    assert.ok(config.signal);
    return response(
      config,
      authHandler ? await authHandler(config, authCalls) : { token: `bearer-${authCalls}` },
    );
  };
  c.http.defaults.adapter = async (config) => {
    assert.ok(config.headers.Authorization.startsWith('Bearer bearer-'));
    assert.ok(config.signal);
    return response(config, await handler(config));
  };
  return { c, authCalls: () => authCalls };
}

test('balance and multi-page VM sync share one gateway token and join prices by UID', async () => {
  const { c, authCalls } = stub((config) => {
    if (config.url === '/account/info/') return { balance: '-12.34', login: 'not persisted' };
    if (config.url === '/cloud/vms/calculation/') return { entities: [price(2), price(1)] };
    assert.equal(config.params.limit, 100);
    return { count: 2, entities: [vm(config.params.offset + 1)] };
  });
  const [account, services] = await Promise.all([
    c.fetchAccount(signal()),
    c.fetchServices(signal()),
  ]);
  assert.equal(authCalls(), 1);
  assert.equal(account.balance.toFixed(2), '-12.34');
  assert.equal(account.currency, 'RUB');
  assert.equal(services.length, 2);
  assert.equal(services[1].externalId, '2');
  assert.equal(services[0].cost.toFixed(2), '551.23');
  assert.equal(services[0].nextBilling, null);
  assert.equal(services[0].meta._tariff.priceHourly, 0.7656);
  assert.ok(!JSON.stringify(services).includes('bearer'));
});

test('expired token is renewed once; subsequent 401 is sanitized', async () => {
  let calls = 0;
  const { c, authCalls } = stub((config) => {
    calls++;
    if (calls === 1)
      throw new AxiosError('sensitive body', 'ERR_BAD_REQUEST', config, null, { status: 401 });
    return { balance: '0' };
  });
  assert.equal((await c.fetchAccount(signal())).balance.toString(), '0');
  assert.equal(authCalls(), 2);
  const bad = stub((config) => {
    throw new AxiosError('test-api-key', 'ERR_BAD_REQUEST', config, null, { status: 401 });
  });
  await assert.rejects(bad.c.fetchAccount(signal()), {
    message: 'NetAngels: API request failed (HTTP 401)',
  });
  assert.equal(bad.authCalls(), 2);
});

test('gateway errors never expose key, request config or response data', async () => {
  const { c } = stub(
    () => {},
    (config) => {
      throw new AxiosError('test-api-key', 'ERR_BAD_REQUEST', config, null, {
        status: 403,
        data: 'secret',
      });
    },
  );
  await assert.rejects(c.fetchAccount(signal()), (error) => {
    assert.equal(error.message, 'NetAngels: authentication failed (HTTP 403)');
    assert.equal(error.config, undefined);
    return true;
  });
});

test('empty list succeeds without requesting calculations', async () => {
  const { c } = stub((config) => {
    assert.equal(config.url, '/cloud/vms/');
    return { count: 0, entities: [] };
  });
  assert.deepEqual(await c.fetchServices(signal()), []);
});

test('duplicate or truncated pages fail instead of returning partial inventory', async () => {
  for (const entities of [[vm()], []]) {
    let calls = 0;
    const { c } = stub(() => ({ count: 2, entities: calls++ === 0 ? [vm()] : entities }));
    await assert.rejects(c.fetchServices(signal()), /NetAngels: (duplicate VM|incomplete VM)/);
  }
});

test('missing and malformed prices fail instead of creating zero-cost services', async () => {
  for (const rows of [
    [],
    [{ ...price(), full_month_price: 'bad' }],
    [{ ...price(), full_month_price: -1 }],
  ]) {
    const { c } = stub((config) =>
      config.url === '/cloud/vms/' ? { count: 1, entities: [vm()] } : { entities: rows },
    );
    await assert.rejects(c.fetchServices(signal()), /NetAngels:/);
  }
});

test('invalid VM envelope and invalid balance fail closed', async () => {
  const { c } = stub(() => ({}));
  await assert.rejects(c.fetchServices(signal()), /invalid VM list/);
  await assert.rejects(c.fetchAccount(signal()), /invalid account/);
});

test('stopped VMs remain billable; deleted VMs are excluded', async () => {
  const { c } = stub((config) =>
    config.url === '/cloud/vms/'
      ? {
          count: 2,
          entities: [
            { ...vm(), state: 'Stopped' },
            { ...vm(2), deleted: '2026-01-01' },
          ],
        }
      : { entities: [price()] },
  );
  const rows = await c.fetchServices(signal());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cost.toString(), '551.23');
  assert.equal(rows[0].meta.state, 'Stopped');
});

test('prepaid packet uses full monthly tariff and metadata uses an allowlist', () => {
  const row = mapNetangelsVm(
    { ...vm(), name: '', password: 'never-store' },
    {
      ...price(),
      month_price: 0,
      packet: { secret: 'never-store' },
    },
  );
  assert.equal(row.name, vm().uid);
  assert.equal(row.cost.toString(), '551.23');
  assert.equal(row.meta._tariff.prepaidPacket, true);
  assert.ok(!JSON.stringify(row).includes('never-store'));
});

test('aborted requests do not proceed to provider reads', async () => {
  const controller = new AbortController();
  controller.abort();
  const { c, authCalls } = stub(() => assert.fail('API must not be reached'));
  await assert.rejects(c.fetchAccount(controller.signal));
  assert.equal(authCalls(), 0);
});

test('imports all payment months with stable IDs and never copies payment tokens', async () => {
  const { c } = stub((config) => {
    if (config.url.endsWith('/months/')) return { entities: ['2026-10', '2026-09'] };
    const october = config.url.includes('2026-10-01');
    assert.ok(october || config.url.includes('2026-09-01'));
    return {
      payments: [
        {
          id: october ? 42 : 41,
          amount: october ? 210 : -10,
          event_date: october ? '2026-10-27' : '2026-09-01',
          token: 'never-store',
          login: 'private',
        },
      ],
    };
  });
  const first = await c.fetchPayments(signal());
  const second = await c.fetchPayments(signal());
  assert.deepEqual(
    first.map((x) => x.externalId),
    ['payment:42', 'payment:41'],
  );
  assert.deepEqual(first, second);
  assert.equal(first[1].amount.toFixed(2), '-10.00');
  assert.equal(first[0].date.toISOString(), '2026-10-27T00:00:00.000Z');
  assert.equal(first[0].type, 'topup');
  assert.ok(!JSON.stringify(first).includes('never-store'));
  assert.ok(!JSON.stringify(first).includes('private'));
});

test('payment sync rejects malformed month lists, invalid dates and duplicate IDs', async () => {
  const bad = stub(() => ({ entities: ['2026-13'] }));
  await assert.rejects(bad.c.fetchPayments(signal()), /invalid payment months/);
  for (const payments of [
    [{ id: 1, amount: 1, event_date: '2026-02-31' }],
    [{ id: 1, amount: 1, event_date: '2026-03-01' }],
    [
      { id: 1, amount: 1, event_date: '2026-02-01' },
      { id: 1, amount: 1, event_date: '2026-02-01' },
    ],
  ]) {
    const { c } = stub((config) =>
      config.url.endsWith('/months/') ? { entities: ['2026-02'] } : { payments },
    );
    await assert.rejects(c.fetchPayments(signal()), /NetAngels:/);
  }
});
