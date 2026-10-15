// -----------------------------------------------------------------------------
// Awair Local API client (read only).
//
// Enabled per sensor in the Awair Home app: Awair+ → Awair APIs → Local API.
// Plain HTTP on port 80, no authentication:
//   GET /settings/config/data   identity (device_uuid, firmware, Omni battery)
//   GET /air-data/latest        the readings, refreshed every 10 seconds
// Omni firmwares from 1.3.1 serve the settings under /settings/data instead,
// and the Omni Ethernet backplate answers JSON with a text/html content type:
// the body is parsed whatever the header says.
// -----------------------------------------------------------------------------

import { readingFromLocal, settingsFromLocal } from './model.js';

const TIMEOUT_MS = 5000;
const SETTINGS_PATHS = ['/settings/config/data', '/settings/data'];

export class LocalApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, kind: 'unreachable'|'http'|'invalid' }} details
   */
  constructor(message, { status, kind }) {
    super(message);
    this.name = 'LocalApiError';
    this.status = status;
    this.kind = kind;
  }
}

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] injected in the tests
 * @param {number} [options.timeoutMs]
 */
export function createLocalClient({ fetch: fetchImpl = globalThis.fetch, timeoutMs } = {}) {
  async function getJson(host, path) {
    let response;
    try {
      response = await fetchImpl(`http://${host}${path}`, {
        signal: AbortSignal.timeout(timeoutMs ?? TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'no answer' : (err?.cause?.code ?? 'no answer');
      throw new LocalApiError(`${host} unreachable (${reason})`, { kind: 'unreachable' });
    }
    const body = await response.text().catch(() => '');
    if (!response.ok) {
      throw new LocalApiError(`${host} answered HTTP ${response.status} on ${path}`, {
        status: response.status,
        kind: 'http',
      });
    }
    try {
      return JSON.parse(body);
    } catch {
      throw new LocalApiError(`${host} answered something else than JSON on ${path}`, {
        kind: 'invalid',
      });
    }
  }

  return {
    /** Identity of the sensor at `host`. */
    async settings(host) {
      let lastError;
      for (const path of SETTINGS_PATHS) {
        try {
          return settingsFromLocal(await getJson(host, path));
        } catch (err) {
          lastError = err;
          // Only a missing page means "try the other firmware's path".
          if (!(err instanceof LocalApiError && err.status === 404)) {
            break;
          }
        }
      }
      if (lastError instanceof LocalApiError && lastError.status === 404) {
        throw new LocalApiError(`${host} has no Awair settings page: is it an Awair sensor?`, {
          status: 404,
          kind: 'http',
        });
      }
      if (lastError instanceof LocalApiError) {
        throw lastError;
      }
      throw new LocalApiError(`${host}: ${lastError.message}`, { kind: 'invalid' });
    },

    /** The latest readings of the sensor at `host`, normalized. */
    async latest(host) {
      const json = await getJson(host, '/air-data/latest');
      try {
        return readingFromLocal(json);
      } catch (err) {
        throw new LocalApiError(`${host}: ${err.message}`, { kind: 'invalid' });
      }
    },
  };
}
