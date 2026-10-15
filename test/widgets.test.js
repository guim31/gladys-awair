import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { createFakeCloud, fixture } from './helpers/fakeAwair.js';
import {
  ELEMENT_UUID,
  OMNI_UUID,
  addAllDevices,
  createWorld,
  deviceId,
  featureId,
} from './helpers/world.js';

/** Every device_feature of a content exists on the published device. */
function assertBoundFeaturesExist(gladys, content) {
  const features = new Set(
    gladys.fake.discoveredDevices.flatMap((device) => device.features.map((f) => f.external_id)),
  );
  for (const component of content.components) {
    if (component.device_feature) {
      assert.ok(features.has(component.device_feature), component.device_feature);
    }
  }
}

async function widget(gladys, settings, language = 'fr') {
  const ack = await gladys.fake.widgetGet(WIDGET_KEY, { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
}

for (const language of ['en', 'fr', 'de', 'es']) {
  test(`the widget fits the core budget, bound to real features (${language})`, async () => {
    const { gladys } = await createWorld();
    await addAllDevices(gladys);
    for (const uuid of [ELEMENT_UUID, OMNI_UUID]) {
      const content = await widget(gladys, { sensor: deviceId(uuid) }, language);
      assert.deepEqual(validateWidgetContent(content), []);
      assertBoundFeaturesExist(gladys, content);
    }
  });
}

test('the Element widget: score gauge, four tiles, band and connection', async () => {
  const { gladys } = await createWorld();
  await addAllDevices(gladys);
  const content = await widget(gladys, { sensor: deviceId(ELEMENT_UUID) }, 'en');
  assert.deepEqual(
    content.components.map((c) => c.device_feature ?? c.type),
    [
      featureId(ELEMENT_UUID, 'score'),
      featureId(ELEMENT_UUID, 'co2'),
      featureId(ELEMENT_UUID, 'pm25'),
      featureId(ELEMENT_UUID, 'temperature'),
      featureId(ELEMENT_UUID, 'humidity'),
      'status',
    ],
  );
  const [level, connection] = content.components.at(-1).items;
  assert.deepEqual([level.value, level.color], ['Good', 'success']);
  assert.deepEqual([connection.value, connection.color], ['Local', 'success']);
});

test('a lost sensor shows as unreachable, a poor score as poor', async () => {
  const now = (() => {
    let time = Date.parse('2026-10-15T08:00:00Z');
    const fn = () => time;
    fn.advance = (ms) => (time += ms);
    return fn;
  })();
  const { gladys, hub, network } = await createWorld({ now });
  await addAllDevices(gladys);
  network.sensors['192.0.2.5'].latest.score = 42;
  now.advance(30000);
  await hub.tick();
  let [level] = (await widget(gladys, { sensor: deviceId(ELEMENT_UUID) }, 'fr')).components.at(
    -1,
  ).items;
  assert.deepEqual([level.value, level.color], ['Mauvaise', 'danger']);

  network.sensors['192.0.2.5'].down = true;
  for (let i = 0; i < 3; i += 1) {
    now.advance(30000);
    await hub.tick();
  }
  const items = (await widget(gladys, { sensor: deviceId(ELEMENT_UUID) }, 'de')).components.at(
    -1,
  ).items;
  assert.equal(items[1].value, 'Nicht erreichbar');
  assert.equal(items[0].color, 'neutral');
});

test('a first-generation Awair shows its dust sensor in place of PM2.5', async () => {
  const cloud = createFakeCloud({
    token: 't',
    latest: { awair_24950: fixture('cloud-latest-awair') },
  });
  const { gladys } = await createWorld({ cloud, config: { cloud_token: 't' }, sensors: {} });
  await addAllDevices(gladys);
  const content = await widget(gladys, { sensor: deviceId('awair_24950') }, 'en');
  assert.ok(content.components.some((c) => c.device_feature === featureId('awair_24950', 'dust')));
  assert.equal(content.components.at(-1).items[1].value, 'Cloud');
  assertBoundFeaturesExist(gladys, content);
});

test('no sensor chosen, or an unknown one: a sentence, not an error', async () => {
  const { gladys } = await createWorld();
  const empty = await widget(gladys, {}, 'es');
  assert.deepEqual(validateWidgetContent(empty), []);
  assert.match(empty.components[0].text, /Elija un sensor/);
  const unknown = await widget(gladys, { sensor: deviceId('awair-element_1') }, 'en');
  assert.match(unknown.components[0].text, /not known/);
});
