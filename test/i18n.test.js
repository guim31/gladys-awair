// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code and the documentation. German says "du", never the polite "Sie".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { searchMessage } from '../src/app.js';
import { LANGUAGES } from '../src/config.js';
import {
  FEATURE_NAMES,
  LEVEL_NAMES,
  SEARCH_TEXT,
  STATUS,
  SUMMARY_TEXT,
  WIDGET_TEXT,
} from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  short: 40,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max, render = (value) => value) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(render(value), `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 50, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the catalog name is the brand, the same in every language', () => {
  assert.equal(typeof manifest.name, 'string');
  assert.equal(manifest.name, 'Awair');
});

test('the feature names, levels and widget texts exist in every language', () => {
  assert.deepEqual(
    [
      ...tableProblems(FEATURE_NAMES, 'FEATURE_NAMES', MAX.featureName),
      ...tableProblems(LEVEL_NAMES, 'LEVEL_NAMES', MAX.short),
      ...tableProblems(WIDGET_TEXT, 'WIDGET_TEXT', MAX.message),
    ],
    [],
  );
  // The status rows of the widget hold 40 characters.
  for (const lang of LANGS) {
    for (const key of ['level', 'connection', 'local', 'cloud', 'unreachable', 'waiting']) {
      assert.ok(WIDGET_TEXT[lang][key].length <= 40, `${lang}.${key}`);
    }
  }
});

test('the status messages exist in every language', () => {
  const found = Object.entries(STATUS).flatMap(([key, value]) =>
    problems(value, `STATUS.${key}`, MAX.message),
  );
  assert.deepEqual(found, []);
});

test('the search report and the scene sentence exist in every language', () => {
  const render = (value) =>
    typeof value === 'function' ? value('Office', 'bonne', 90) : String(value);
  assert.deepEqual(tableProblems(SEARCH_TEXT, 'SEARCH_TEXT', MAX.message, render), []);
  assert.deepEqual(tableProblems(SUMMARY_TEXT, 'SUMMARY_TEXT', MAX.message, render), []);

  const report = searchMessage({
    sensors: [
      {
        name: 'Office',
        model: 'Awair Element',
        host: '192.0.2.5',
        source: 'local',
        reachable: true,
      },
      { name: 'Bedroom', model: 'Awair Glow', host: null, source: 'cloud', reachable: false },
    ],
    mdns: 'unavailable',
    cloud: 'ok',
    quota: 300,
    failedHosts: ['192.0.2.9'],
    invalidHosts: ['300.1.1.1'],
  });
  assert.deepEqual(problems(report, 'searchMessage', 600), []);
  assert.match(report.de, /2 Sensor\(en\), davon 1 erreichbar: Office .* nicht erreichbar/);
  assert.match(report.es, /introduzca las direcciones IP/);
  assert.match(report.fr, /Jeton cloud accepté \(300 appels par jour\)/);
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'Air', fr: 'Air', de: 'Luft' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'Air', fr: 'Air', de: '', es: 'Aire' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Sensor', 'Ihre IP', 'mit Ihrem', 'Ihnen']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  const forgotten = structuredClone(manifest);
  delete forgotten.scene_actions[0].label.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.scene_actions[0].label has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});

// --- Documentation ---------------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

const headings = (text, level) =>
  text
    .split('\n')
    .filter((line) => line.startsWith(`${'#'.repeat(level)} `))
    .map((line) => line.slice(level + 1).trim());

test('the four docs exist, with the same sections in the same order', () => {
  const shape = (lang) => ({
    sections: headings(docs[lang], 2).length,
    subsections: headings(docs[lang], 3).length,
  });
  for (const lang of LANGS) {
    assert.ok(docs[lang].length >= 300, `docs/${lang}.md is too short for the store`);
    assert.deepEqual(shape(lang), shape('en'), `docs/${lang}.md does not have the sections of en`);
    assert.equal(headings(docs[lang], 1).length, 1, `docs/${lang}.md needs one title`);
  }
  assert.ok(headings(docs.en, 2).length >= 8, 'presentation, setup, devices... all there');
});

test('the docs say the integration was developed without the hardware', () => {
  assert.match(docs.en, /without the hardware/i);
  assert.match(docs.fr, /sans le matériel/i);
  assert.match(docs.de, /ohne die Hardware/i);
  assert.match(docs.es, /sin el hardware/i);
  assert.doesNotMatch(docs.de, POLITE_GERMAN);
});

test('the docs name every widget, trigger, action and setting key', () => {
  const keys = [
    ...manifest.widgets.map((w) => w.label),
    ...manifest.scene_triggers.map((t) => t.label),
    ...manifest.scene_actions.map((a) => a.label),
    ...manifest.actions.map((a) => a.label),
  ];
  for (const lang of LANGS) {
    for (const label of keys) {
      assert.ok(docs[lang].includes(label[lang]), `docs/${lang}.md does not name "${label[lang]}"`);
    }
  }
});
