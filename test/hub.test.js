import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEARTBEAT_MS, TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import { createElement, createFakeCloud, fixture } from './helpers/fakeAwair.js';
import {
  ELEMENT_UUID,
  OMNI_UUID,
  addAllDevices,
  createWorld,
  deviceId,
  featureId,
} from './helpers/world.js';

const TOKEN = 'fake-token';

function clock(start = Date.parse('2026-10-15T08:00:00Z')) {
  let time = start;
  const now = () => time;
  now.advance = (ms) => {
    time += ms;
  };
  return now;
}

test('mDNS finds the sensors; nothing is read before the user adds them', async () => {
  const { gladys, network } = await createWorld();
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.external_id),
    [deviceId(ELEMENT_UUID), deviceId(OMNI_UUID)],
  );
  assert.deepEqual(gladys.fake.scans, [{ type: 'mdns', timeout_seconds: 5 }]);
  assert.equal(gladys.fake.states.length, 0);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  // Discovery read each sensor once (settings + latest), nothing more.
  assert.deepEqual(network.sensors['192.0.2.5'].requests, [
    '/settings/config/data',
    '/air-data/latest',
  ]);
});

test('adding a device publishes all its states at once, the risk band included', async () => {
  const { gladys } = await createWorld();
  await addAllDevices(gladys);
  assert.equal(gladys.fake.lastState(featureId(ELEMENT_UUID, 'score')), 94);
  assert.equal(gladys.fake.lastState(featureId(ELEMENT_UUID, 'air_quality')), 0);
  assert.equal(gladys.fake.lastState(featureId(ELEMENT_UUID, 'co2')), 426);
  assert.equal(gladys.fake.lastState(featureId(OMNI_UUID, 'battery')), 99);
  assert.equal(gladys.fake.lastState(featureId(OMNI_UUID, 'plugged')), 1);
  assert.equal(gladys.fake.lastState(featureId(OMNI_UUID, 'illuminance')), 0);
  assert.ok(gladys.fake.widgetRefreshes.includes(WIDGET_KEY));
});

test('only the changes are published, and an unchanged value again after the heartbeat', async (t) => {
  // The SDK dates its heartbeat with Date.now: the mocked clock drives both.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-15T08:00:00Z') });
  const now = () => Date.now();
  now.advance = (ms) => t.mock.timers.tick(ms);
  const { gladys, hub, network } = await createWorld({ now });
  await addAllDevices(gladys);
  const published = gladys.fake.states.length;

  now.advance(30000);
  await hub.tick();
  assert.equal(gladys.fake.states.length, published, 'nothing changed, nothing sent');

  network.sensors['192.0.2.5'].latest.co2 = 900;
  network.sensors['192.0.2.5'].latest.score = 70;
  now.advance(30000);
  await hub.tick();
  const sent = gladys.fake.states.slice(published).map((s) => s.device_feature_external_id);
  assert.deepEqual(sent.sort(), [
    featureId(ELEMENT_UUID, 'air_quality'),
    featureId(ELEMENT_UUID, 'co2'),
    featureId(ELEMENT_UUID, 'score'),
  ]);
  assert.equal(gladys.fake.lastState(featureId(ELEMENT_UUID, 'air_quality')), 1);

  const before = gladys.fake.states.length;
  now.advance(HEARTBEAT_MS);
  await hub.tick();
  assert.ok(gladys.fake.states.length - before >= 18, 'every value re-sent after the heartbeat');
});

test('the timer respects the configured pace', async () => {
  const now = clock();
  const { gladys, hub, network } = await createWorld({ now, config: { local_interval: '60' } });
  await addAllDevices(gladys);
  const element = network.sensors['192.0.2.5'];
  const reads = () => element.requests.filter((path) => path === '/air-data/latest').length;
  const start = reads();
  now.advance(30000);
  await hub.tick();
  assert.equal(reads(), start, 'not due after 30 s');
  now.advance(30000);
  await hub.tick();
  assert.equal(reads(), start + 1, 'due after 60 s');
});

test("the core's onPoll is only a fallback: skipped right after the timer", async () => {
  const now = clock();
  const { gladys, network } = await createWorld({ now });
  await addAllDevices(gladys);
  const element = network.sensors['192.0.2.5'];
  const reads = () => element.requests.filter((path) => path === '/air-data/latest').length;
  const start = reads();
  const device = gladys.fake.discoveredDevices[0];
  assert.deepEqual(await gladys.fake.poll(device), { success: true });
  assert.equal(reads(), start);
  now.advance(60000);
  await gladys.fake.poll(device);
  assert.equal(reads(), start + 1, 'the timer stalled: the core poll reads the sensor');
});

test('a lost sensor: one warning, one info line, one scene event; then its return', async () => {
  const now = clock();
  const { gladys, hub, network, logger } = await createWorld({ now });
  await addAllDevices(gladys);
  const element = network.sensors['192.0.2.5'];
  element.down = true;
  for (let i = 0; i < 5; i += 1) {
    now.advance(30000);
    await hub.tick();
  }
  const warnings = logger.lines.filter((line) => line.level === 'warn');
  assert.equal(warnings.length, 1, JSON.stringify(warnings));
  assert.match(warnings[0].message, /Awair Element 24947: 192\.0\.2\.5 unreachable/);
  const infos = logger.lines.filter((line) => line.level === 'info' && /lost/.test(line.message));
  assert.equal(infos.length, 1);
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: TRIGGERS.OFFLINE,
      data: { device: deviceId(ELEMENT_UUID), device_name: 'Awair Element 24947' },
    },
  ]);

  element.down = false;
  now.advance(30000);
  await hub.tick();
  assert.equal(gladys.fake.sceneEvents.at(-1).key, TRIGGERS.ONLINE);
  assert.ok(logger.lines.some((line) => line.level === 'info' && /is back/.test(line.message)));
});

test('a sensor that moved to a new address is found again by mDNS', async () => {
  const now = clock();
  const { gladys, hub, network } = await createWorld({ now });
  await addAllDevices(gladys);
  // DHCP gave the Element a new address.
  const element = network.sensors['192.0.2.5'];
  delete network.sensors['192.0.2.5'];
  network.sensors['192.0.2.15'] = element;
  gladys.fake.scanResults.mdns[0].addresses = ['192.0.2.15'];
  element.latest.co2 = 777;

  for (let i = 0; i < 3; i += 1) {
    now.advance(10 * 60 * 1000);
    await hub.tick();
  }
  now.advance(30000);
  await hub.tick();
  const params = gladys.fake.discoveredDevices[0].params;
  assert.equal(params.find((param) => param.name === 'HOST').value, '192.0.2.15');
  assert.equal(gladys.fake.lastState(featureId(ELEMENT_UUID, 'co2')), 777);
});

test('without mDNS, the typed addresses and the remembered ones still work', async () => {
  const { gladys } = await createWorld({ mdns: null, config: { hosts: '192.0.2.6' } });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.external_id),
    [deviceId(OMNI_UUID)],
  );

  // A restart: the Element is known from the HOST param of the added device.
  const added = [
    {
      external_id: deviceId(ELEMENT_UUID),
      name: 'Office',
      params: [{ name: 'HOST', value: '192.0.2.5' }],
      features: [],
    },
  ];
  const world = await createWorld({ mdns: [], devices: added });
  assert.deepEqual(
    world.gladys.fake.discoveredDevices.map((device) => device.external_id),
    [deviceId(ELEMENT_UUID)],
  );
  // ...and read at once, since the user added it.
  assert.equal(world.gladys.fake.lastState(featureId(ELEMENT_UUID, 'score')), 94);
});

test('no sensor at all: the Configuration screen says what to do', async () => {
  const { gladys } = await createWorld({ sensors: {}, mdns: [] });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Local API/);
});

test('cloud: local wins, the others are read at the pace the quota allows', async () => {
  const now = clock();
  const cloud = createFakeCloud({
    token: TOKEN,
    latest: { awair_24950: fixture('cloud-latest-awair') },
  });
  const { gladys, hub } = await createWorld({
    now,
    cloud,
    config: { cloud_token: TOKEN },
    sensors: { '192.0.2.5': createElement() },
  });
  const ids = gladys.fake.discoveredDevices.map((device) => device.external_id);
  // The Glow has not reported for 10 minutes: not publishable yet.
  assert.deepEqual(ids, [deviceId(ELEMENT_UUID), deviceId('awair_24950')]);
  const element = gladys.fake.discoveredDevices[0];
  assert.equal(element.name, 'Office', 'the cloud brings the name the user gave');
  assert.equal(element.params.find((param) => param.name === 'SOURCE').value, 'local');

  await addAllDevices(gladys);
  assert.equal(gladys.fake.lastState(featureId('awair_24950', 'dust')), 14.3);
  const reads = () => cloud.requests.filter((path) => path.endsWith('/air-data/latest')).length;
  const start = reads();
  now.advance(4 * 60 * 1000);
  await hub.tick();
  assert.equal(reads(), start, 'not before 5 minutes');
  now.advance(60 * 1000);
  await hub.tick();
  assert.equal(reads(), start + 1);

  // A quota of 100 calls a day: one call every 14.4 minutes at most.
  cloud.user.permissions.find((permission) => permission.scope === 'LATEST').quota = 100;
  await hub.rediscover();
  const sensor = hub.sensors.get('awair_24950');
  assert.equal(hub.periodOf(sensor), 864000);
});

test('cloud: an exhausted quota pauses the sensor for an hour', async () => {
  const now = clock();
  const cloud = createFakeCloud({
    token: TOKEN,
    latest: { awair_24950: fixture('cloud-latest-awair') },
  });
  const { gladys, hub } = await createWorld({
    now,
    cloud,
    config: { cloud_token: TOKEN },
    sensors: {},
  });
  await addAllDevices(gladys);
  cloud.quotaExceeded = true;
  now.advance(5 * 60 * 1000);
  await hub.tick();
  const reads = () => cloud.requests.length;
  const after = reads();
  for (let i = 0; i < 6; i += 1) {
    now.advance(5 * 60 * 1000);
    await hub.tick();
  }
  assert.equal(reads(), after, 'no call during the hour after a 429');
  now.advance(35 * 60 * 1000);
  await hub.tick();
  assert.equal(reads(), after + 1);
});

test('cloud: a refused token is reported when no sensor is left', async () => {
  const cloud = createFakeCloud({ token: 'another-token' });
  const { gladys } = await createWorld({
    cloud,
    config: { cloud_token: TOKEN },
    sensors: {},
    mdns: [],
  });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /token/);
});

test('a measurement the first reading lacked adds a feature to the device', async () => {
  const now = clock();
  const element = createElement();
  delete element.latest.pm25;
  const { gladys, hub } = await createWorld({ now, sensors: { '192.0.2.5': element } });
  await addAllDevices(gladys);
  const keys = () => gladys.fake.discoveredDevices[0].features.map((f) => f.external_id);
  assert.ok(!keys().includes(featureId(ELEMENT_UUID, 'pm25')));
  element.latest.pm25 = 5;
  now.advance(30000);
  await hub.tick();
  assert.ok(keys().includes(featureId(ELEMENT_UUID, 'pm25')));
});

test('a new configuration restarts discovery with the new addresses', async () => {
  const { gladys } = await createWorld({ mdns: [] });
  assert.equal(gladys.fake.discoveredDevices.length, 0);
  await gladys.fake.configUpdated({ hosts: '192.0.2.5' });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.external_id),
    [deviceId(ELEMENT_UUID)],
  );
});

test('the Discovery tab runs a new search', async () => {
  const { gladys, network } = await createWorld({ mdns: [] });
  assert.equal(gladys.fake.discoveredDevices.length, 0);
  gladys.fake.scanResults.mdns = [
    { name: 'AWAIR-ELEM-1419E1._http._tcp.local', addresses: ['192.0.2.5'], port: 80 },
  ];
  await gladys.fake.scanRequest();
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  assert.ok(network.sensors['192.0.2.5'].requests.length > 0);
});
