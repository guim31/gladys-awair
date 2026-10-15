import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_ACTION_KEY, airQualityOutputs } from '../src/scenes.js';
import { ELEMENT_UUID, addAllDevices, createWorld, deviceId } from './helpers/world.js';

test('"Read the air quality" reads the sensor now and returns a sentence and the values', async () => {
  const { gladys, network } = await createWorld();
  await addAllDevices(gladys);
  network.sensors['192.0.2.5'].latest.co2 = 1012;
  const ack = await gladys.fake.sceneAction(SCENE_ACTION_KEY, { device: deviceId(ELEMENT_UUID) });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    score: 94,
    level: 'good',
    co2: 1012,
    pm25: 2,
    temperature: 23.6,
    humidity: 56.5,
    summary:
      "Awair Element 24947 : qualité de l'air bonne (score 94/100), CO2 1012 ppm, " +
      "PM2.5 2 µg/m³, 23,6 °C, 56,5 % d'humidité.",
  });
});

test('the sentence follows the language of the configuration', () => {
  const reading = { values: { score: 65, co2: 820, temperature: 21.25, humidity: 40 } };
  assert.equal(
    airQualityOutputs('Office', reading, 'en').summary,
    'Office: air quality fair (score 65/100), CO2 820 ppm, 21.3 °C, 40 % humidity.',
  );
  assert.equal(
    airQualityOutputs('Büro', reading, 'de').summary,
    'Büro: Luftqualität mäßig (Score 65/100), CO2 820 ppm, 21,3 °C, 40 % Luftfeuchtigkeit.',
  );
  assert.equal(
    airQualityOutputs('Oficina', reading, 'es').summary,
    'Oficina: calidad del aire regular (puntuación 65/100), CO2 820 ppm, 21,3 °C, 40 % de humedad.',
  );
  // A first-generation Awair: its dust sensor stands in for PM2.5.
  assert.equal(airQualityOutputs('Salon', { values: { score: 50, dust: 14.3 } }, 'fr').pm25, 14.3);
});

test('an unknown device or a lost sensor fails the action with a readable message', async () => {
  const now = (() => {
    let time = Date.parse('2026-10-15T08:00:00Z');
    const fn = () => time;
    fn.advance = (ms) => (time += ms);
    return fn;
  })();
  const { gladys, hub, network } = await createWorld({ now, config: { language: 'en' } });
  await addAllDevices(gladys);
  const unknown = await gladys.fake.sceneAction(SCENE_ACTION_KEY, { device: 'ext:x:y' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /not an Awair sensor/);

  network.sensors['192.0.2.5'].down = true;
  for (let i = 0; i < 3; i += 1) {
    now.advance(30000);
    await hub.tick();
  }
  const lost = await gladys.fake.sceneAction(SCENE_ACTION_KEY, { device: deviceId(ELEMENT_UUID) });
  assert.equal(lost.success, false);
  assert.match(lost.error, /no recent reading/);
});
