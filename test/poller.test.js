// -----------------------------------------------------------------------------
// The container refreshes the sensors on its own timer: Gladys 5.2 does not
// poll a device created without should_poll, and keeps that choice even once
// fixed (Gladys#3198). This test never calls onPoll.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENT_UUID, addAllDevices, createWorld, featureId } from './helpers/world.js';

async function flush() {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('the states refresh on the internal timer, without any onPoll from the core', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-15T08:00:00Z') });
  const { gladys, app, network } = await createWorld({ timers: true });
  try {
    await addAllDevices(gladys);
    assert.equal(gladys.fake.lastState(featureId(ELEMENT_UUID, 'co2')), 426);

    network.sensors['192.0.2.5'].latest.co2 = 1250;
    // Less than the 30 s period: not read yet.
    for (let elapsed = 0; elapsed < 25000; elapsed += 5000) {
      t.mock.timers.tick(5000);
      await flush();
    }
    assert.equal(gladys.fake.lastState(featureId(ELEMENT_UUID, 'co2')), 426);

    for (let elapsed = 0; elapsed < 10000; elapsed += 5000) {
      t.mock.timers.tick(5000);
      await flush();
    }
    assert.equal(gladys.fake.lastState(featureId(ELEMENT_UUID, 'co2')), 1250);

    // Gladys never asked: no poll command went through the WebSocket.
    assert.ok(!gladys.fake.wsMessages.some((message) => /poll/.test(message.type)));
  } finally {
    app.stop();
  }
});

test('the timer stops on disconnection and starts again on reconnection', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-15T08:00:00Z') });
  const { gladys, app, network } = await createWorld({ timers: true });
  try {
    await addAllDevices(gladys);
    const element = network.sensors['192.0.2.5'];
    await gladys.disconnect();
    const reads = element.requests.length;
    for (let i = 0; i < 12; i += 1) {
      t.mock.timers.tick(5000);
      await flush();
    }
    assert.equal(element.requests.length, reads, 'no read while disconnected');

    element.latest.co2 = 990;
    await gladys.connect();
    await flush();
    assert.equal(gladys.fake.lastState(featureId(ELEMENT_UUID, 'co2')), 990);
  } finally {
    app.stop();
  }
});
