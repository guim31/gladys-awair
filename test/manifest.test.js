// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { SEARCH_ACTION_KEY, registerHandlers } from '../src/app.js';
import { CLOUD_INTERVALS, DEFAULT_CONFIG, LANGUAGES, LOCAL_INTERVALS } from '../src/config.js';
import { MDNS_SERVICE } from '../src/discovery.js';
import { TRIGGERS } from '../src/hub.js';
import { SCENE_ACTIONS, airQualityOutputs } from '../src/scenes.js';
import { WIDGETS } from '../src/widgets.js';
import { createRecordingLogger } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// The handlers the integration actually registers on the SDK.
const registered = new Set();
const fake = createFakeGladys();
for (const method of ['onAction', 'onSceneAction', 'onWidgetGet', 'onWidgetAction']) {
  const original = fake[method].bind(fake);
  fake[method] = (key, cb) => {
    registered.add(`${method}:${key}`);
    return original(key, cb);
  };
}
registerHandlers(fake, { timers: false, logger: createRecordingLogger() }).stop();

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('identity: name, image, local transport, environment category, mDNS capture', () => {
  assert.equal(manifest.name, 'Awair');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-awair:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-awair/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['environment']);
  assert.deepEqual(manifest.network_discovery, [{ type: 'mdns', service: MDNS_SERVICE }]);
});

test('widgets, scene triggers and actions require Gladys >= 5.1.0', () => {
  assert.ok(isAtLeast(minGladysVersion(), [5, 1, 0]), manifest.gladys_version);
  // No widget button opens a form (#3168): 5.2.0 is not needed.
  assert.equal(manifest.gladys_version, '>=5.1.0');
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions), [SEARCH_ACTION_KEY]);
  assert.ok(registered.has(`onAction:${SEARCH_ACTION_KEY}`));
  const actions = [...registered].filter((key) => key.startsWith('onAction:'));
  assert.equal(actions.length, keysOf(manifest.actions).length);
});

test('every scene_actions key has an onSceneAction handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  for (const key of keysOf(manifest.scene_actions)) {
    assert.ok(registered.has(`onSceneAction:${key}`), key);
  }
});

test('the scene action returns only declared outputs, of the declared types', () => {
  const [action] = manifest.scene_actions;
  const declared = Object.fromEntries(action.outputs.map((output) => [output.key, output.type]));
  const outputs = airQualityOutputs(
    'Office',
    {
      values: { score: 70, co2: 800, pm25: 3, temperature: 20, humidity: 50, voc: 100 },
    },
    'fr',
  );
  assert.deepEqual(Object.keys(outputs).sort(), Object.keys(declared).sort());
  for (const [key, value] of Object.entries(outputs)) {
    assert.equal(typeof value, declared[key], key);
  }
});

test('every widgets key has an onWidgetGet handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets), Object.keys(WIDGETS));
  for (const key of keysOf(manifest.widgets)) {
    assert.ok(registered.has(`onWidgetGet:${key}`), key);
  }
});

test('the scene triggers the code fires are declared, with the data keys their fields use', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
  for (const trigger of manifest.scene_triggers) {
    // fireTrigger sends { device, device_name }: every field and variable is one of them.
    for (const key of [...keysOf(trigger.fields), ...keysOf(trigger.variables)]) {
      assert.ok(['device', 'device_name'].includes(key), `${trigger.key}.${key}`);
    }
  }
});

test('config_schema defaults and options stay consistent with the code', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `${field.key} is missing from DEFAULT_CONFIG`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, field.key);
    }
  }
  const options = (key) =>
    manifest.config_schema.find((field) => field.key === key).options.map((o) => o.value);
  assert.deepEqual(options('local_interval'), LOCAL_INTERVALS);
  assert.deepEqual(options('cloud_interval'), CLOUD_INTERVALS);
  assert.deepEqual(options('language'), LANGUAGES);
  assert.equal(DEFAULT_CONFIG.language, 'fr');
});

test('the token is a secret field, never required', () => {
  const token = manifest.config_schema.find((field) => field.key === 'cloud_token');
  assert.equal(token.type, 'secret');
  assert.equal(token.required, false);
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined, section.key);
    assert.equal(section.default, undefined, section.key);
    assert.equal(section.placeholder, undefined, section.key);
    assert.ok(!(section.key in DEFAULT_CONFIG), section.key);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamicSelects.length > 0);
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, field.key);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog name and description fit the store', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('field placeholders are multi-language objects', () => {
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  for (const field of withPlaceholder) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en, `field "${field.key}": placeholder needs an English text`);
  }
});
