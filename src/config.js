// -----------------------------------------------------------------------------
// Configuration: the defaults (mirrors of the manifest `config_schema`
// defaults, checked by test/manifest.test.js) and the normalization of what
// the user typed.
// -----------------------------------------------------------------------------

import { isIP } from 'node:net';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Local refresh choices, in seconds. The sensor itself refreshes /latest every
// 10 seconds: anything faster would read the same values again.
export const LOCAL_INTERVALS = ['10', '30', '60', '300'];

// Cloud refresh choices, in minutes. The Hobbyist tier of the Awair developer
// API allows 300 "latest" calls a day per device: 5 minutes (288 a day) is the
// fastest pace that stays within it.
export const CLOUD_INTERVALS = ['5', '10', '15', '30'];

export const DEFAULT_CONFIG = {
  hosts: '',
  local_interval: '30',
  cloud_token: '',
  cloud_interval: '5',
  language: 'fr',
};

/**
 * Normalize the raw configuration values (missing keys, strings typed by
 * hand). Never throws: a value that makes no sense falls back to its default.
 * @param {object} [raw]
 */
export function normalizeConfig(raw = {}) {
  const values = { ...DEFAULT_CONFIG, ...dropEmpty(raw ?? {}) };
  const { hosts, invalidHosts } = parseHosts(values.hosts);
  return {
    hosts,
    invalidHosts,
    localIntervalMs: Number(pick(values.local_interval, LOCAL_INTERVALS, '30')) * 1000,
    cloudToken: typeof values.cloud_token === 'string' ? values.cloud_token.trim() : '',
    cloudIntervalMs: Number(pick(values.cloud_interval, CLOUD_INTERVALS, '5')) * 60 * 1000,
    language: pick(values.language, LANGUAGES, 'fr'),
  };
}

function dropEmpty(raw) {
  return Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== null && value !== undefined),
  );
}

function pick(value, allowed, fallback) {
  const text = String(value).trim();
  return allowed.includes(text) ? text : fallback;
}

/**
 * Split the "IP addresses" field: commas, semicolons or spaces. An entry may
 * carry a port (192.0.2.10:8080) or be a host name (awair-elem-1419e1.local);
 * anything else (a URL with credentials, a path...) is set aside and reported.
 * @param {unknown} text
 */
export function parseHosts(text) {
  const hosts = [];
  const invalidHosts = [];
  for (const entry of String(text ?? '').split(/[\s,;]+/)) {
    const candidate = entry
      .trim()
      .replace(/^http:\/\//i, '')
      .replace(/\/+$/, '');
    if (candidate === '') {
      continue;
    }
    if (isHost(candidate)) {
      if (!hosts.includes(candidate.toLowerCase())) {
        hosts.push(candidate.toLowerCase());
      }
    } else {
      invalidHosts.push(candidate);
    }
  }
  return { hosts, invalidHosts };
}

const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

function isHost(candidate) {
  const match = candidate.match(/^(.+?)(?::(\d{1,5}))?$/);
  if (!match) {
    return false;
  }
  const [, host, port] = match;
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
    return false;
  }
  return isIP(host) === 4 || HOSTNAME.test(host);
}
