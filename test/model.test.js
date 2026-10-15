import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  modelName,
  parseDeviceUuid,
  readingFromCloud,
  readingFromLocal,
  scoreLevel,
  settingsFromLocal,
} from '../src/awair/model.js';
import { fixture } from './helpers/fakeAwair.js';

test('a device UUID gives the model and the numeric id', () => {
  assert.deepEqual(parseDeviceUuid('awair-element_5366'), {
    uuid: 'awair-element_5366',
    deviceType: 'awair-element',
    deviceId: 5366,
  });
  assert.equal(parseDeviceUuid('awair_24947').deviceType, 'awair');
  for (const invalid of [undefined, '', 'awair-element', 'Awair_12', 'awair_12_3', 42]) {
    assert.equal(parseDeviceUuid(invalid), null, String(invalid));
  }
  assert.equal(modelName('awair-r2'), 'Awair 2nd Edition');
  assert.equal(modelName('awair-unknown-model'), 'Awair');
});

test('local settings keep the identity and the Omni battery, never the network details', () => {
  const element = settingsFromLocal(fixture('local-element-settings'));
  assert.deepEqual(element, {
    uuid: 'awair-element_24947',
    deviceType: 'awair-element',
    deviceId: 24947,
    firmware: '1.2.8',
    power: null,
  });
  const omni = settingsFromLocal(fixture('local-omni-settings'));
  assert.deepEqual(omni.power, { battery: 99, plugged: true });
  assert.throws(() => settingsFromLocal({ fw_version: '1.0' }), /device_uuid/);
});

test('local readings: absolute values win over the estimated ones', () => {
  // The Element answers co2 426 and co2_est 489: the measured value is kept.
  const reading = readingFromLocal(fixture('local-element-latest'));
  assert.deepEqual(reading, {
    timestamp: '2022-08-11T05:04:12.108Z',
    values: {
      score: 94,
      temperature: 23.6,
      humidity: 56.5,
      co2: 426,
      voc: 149,
      pm25: 2,
      pm10: 3,
      dew_point: 14.5,
    },
  });
  // Only the estimate: it is used.
  const estimated = readingFromLocal({ score: 80, co2_est: 512, pm10_est: 4 });
  assert.equal(estimated.values.co2, 512);
  assert.equal(estimated.values.pm10, 4);
});

test('the Omni reports light and noise, a light of 0 lux included', () => {
  const reading = readingFromLocal(fixture('local-omni-latest'));
  assert.equal(reading.values.illuminance, 0);
  assert.equal(reading.values.noise, 52);
  assert.equal(reading.values.score, 99);
});

test('a local answer without a score is refused', () => {
  assert.throws(() => readingFromLocal({ temp: 20 }), /score/);
  assert.throws(() => readingFromLocal(null), /score/);
});

test('cloud readings of every model', () => {
  const firstGen = readingFromCloud(fixture('cloud-latest-awair'));
  assert.deepEqual(firstGen.values, {
    score: 88,
    temperature: 21.8,
    humidity: 41.6,
    co2: 654,
    voc: 366,
    dust: 14.3,
  });
  assert.deepEqual(Object.keys(readingFromCloud(fixture('cloud-latest-omni')).values), [
    'score',
    'temperature',
    'humidity',
    'co2',
    'voc',
    'pm25',
    'illuminance',
    'noise',
  ]);
  assert.equal(readingFromCloud(fixture('cloud-latest-mint')).values.co2, undefined);
  assert.equal(readingFromCloud(fixture('cloud-latest-glow')).values.pm25, undefined);
  assert.equal(readingFromCloud(fixture('cloud-latest-awair-r2')).values.pm25, 2);
});

test('a cloud sensor silent for 10 minutes has no reading', () => {
  assert.equal(readingFromCloud(fixture('cloud-latest-offline')), null);
  assert.equal(readingFromCloud({}), null);
});

test('score bands follow the Awair app', () => {
  assert.equal(scoreLevel(100), 'good');
  assert.equal(scoreLevel(80), 'good');
  assert.equal(scoreLevel(79), 'fair');
  assert.equal(scoreLevel(60), 'fair');
  assert.equal(scoreLevel(59), 'poor');
  assert.equal(scoreLevel(0), 'poor');
});

test('an older Element firmware (1.1.5) gives the same measurements', () => {
  const reading = readingFromLocal(fixture('local-element-latest-2'));
  assert.deepEqual(Object.keys(reading.values), [
    'score',
    'temperature',
    'humidity',
    'co2',
    'voc',
    'pm25',
    'pm10',
    'dew_point',
  ]);
  assert.equal(reading.values.co2, 408, 'co2 (measured) and not co2_est (400)');
});
