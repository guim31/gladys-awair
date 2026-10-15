import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseHosts } from '../src/config.js';
import { awairHostsFromMdns } from '../src/discovery.js';
import { mdnsResults } from './helpers/world.js';

test('defaults: 30 s locally, 5 min in the cloud, French names', () => {
  assert.deepEqual(normalizeConfig(), {
    hosts: [],
    invalidHosts: [],
    localIntervalMs: 30000,
    cloudToken: '',
    cloudIntervalMs: 300000,
    language: 'fr',
  });
  assert.deepEqual(normalizeConfig(null), normalizeConfig(DEFAULT_CONFIG));
});

test('values out of the lists fall back to the defaults', () => {
  const config = normalizeConfig({
    local_interval: '1',
    cloud_interval: 'often',
    language: 'it',
    cloud_token: '  token  ',
  });
  assert.equal(config.localIntervalMs, 30000);
  assert.equal(config.cloudIntervalMs, 300000);
  assert.equal(config.language, 'fr');
  assert.equal(config.cloudToken, 'token');
  assert.equal(normalizeConfig({ local_interval: 10 }).localIntervalMs, 10000);
});

test('the address list accepts IPs, ports and host names, and sets the rest aside', () => {
  assert.deepEqual(
    parseHosts('192.0.2.5, 192.0.2.6:8080;awair-elem-1419e1.local  http://192.0.2.7/ 192.0.2.5'),
    {
      hosts: ['192.0.2.5', '192.0.2.6:8080', 'awair-elem-1419e1.local', '192.0.2.7'],
      invalidHosts: [],
    },
  );
  assert.deepEqual(parseHosts('300.1.2.3:99999, user@192.0.2.8, 192.0.2.9/path').hosts, []);
  assert.equal(parseHosts(undefined).hosts.length, 0);
});

test('mDNS: only the Awair web servers, by their IPv4 address', () => {
  assert.deepEqual(awairHostsFromMdns(mdnsResults()), ['192.0.2.5', '192.0.2.6']);
  assert.deepEqual(
    awairHostsFromMdns([
      { name: 'AWAIR-R2-0A0B0C._http._tcp.local', addresses: ['192.0.2.20'], port: 8080 },
      { name: 'AWAIR-GLOW._http._tcp.local', addresses: ['fe80::2'], port: 80 },
      { name: 'not-awair._http._tcp.local', addresses: ['192.0.2.21'], port: 80 },
    ]),
    ['192.0.2.20:8080'],
  );
  assert.deepEqual(awairHostsFromMdns(undefined), []);
});
