#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only probe of the real Awair APIs, with the integration's own clients.
//
//   node scripts/probe.mjs <ip[:port]>    a sensor's Local API
//   node scripts/probe.mjs --cloud        the developer API, with a fake token
//                                         (or AWAIR_TOKEN from the environment)
//
// Nothing is written to the sensor or the account. Nothing sensitive is
// printed: no MAC address, no Wi-Fi name, no IP, no token, no account name —
// only the model, the firmware, the keys the sensor answers and the
// features the integration would create, so the output can be pasted in an
// issue as is.
// -----------------------------------------------------------------------------

import { createCloudClient } from '../src/awair/cloud.js';
import { createLocalClient } from '../src/awair/local.js';
import { modelName } from '../src/awair/model.js';
import { featureKeys } from '../src/devices.js';

const FAKE_TOKEN = 'gladys-awair-probe-fake-token';

async function probeLocal(host) {
  const rawKeys = {};
  // The raw keys, to spot a measurement the integration does not know yet.
  const recordingClient = createLocalClient({
    fetch: async (url, options) => {
      const response = await fetch(url, options);
      const text = await response.clone().text();
      try {
        rawKeys[new URL(url).pathname] = Object.keys(JSON.parse(text));
      } catch {
        rawKeys[new URL(url).pathname] = `(not JSON, HTTP ${response.status})`;
      }
      return response;
    },
  });
  const settings = await recordingClient.settings(host);
  const reading = await recordingClient.latest(host);
  const sensor = { ...settings, reading };
  console.log(`Model:      ${modelName(settings.deviceType)} (${settings.deviceType})`);
  console.log(`Firmware:   ${settings.firmware ?? 'unknown'}`);
  console.log(`Battery:    ${settings.power ? JSON.stringify(settings.power) : 'none'}`);
  for (const [path, keys] of Object.entries(rawKeys)) {
    console.log(`Keys of ${path}: ${Array.isArray(keys) ? keys.join(', ') : keys}`);
  }
  console.log(`Timestamp:  ${reading.timestamp}`);
  console.log(`Values:     ${JSON.stringify(reading.values)}`);
  console.log(`Features:   ${featureKeys(sensor).join(', ')}`);
}

async function probeCloud() {
  const token = process.env.AWAIR_TOKEN || FAKE_TOKEN;
  const client = createCloudClient();
  console.log(
    `Token:      ${token === FAKE_TOKEN ? 'fake (expect a refusal)' : 'from AWAIR_TOKEN'}`,
  );
  try {
    const quota = await client.quota(token);
    console.log(`Tier:       ${quota.tier ?? 'unknown'}`);
    console.log(`LATEST:     ${quota.latestUsedToday ?? '?'} used of ${quota.latestPerDay ?? '?'}`);
    const devices = await client.devices(token);
    console.log(`Sensors:    ${devices.map((device) => modelName(device.deviceType)).join(', ')}`);
    for (const device of devices) {
      const reading = await client.latest(token, device);
      console.log(
        `  ${modelName(device.deviceType)}: ${reading ? Object.keys(reading.values).join(', ') : 'no reading for 10 minutes'}`,
      );
    }
  } catch (err) {
    console.log(
      `Refused:    ${err.kind}${err.status ? ` (HTTP ${err.status})` : ''}: ${err.message}`,
    );
    process.exitCode = token === FAKE_TOKEN && err.kind === 'auth' ? 0 : 1;
  }
}

const [arg] = process.argv.slice(2);
if (!arg) {
  console.error('Usage: node scripts/probe.mjs <ip[:port]> | --cloud');
  process.exit(2);
}
try {
  if (arg === '--cloud') {
    await probeCloud();
  } else {
    await probeLocal(arg);
  }
} catch (err) {
  console.error(`Failed: ${err.kind ?? 'error'}: ${err.message.replaceAll(arg, '<host>')}`);
  process.exitCode = 1;
}
