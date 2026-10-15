// -----------------------------------------------------------------------------
// Fake Awair sensors and a fake Awair cloud, built from the recorded answers
// of test/fixtures/awair/.
//
// `createFakeNetwork` returns a `fetch` the clients use instead of the real
// one: `http://<host>/...` reaches the fake sensor at that host,
// `https://developer-apis.awair.is/v1/...` the fake cloud. `serveSensor`
// puts one fake sensor behind a real HTTP server on 127.0.0.1, for the
// end-to-end test that runs the real `fetch`. The tests never touch the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/awair/${name}.json`, import.meta.url), 'utf8'));

export const ELEMENT_UUID = 'awair-element_24947';
export const OMNI_UUID = 'awair-omni_18959';

/**
 * A fake sensor. Its fields can be changed at any time by the test.
 * @param {object} options
 * @param {object} options.settings answer of the settings page
 * @param {object} options.latest answer of /air-data/latest
 * @param {string} [options.settingsPath] where the firmware serves the settings
 * @param {string} [options.contentType] the Omni backplate says text/html
 */
export function createFakeSensor({
  settings,
  latest,
  settingsPath = '/settings/config/data',
  contentType = 'application/json',
}) {
  return {
    settings: structuredClone(settings),
    latest: structuredClone(latest),
    settingsPath,
    contentType,
    down: false,
    requests: [],
    /** @returns {{ status: number, body: string, contentType: string } | null} null: no answer */
    answer(path) {
      this.requests.push(path);
      if (this.down) {
        return null;
      }
      if (path === this.settingsPath) {
        return { status: 200, body: JSON.stringify(this.settings), contentType: this.contentType };
      }
      if (path === '/air-data/latest') {
        return { status: 200, body: JSON.stringify(this.latest), contentType: this.contentType };
      }
      return { status: 404, body: 'Not Found', contentType: 'text/plain' };
    },
  };
}

export const createElement = () =>
  createFakeSensor({
    settings: fixture('local-element-settings'),
    latest: fixture('local-element-latest'),
  });

export const createOmni = () =>
  createFakeSensor({
    settings: fixture('local-omni-settings'),
    latest: fixture('local-omni-latest'),
    contentType: 'text/html',
  });

/**
 * A fake Awair developer API.
 * @param {object} options
 * @param {string} options.token the only accepted token
 * @param {Record<string, object>} [options.latest] answers by device UUID
 */
export function createFakeCloud({ token, latest = {} }) {
  return {
    token,
    devices: fixture('cloud-devices'),
    user: fixture('cloud-user'),
    latest: structuredClone(latest),
    quotaExceeded: false,
    down: false,
    requests: [],
    answer(path, authorization) {
      this.requests.push(path);
      if (this.down) {
        return null;
      }
      if (authorization !== `Bearer ${this.token}`) {
        return { status: 401, body: '{"message":"Unauthorized"}', contentType: 'application/json' };
      }
      if (this.quotaExceeded) {
        return { status: 429, body: '{"message":"Too many requests"}', contentType: 'text/plain' };
      }
      const json = (value) => ({
        status: 200,
        body: JSON.stringify(value),
        contentType: 'application/json',
      });
      if (path === '/v1/users/self') {
        return json(this.user);
      }
      if (path === '/v1/users/self/devices') {
        return json(this.devices);
      }
      const match = path.match(
        /^\/v1\/users\/self\/devices\/([a-z0-9-]+)\/(\d+)\/air-data\/latest$/,
      );
      if (match) {
        return json(this.latest[`${match[1]}_${match[2]}`] ?? { data: [] });
      }
      return { status: 404, body: 'Not Found', contentType: 'text/plain' };
    },
  };
}

/**
 * A `fetch` that reaches the fake sensors (by host) and the fake cloud.
 * @param {Record<string, ReturnType<typeof createFakeSensor>>} sensors
 * @param {ReturnType<typeof createFakeCloud>} [cloud]
 */
export function createFakeNetwork(sensors = {}, cloud = undefined) {
  const network = {
    sensors,
    cloud,
    async fetch(url, options = {}) {
      const target = new URL(url);
      let answer;
      if (target.origin === 'https://developer-apis.awair.is' && network.cloud) {
        answer = network.cloud.answer(target.pathname, options.headers?.authorization);
      } else if (target.protocol === 'http:') {
        answer = network.sensors[target.host]?.answer(target.pathname) ?? null;
      } else {
        answer = null;
      }
      if (answer === null) {
        throw new TypeError('fetch failed', { cause: { code: 'EHOSTUNREACH' } });
      }
      return new Response(answer.body, {
        status: answer.status,
        headers: { 'content-type': answer.contentType },
      });
    },
  };
  return network;
}

/**
 * One fake sensor behind a real HTTP server on 127.0.0.1.
 * @returns {Promise<{ host: string, close: () => Promise<void> }>}
 */
export async function serveSensor(sensor) {
  const server = createServer((request, response) => {
    const answer = sensor.answer(new URL(request.url, 'http://localhost').pathname);
    if (answer === null) {
      request.socket.destroy();
      return;
    }
    response.writeHead(answer.status, { 'content-type': answer.contentType });
    response.end(answer.body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    host: `127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
