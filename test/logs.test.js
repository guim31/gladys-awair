// -----------------------------------------------------------------------------
// Quiet logs: a normal cycle writes nothing at info level, and no secret of
// the configuration ever reaches a log line.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, createFakeCloud, fixture } from './helpers/fakeAwair.js';
import { addAllDevices, createWorld } from './helpers/world.js';

const SECRET = 'very-secret-awair-token-0123456789';

function clock() {
  let time = Date.parse('2026-10-15T08:00:00Z');
  const now = () => time;
  now.advance = (ms) => {
    time += ms;
  };
  return now;
}

test('a normal polling cycle writes nothing at info level', async () => {
  const now = clock();
  const cloud = createFakeCloud({
    token: SECRET,
    latest: { awair_24950: fixture('cloud-latest-awair') },
  });
  const { gladys, hub, network, logger } = await createWorld({
    now,
    cloud,
    config: { cloud_token: SECRET },
  });
  await addAllDevices(gladys);
  const before = logger.lines.length;

  for (let i = 0; i < 20; i += 1) {
    network.sensors['192.0.2.5'].latest.co2 = 500 + i;
    now.advance(30000);
    await hub.tick();
  }
  const cycleLines = logger.lines.slice(before);
  assert.deepEqual(
    cycleLines.filter((line) => line.level !== 'debug'),
    [],
    'only debug lines during normal cycles',
  );
  assert.ok(gladys.fake.states.length > 20, 'the cycles did publish');
});

test('no secret of the configuration in the logs, whatever fails', async () => {
  const now = clock();
  // The cloud refuses the token, answers 429, then disappears; a sensor fails.
  const cloud = createFakeCloud({ token: SECRET });
  const element = createElement();
  const { gladys, hub, logger } = await createWorld({
    now,
    cloud,
    sensors: { '192.0.2.5': element },
    config: { cloud_token: SECRET, hosts: '192.0.2.5, user:pass@192.0.2.9' },
  });
  await addAllDevices(gladys);
  cloud.token = 'rotated';
  await gladys.fake.action('search', {});
  cloud.token = SECRET;
  cloud.quotaExceeded = true;
  await gladys.fake.action('search', {});
  cloud.down = true;
  element.down = true;
  for (let i = 0; i < 5; i += 1) {
    now.advance(30000);
    await hub.tick();
  }
  await gladys.fake.action('search', {});

  assert.ok(logger.lines.length > 5);
  for (const line of logger.lines) {
    assert.doesNotMatch(line.message, new RegExp(SECRET), `${line.level}: ${line.message}`);
    assert.doesNotMatch(line.message, /pass@|Bearer/, `${line.level}: ${line.message}`);
  }
});

test('a lifecycle start says one thing at info level: the discovery result', async () => {
  const { logger } = await createWorld();
  assert.deepEqual(
    logger.lines.filter((line) => line.level === 'info').map((line) => line.message),
    ['Discovery: 2 Awair sensor(s) (2 local)'],
  );
});
