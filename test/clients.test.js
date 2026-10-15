import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCloudClient } from '../src/awair/cloud.js';
import { createLocalClient } from '../src/awair/local.js';
import {
  createElement,
  createFakeCloud,
  createFakeNetwork,
  createOmni,
  fixture,
} from './helpers/fakeAwair.js';

const TOKEN = 'fake-token-not-a-real-one';

test('local client: settings and latest readings of an Element', async () => {
  const network = createFakeNetwork({ '192.0.2.5': createElement() });
  const client = createLocalClient({ fetch: network.fetch });
  assert.equal((await client.settings('192.0.2.5')).uuid, 'awair-element_24947');
  assert.equal((await client.latest('192.0.2.5')).values.co2, 426);
});

test('local client: the Omni backplate answers JSON as text/html', async () => {
  const network = createFakeNetwork({ '192.0.2.6': createOmni() });
  const client = createLocalClient({ fetch: network.fetch });
  assert.deepEqual((await client.settings('192.0.2.6')).power, { battery: 99, plugged: true });
  assert.equal((await client.latest('192.0.2.6')).values.noise, 52);
});

test('local client: newer Omni firmwares serve the settings under /settings/data', async () => {
  const omni = createOmni();
  omni.settingsPath = '/settings/data';
  const client = createLocalClient({ fetch: createFakeNetwork({ '192.0.2.6': omni }).fetch });
  assert.equal((await client.settings('192.0.2.6')).uuid, 'awair-omni_18959');
  assert.deepEqual(omni.requests, ['/settings/config/data', '/settings/data']);
});

test('local client: errors say what happened, by kind', async () => {
  const element = createElement();
  const client = createLocalClient({ fetch: createFakeNetwork({ '192.0.2.5': element }).fetch });
  await assert.rejects(client.latest('192.0.2.99'), { kind: 'unreachable' });

  element.settingsPath = '/nowhere';
  await assert.rejects(client.settings('192.0.2.5'), {
    kind: 'http',
    message: /no Awair settings page/,
  });

  element.latest = { hello: 'world' };
  await assert.rejects(client.latest('192.0.2.5'), { kind: 'invalid' });

  const html = createFakeNetwork();
  html.fetch = async () => new Response('<html>router login</html>', { status: 200 });
  await assert.rejects(createLocalClient({ fetch: html.fetch }).latest('192.0.2.1'), {
    kind: 'invalid',
  });
});

test('cloud client: quota, devices and readings', async () => {
  const cloud = createFakeCloud({
    token: TOKEN,
    latest: { awair_24950: fixture('cloud-latest-awair') },
  });
  const client = createCloudClient({ fetch: createFakeNetwork({}, cloud).fetch });
  assert.deepEqual(await client.quota(TOKEN), {
    tier: 'Hobbyist',
    latestPerDay: 300,
    latestUsedToday: 12,
  });
  const devices = await client.devices(TOKEN);
  assert.deepEqual(
    devices.map((device) => [device.uuid, device.name]),
    [
      ['awair_24950', 'Living Room'],
      ['awair-glow_24951', 'Bedroom'],
      ['awair-element_24947', 'Office'],
    ],
  );
  assert.equal((await client.latest(TOKEN, devices[0])).values.dust, 14.3);
  assert.equal(await client.latest(TOKEN, devices[1]), null);
  assert.ok(cloud.requests.includes('/v1/users/self/devices/awair/24950/air-data/latest'));
});

test('cloud client: a refused token and an exhausted quota, the token never in the message', async () => {
  const cloud = createFakeCloud({ token: TOKEN });
  const client = createCloudClient({ fetch: createFakeNetwork({}, cloud).fetch });
  const refused = await client.devices('wrong-token-123').catch((err) => err);
  assert.equal(refused.kind, 'auth');
  assert.doesNotMatch(refused.message, /wrong-token-123/);

  cloud.quotaExceeded = true;
  await assert.rejects(client.devices(TOKEN), { kind: 'quota' });

  cloud.down = true;
  const down = await client.devices(TOKEN).catch((err) => err);
  assert.equal(down.kind, 'unreachable');
  assert.doesNotMatch(down.message, new RegExp(TOKEN));
});
