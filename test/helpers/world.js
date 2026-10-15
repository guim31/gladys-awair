// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, the integration wired on it
// exactly like index.js does, fake Awair sensors and cloud, and a logger that
// records every line.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import {
  ELEMENT_UUID,
  OMNI_UUID,
  createElement,
  createFakeNetwork,
  createOmni,
} from './fakeAwair.js';

export const SELECTOR = 'test-integration';
export const deviceId = (uuid) => `ext:${SELECTOR}:awair:${uuid}`;
export const featureId = (uuid, key) => `${deviceId(uuid)}:${key}`;
export { ELEMENT_UUID, OMNI_UUID };

/** A logger that keeps every line, for the log tests. */
export function createRecordingLogger() {
  const lines = [];
  const log =
    (level) =>
    (...args) =>
      lines.push({
        level,
        message: args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '),
      });
  const logger = {
    lines,
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child: () => logger,
  };
  return logger;
}

/** mDNS answers as the core relays them, for the two default sensors. */
export function mdnsResults() {
  return [
    {
      name: 'AWAIR-ELEM-1419E1._http._tcp.local',
      host: 'awair-elem-1419e1.local',
      addresses: ['192.0.2.5'],
      port: 80,
      txt: [],
    },
    {
      name: 'awair-omni-18959-backplate._http._tcp.local',
      host: 'awair-omni-18959-backplate.local',
      addresses: ['fe80::1', '192.0.2.6'],
      port: 80,
      txt: [],
    },
    // Another web server of the network, never an Awair.
    {
      name: 'printer._http._tcp.local',
      host: 'printer.local',
      addresses: ['192.0.2.50'],
      port: 80,
      txt: [],
    },
  ];
}

/**
 * @param {object} [options]
 * @param {object} [options.config] integration configuration
 * @param {object[]} [options.devices] devices the user already added
 * @param {Record<string, object>} [options.sensors] fake sensors by host
 * @param {object} [options.cloud] fake cloud (createFakeCloud)
 * @param {object[]|null} [options.mdns] mDNS results, null: no mDNS answer at all
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 * @param {() => number} [options.now]
 */
export async function createWorld({
  config = {},
  devices = [],
  sensors,
  cloud,
  mdns = mdnsResults(),
  connect = true,
  timers = false,
  now,
} = {}) {
  const network = createFakeNetwork(
    sensors ?? { '192.0.2.5': createElement(), '192.0.2.6': createOmni() },
    cloud,
  );
  const gladys = createFakeGladys({
    config,
    devices,
    scanResults: mdns === null ? {} : { mdns },
  });
  const logger = createRecordingLogger();
  const app = registerHandlers(gladys, { fetch: network.fetch, timers, now, logger });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, app, hub: app.hub, network, logger };
}

/** Add every discovered device in Gladys, the way the user does. */
export async function addAllDevices(gladys) {
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(structuredClone(device));
  }
}
