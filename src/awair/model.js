// -----------------------------------------------------------------------------
// What the Awair APIs answer, turned into one shape for the rest of the code.
//
// Local API (http://<sensor>/air-data/latest): a flat object, one key per
// sensor, abs values next to estimated ones on some models:
//   { "timestamp": "...", "score": 93, "dew_point": 11.11, "temp": 19.59,
//     "humid": 58.05, "abs_humid": 9.77, "co2": 408, "co2_est": 400,
//     "voc": 159, "voc_baseline": ..., "pm25": 2, "pm10_est": 3 }
// Cloud API (/v1/users/self/devices/<type>/<id>/air-data/latest):
//   { "data": [{ "timestamp": "...", "score": 88,
//                "sensors": [{ "comp": "temp", "value": 21.77 }, ...] }] }
// An empty `data` means the sensor has not reported for 10 minutes.
//
// Sources: python_awair (MIT) and the Home Assistant `awair` tests (Apache
// 2.0), whose recorded answers are the fixtures of test/fixtures/awair/.
// -----------------------------------------------------------------------------

export const MODELS = {
  awair: 'Awair (1st Edition)',
  'awair-element': 'Awair Element',
  'awair-glow': 'Awair Glow',
  'awair-glow-c': 'Awair Glow C',
  'awair-mint': 'Awair Mint',
  'awair-omni': 'Awair Omni',
  'awair-r2': 'Awair 2nd Edition',
};

/** Measurement keys of the normalized reading, in display order. */
export const MEASUREMENTS = [
  'score',
  'temperature',
  'humidity',
  'co2',
  'voc',
  'pm25',
  'pm10',
  'dust',
  'illuminance',
  'noise',
  'dew_point',
];

// Local key → measurement. When the API gives both an absolute and an
// estimated value (co2 / co2_est, pm10 / pm10_est), the first one present wins.
const LOCAL_KEYS = {
  score: ['score'],
  temperature: ['temp'],
  humidity: ['humid'],
  co2: ['co2', 'co2_est'],
  voc: ['voc'],
  pm25: ['pm25'],
  pm10: ['pm10', 'pm10_est'],
  illuminance: ['lux'],
  noise: ['spl_a'],
  dew_point: ['dew_point'],
};

// Cloud `comp` → measurement. `dust` is the first-generation Awair's single
// particle sensor, which cannot tell PM2.5 from PM10.
const CLOUD_KEYS = {
  temperature: ['temp'],
  humidity: ['humid'],
  co2: ['co2', 'co2_est'],
  voc: ['voc'],
  pm25: ['pm25'],
  pm10: ['pm10', 'pm10_est'],
  dust: ['dust'],
  illuminance: ['lux'],
  noise: ['spl_a'],
  dew_point: ['dew_point'],
};

// Decimals kept per measurement: the sensors report more than they measure,
// and rounding lets the state deduplication skip the noise.
const DECIMALS = {
  score: 0,
  temperature: 1,
  humidity: 1,
  co2: 0,
  voc: 0,
  pm25: 1,
  pm10: 1,
  dust: 1,
  illuminance: 1,
  noise: 0,
  dew_point: 1,
};

/**
 * Split a device UUID ("awair-element_5366") into its model and numeric id.
 * The same UUID names the sensor in the local and the cloud APIs.
 * @param {unknown} uuid
 * @returns {{ uuid: string, deviceType: string, deviceId: number } | null}
 */
export function parseDeviceUuid(uuid) {
  const match = typeof uuid === 'string' ? uuid.match(/^([a-z0-9-]+)_(\d+)$/) : null;
  if (!match) {
    return null;
  }
  return { uuid, deviceType: match[1], deviceId: Number(match[2]) };
}

/** Human name of a model ("awair-r2" → "Awair 2nd Edition"). */
export function modelName(deviceType) {
  return MODELS[deviceType] ?? 'Awair';
}

/**
 * The answer of the local `/settings/config/data`, reduced to what the
 * integration uses. The Wi-Fi name, IP and gateway it also holds are never kept.
 * @param {object} json
 */
export function settingsFromLocal(json) {
  const id = parseDeviceUuid(json?.device_uuid);
  if (!id) {
    throw new Error('the sensor did not give its device_uuid');
  }
  const power = json['power-status'];
  return {
    ...id,
    firmware: typeof json.fw_version === 'string' ? json.fw_version : null,
    power:
      power && typeof power === 'object'
        ? {
            battery: finite(power.battery),
            plugged: typeof power.plugged === 'boolean' ? power.plugged : null,
          }
        : null,
  };
}

/**
 * The local `/air-data/latest` answer, normalized.
 * @param {object} json
 * @returns {{ timestamp: string|null, values: Record<string, number> }}
 */
export function readingFromLocal(json) {
  if (!json || typeof json !== 'object' || finite(json.score) === null) {
    throw new Error('the sensor answered without an air quality score');
  }
  return normalize(json.timestamp, (key) => json[key], LOCAL_KEYS, json.score);
}

/**
 * The cloud `air-data/latest` answer, normalized; null when the sensor has
 * not reported for 10 minutes (empty `data`).
 * @param {object} json
 */
export function readingFromCloud(json) {
  const entry = Array.isArray(json?.data) ? json.data[0] : undefined;
  if (!entry) {
    return null;
  }
  const sensors = new Map(
    (Array.isArray(entry.sensors) ? entry.sensors : []).map((sensor) => [
      sensor?.comp,
      sensor?.value,
    ]),
  );
  return normalize(entry.timestamp, (key) => sensors.get(key), CLOUD_KEYS, entry.score);
}

function normalize(timestamp, read, keys, score) {
  const values = {};
  const scoreValue = finite(score);
  if (scoreValue !== null) {
    values.score = round(scoreValue, DECIMALS.score);
  }
  for (const [measurement, candidates] of Object.entries(keys)) {
    if (measurement === 'score') {
      continue;
    }
    for (const key of candidates) {
      const value = finite(read(key));
      if (value !== null) {
        values[measurement] = round(value, DECIMALS[measurement]);
        break;
      }
    }
  }
  return { timestamp: typeof timestamp === 'string' ? timestamp : null, values };
}

/**
 * Awair score bands, as the Awair app colors them: 80 and above is good,
 * 60 to 79 fair, below 60 poor.
 * @param {number} score
 * @returns {'good'|'fair'|'poor'}
 */
export function scoreLevel(score) {
  if (score >= 80) {
    return 'good';
  }
  if (score >= 60) {
    return 'fair';
  }
  return 'poor';
}

function finite(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
