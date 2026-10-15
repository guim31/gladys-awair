// -----------------------------------------------------------------------------
// One Gladys device per Awair sensor, its features built from what the sensor
// actually measures (the keys of its first reading): an Element has no light
// sensor, an Omni has one, a first-generation Awair has a single dust sensor.
//
// Category/type couples come from the core's table
// (test/fixtures/gladys-feature-table.json, checked by test/gladys-rules.test.js).
// The Awair score is NOT published as `airquality-sensor/aqi`: the core colors
// that category with the AQI scale, where LOW is good — a perfect score of 95
// would show orange. It is a plain integer, and its band (good / fair / poor)
// is a `risk/integer` feature the core colors green, yellow, orange.
//
// External ids are forever: `awair:<device_uuid>` for the device (the UUID is
// the same in the local and the cloud APIs), the measurement key for the
// feature (`score`, `co2`...).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { MEASUREMENTS, modelName, scoreLevel } from './awair/model.js';
import { FEATURE_NAMES } from './i18n.js';

export const DEVICE_TYPE = 'awair';

// Feature blueprint per key. min/max are display bounds (the core needs both,
// NOT NULL), taken from the widest Awair sensor range.
export const FEATURES = {
  score: { category: C.COUNTER_SENSOR, type: T.SENSOR.INTEGER, min: 0, max: 100 },
  air_quality: { category: C.RISK, type: T.RISK.INTEGER, min: 0, max: 3 },
  temperature: {
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -40,
    max: 85,
  },
  humidity: {
    category: C.HUMIDITY_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
  },
  co2: { category: C.CO2_SENSOR, type: T.SENSOR.INTEGER, unit: U.PPM, min: 0, max: 5000 },
  voc: { category: C.VOC_SENSOR, type: T.SENSOR.DECIMAL, unit: U.PPB, min: 0, max: 60000 },
  pm25: {
    category: C.PM25_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.MICROGRAM_PER_CUBIC_METER,
    min: 0,
    max: 1000,
  },
  pm10: {
    category: C.PM10_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.MICROGRAM_PER_CUBIC_METER,
    min: 0,
    max: 1000,
  },
  dust: {
    category: C.PM10_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.MICROGRAM_PER_CUBIC_METER,
    min: 0,
    max: 1000,
  },
  illuminance: {
    category: C.LIGHT_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.LUX,
    min: 0,
    max: 64000,
  },
  noise: { category: C.NOISE_SENSOR, type: T.SENSOR.INTEGER, unit: U.DECIBEL, min: 0, max: 120 },
  dew_point: {
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -40,
    max: 85,
  },
  battery: { category: C.BATTERY, type: T.BATTERY.INTEGER, unit: U.PERCENT, min: 0, max: 100 },
  plugged: { category: C.BATTERY, type: T.BATTERY.CHARGING, min: 0, max: 1 },
};

// risk/integer values the core labels and colors: 0 no risk (green),
// 1 low (yellow), 2 medium (orange).
export const RISK_BY_LEVEL = { good: 0, fair: 1, poor: 2 };

/** Device ids of a sensor. */
export function sensorIds(gladys, uuid) {
  return gladys.externalIds(DEVICE_TYPE, uuid);
}

/**
 * The feature keys of a sensor, in display order.
 * @param {{ reading?: { values: object }|null, power?: object|null }} sensor
 */
export function featureKeys(sensor) {
  const values = sensor.reading?.values ?? {};
  const keys = [];
  for (const key of MEASUREMENTS) {
    if (values[key] !== undefined) {
      keys.push(key);
      if (key === 'score') {
        keys.push('air_quality');
      }
    }
  }
  if (sensor.power?.battery !== null && sensor.power?.battery !== undefined) {
    keys.push('battery');
  }
  if (typeof sensor.power?.plugged === 'boolean') {
    keys.push('plugged');
  }
  return keys;
}

/**
 * The discovered device of one sensor.
 * @param {object} gladys
 * @param {object} sensor see Hub
 * @param {string} language
 */
export function buildDevice(gladys, sensor, language) {
  const ids = sensorIds(gladys, sensor.uuid);
  const names = FEATURE_NAMES[language] ?? FEATURE_NAMES.fr;
  const params = [
    { name: 'MODEL', value: modelName(sensor.deviceType) },
    { name: 'SOURCE', value: sensor.source },
  ];
  if (sensor.host) {
    params.push({ name: 'HOST', value: sensor.host });
  }
  if (sensor.firmware) {
    params.push({ name: 'FIRMWARE', value: sensor.firmware });
  }
  return {
    name: sensor.name ?? `${modelName(sensor.deviceType)} ${sensor.deviceId}`,
    external_id: ids.device,
    // The container refreshes the sensors itself (Gladys#3198); the core's
    // poll, once a minute, is only a fallback.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    params,
    features: featureKeys(sensor).map((key) => ({
      name: names[key],
      external_id: ids.feature(key),
      ...FEATURES[key],
      read_only: true,
      has_feedback: false,
      keep_history: true,
    })),
  };
}

/**
 * The states of one sensor, ready for publishChangedStates.
 * @param {object} gladys
 * @param {object} sensor
 */
export function buildStates(gladys, sensor) {
  const ids = sensorIds(gladys, sensor.uuid);
  const values = sensor.reading?.values ?? {};
  const states = [];
  const push = (key, state) => {
    if (typeof state === 'number' && Number.isFinite(state)) {
      states.push({ device_feature_external_id: ids.feature(key), state });
    }
  };
  for (const key of MEASUREMENTS) {
    push(key, values[key]);
  }
  if (values.score !== undefined) {
    push('air_quality', RISK_BY_LEVEL[scoreLevel(values.score)]);
  }
  if (sensor.power) {
    push('battery', sensor.power.battery);
    if (typeof sensor.power.plugged === 'boolean') {
      push('plugged', sensor.power.plugged ? 1 : 0);
    }
  }
  return states;
}

/** The UUID of a Gladys device of this integration, or null. */
export function uuidOfDevice(gladys, externalId) {
  const prefix = sensorIds(gladys, '').device;
  return typeof externalId === 'string' && externalId.startsWith(prefix)
    ? externalId.slice(prefix.length).split(':')[0] || null
    : null;
}
