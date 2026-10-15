// -----------------------------------------------------------------------------
// Dashboard widget "Air quality" (Gladys 5.1+): the Awair score as a gauge,
// CO2, PM2.5, temperature and humidity as tiles, then the score band and the
// connection in a status list.
//
// The tiles are bound to the device features (`device_feature`): the core keeps
// them live from the published states, no refresh needed. Only the status rows
// are computed here; the hub nudges the widget when the band or the
// reachability changes. Content budget of the core: 8 components, 6 tiles,
// 1 status — this one sends 5 tiles and 1 status.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { scoreLevel } from './awair/model.js';
import { featureKeys, sensorIds } from './devices.js';
import { FEATURE_NAMES, LEVEL_NAMES, WIDGET_TEXT } from './i18n.js';
import { WIDGET_KEY } from './hub.js';

const TILES = ['co2', 'pm25', 'dust', 'temperature', 'humidity'];
const MAX_TILES = 4;
const LEVEL_COLORS = {
  good: WIDGET_COLORS.SUCCESS,
  fair: WIDGET_COLORS.WARNING,
  poor: WIDGET_COLORS.DANGER,
};

const pickLanguage = (language) => (WIDGET_TEXT[language] ? language : 'en');

/**
 * Content of the widget for one sensor.
 * @param {import('./hub.js').Hub} hub
 * @param {{ settings?: { sensor?: string }, language?: string }} request
 */
export function airQualityContent(hub, { settings, language }) {
  const lang = pickLanguage(language);
  const text = WIDGET_TEXT[lang];
  const names = FEATURE_NAMES[lang];
  const sensor = settings?.sensor ? hub.sensorOfDevice({ external_id: settings.sensor }) : null;
  if (!settings?.sensor) {
    return { ttl_seconds: 300, components: [{ type: 'text', variant: 'body', text: text.pick }] };
  }
  if (!sensor) {
    return { ttl_seconds: 60, components: [{ type: 'text', variant: 'body', text: text.unknown }] };
  }

  const ids = sensorIds(hub.gladys, sensor.uuid);
  const keys = featureKeys(sensor);
  const components = [];
  if (keys.includes('score')) {
    components.push({
      type: 'gauge',
      label: names.score,
      device_feature: ids.feature('score'),
    });
  }
  for (const key of TILES.filter((tile) => keys.includes(tile)).slice(0, MAX_TILES)) {
    components.push({ type: 'value', label: names[key], device_feature: ids.feature(key) });
  }

  const score = sensor.reading?.values.score;
  const level = score !== undefined ? scoreLevel(score) : null;
  const reachable = Boolean(sensor.reading) && !sensor.offline;
  components.push({
    type: 'status',
    items: [
      {
        label: text.level,
        value: level ? LEVEL_NAMES[lang][level] : text.waiting,
        color: level && reachable ? LEVEL_COLORS[level] : WIDGET_COLORS.NEUTRAL,
        icon: 'wind',
      },
      {
        label: text.connection,
        value: reachable ? text[sensor.source] : text.unreachable,
        color: reachable ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
        icon: reachable ? 'wifi' : 'wifi-off',
      },
    ],
  });
  return { ttl_seconds: 120, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => airQualityContent(hub, request),
  },
};
