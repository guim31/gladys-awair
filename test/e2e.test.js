// -----------------------------------------------------------------------------
// End to end over real HTTP: a fake Awair sensor served on 127.0.0.1, the
// integration with the real `fetch`, the SDK's fake Gladys. The address is
// typed in the configuration, as for a sensor mDNS does not find.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { createOmni, serveSensor, OMNI_UUID } from './helpers/fakeAwair.js';
import { createRecordingLogger, featureId } from './helpers/world.js';

test('a sensor at a typed address is found, added and read over HTTP', async () => {
  const sensor = createOmni();
  const server = await serveSensor(sensor);
  const gladys = createFakeGladys({ config: { hosts: server.host, language: 'en' } });
  const app = registerHandlers(gladys, { timers: false, logger: createRecordingLogger() });
  try {
    await gladys.connect();
    await app.ready;
    const [device] = gladys.fake.discoveredDevices;
    assert.equal(device.name, 'Awair Omni 18959');
    assert.equal(device.params.find((param) => param.name === 'HOST').value, server.host);

    await gladys.fake.deviceCreated(structuredClone(device));
    assert.equal(gladys.fake.lastState(featureId(OMNI_UUID, 'noise')), 52);
    assert.equal(gladys.fake.lastState(featureId(OMNI_UUID, 'battery')), 99);

    const report = await gladys.fake.action('search', {});
    assert.equal(report.success, true);
    assert.match(
      report.data.message.en,
      /1 sensor\(s\), 1 answering: Awair Omni 18959 \(Awair Omni, local/,
    );
    assert.deepEqual(
      sensor.requests.filter((path) => path === '/settings/config/data').length >= 2,
      true,
    );
  } finally {
    app.stop();
    await gladys.disconnect();
    await server.close();
  }
});
