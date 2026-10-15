// -----------------------------------------------------------------------------
// Scene action "Read the air quality" (Gladys 5.1+): reads the sensor NOW and
// hands the next actions of the scene a ready-made sentence ("Living room:
// air quality good (score 92/100), CO2 650 ppm...") plus the raw values.
// Writing that sentence by hand in Gladys takes one "get value" action per
// measurement; this is one card, for a morning notification or a message
// before airing the room.
//
// Scene actions do not receive the user's language: the texts follow the
// `language` of the configuration. `level` is a stable key (good, fair, poor)
// a scene condition can compare.
// -----------------------------------------------------------------------------

import { scoreLevel } from './awair/model.js';
import { LEVEL_NAMES, SUMMARY_TEXT } from './i18n.js';

export const SCENE_ACTION_KEY = 'read_air_quality';

/**
 * The outputs of the action for a sensor's reading.
 * @param {string} name device name
 * @param {{ values: Record<string, number> }} reading
 * @param {string} language
 */
export function airQualityOutputs(name, reading, language) {
  const lang = SUMMARY_TEXT[language] ? language : 'en';
  const text = SUMMARY_TEXT[lang];
  const format = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, useGrouping: false });
  const values = reading.values;
  const outputs = {};
  const parts = [];
  if (values.score !== undefined) {
    const level = scoreLevel(values.score);
    outputs.score = values.score;
    outputs.level = level;
    parts.push(text.head(name, LEVEL_NAMES[lang][level].toLowerCase(), values.score));
  } else {
    parts.push(name);
  }
  const pm = values.pm25 ?? values.dust;
  const details = [
    ['co2', values.co2],
    ['pm25', pm],
    ['temperature', values.temperature],
    ['humidity', values.humidity],
  ];
  for (const [key, value] of details) {
    if (value !== undefined) {
      outputs[key] = value;
      parts.push(text[key](format.format(value)));
    }
  }
  outputs.summary = `${parts.join(', ')}.`;
  return outputs;
}

export const SCENE_ACTIONS = {
  /**
   * @param {import('./hub.js').Hub} hub
   * @param {{ fields: { device: string } }} context
   */
  async [SCENE_ACTION_KEY](hub, { fields }) {
    const language = hub.config?.language ?? 'fr';
    const text = SUMMARY_TEXT[language] ?? SUMMARY_TEXT.en;
    const sensor = hub.sensorOfDevice({ external_id: fields?.device });
    if (!sensor) {
      throw new Error(text.unknown);
    }
    // A fresh reading when the sensor answers; the last one otherwise, as long
    // as the sensor is not counted as lost. A cloud sensor keeps its pace: the
    // daily quota is not spent on scenes.
    await hub.pollSensor(sensor, { force: sensor.source === 'local' });
    if (!sensor.reading || sensor.offline) {
      throw new Error(text.noReading(hub.deviceName(sensor)));
    }
    return airQualityOutputs(hub.deviceName(sensor), sensor.reading, language);
  },
};
