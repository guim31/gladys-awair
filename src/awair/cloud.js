// -----------------------------------------------------------------------------
// Awair developer API client (read only), the optional cloud path for the
// sensors the Local API cannot reach (first-generation Awair, Glow...).
//
// Bearer token from the Awair developer console (Awair Home app → Awair+ →
// Awair APIs → Cloud API). Endpoints used:
//   GET /v1/users/self                                       quotas and usage
//   GET /v1/users/self/devices                               the account's sensors
//   GET /v1/users/self/devices/<type>/<id>/air-data/latest   the readings
// Quotas are per day; the Hobbyist tier allows 300 "latest" calls a day.
// The token never appears in an error message or a log line.
// -----------------------------------------------------------------------------

import { parseDeviceUuid, readingFromCloud } from './model.js';

export const CLOUD_BASE_URL = 'https://developer-apis.awair.is/v1';
const TIMEOUT_MS = 15000;

export class CloudApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, kind: 'auth'|'quota'|'unreachable'|'http'|'invalid' }} details
   */
  constructor(message, { status, kind }) {
    super(message);
    this.name = 'CloudApiError';
    this.status = status;
    this.kind = kind;
  }
}

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {string} [options.baseUrl]
 */
export function createCloudClient({ fetch: fetchImpl = globalThis.fetch, baseUrl } = {}) {
  const base = baseUrl ?? CLOUD_BASE_URL;

  async function getJson(token, path) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'no answer' : (err?.cause?.code ?? 'no answer');
      throw new CloudApiError(`Awair cloud unreachable (${reason})`, { kind: 'unreachable' });
    }
    const body = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) {
      throw new CloudApiError(`Awair cloud refused the token (HTTP ${response.status})`, {
        status: response.status,
        kind: 'auth',
      });
    }
    if (response.status === 429) {
      throw new CloudApiError('Awair cloud daily quota exceeded (HTTP 429)', {
        status: 429,
        kind: 'quota',
      });
    }
    if (!response.ok) {
      throw new CloudApiError(`Awair cloud answered HTTP ${response.status}`, {
        status: response.status,
        kind: 'http',
      });
    }
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      throw new CloudApiError('Awair cloud answered something else than JSON', {
        kind: 'invalid',
      });
    }
    // Holdover of the former GraphQL API, still handled by python_awair.
    if (Array.isArray(json?.errors) && json.errors.length > 0) {
      const quota = json.errors.some((error) => /too many requests/i.test(error?.message ?? ''));
      throw new CloudApiError(quota ? 'Awair cloud daily quota exceeded' : 'Awair cloud error', {
        kind: quota ? 'quota' : 'http',
      });
    }
    return json;
  }

  return {
    /**
     * The account's quota of "latest" calls per day, and its use today
     * (null when the account does not say).
     */
    async quota(token) {
      const json = await getJson(token, '/users/self');
      const find = (list, scope, key) =>
        (Array.isArray(list) ? list : []).find((item) => item?.scope === scope)?.[key];
      const limit = Number(find(json.permissions, 'LATEST', 'quota'));
      const used = Number(find(json.usages, 'LATEST', 'usage'));
      return {
        tier: typeof json.tier === 'string' ? json.tier : null,
        latestPerDay: Number.isFinite(limit) && limit > 0 ? limit : null,
        latestUsedToday: Number.isFinite(used) ? used : null,
      };
    },

    /** The sensors of the account. */
    async devices(token) {
      const json = await getJson(token, '/users/self/devices');
      return (Array.isArray(json.devices) ? json.devices : [])
        .map((device) => {
          const id = parseDeviceUuid(device?.deviceUUID);
          if (!id) {
            return null;
          }
          return {
            ...id,
            name: typeof device.name === 'string' && device.name.trim() ? device.name.trim() : null,
          };
        })
        .filter(Boolean);
    },

    /**
     * The latest readings of one sensor; null when it has not reported for
     * 10 minutes.
     */
    async latest(token, { deviceType, deviceId }) {
      const json = await getJson(
        token,
        `/users/self/devices/${encodeURIComponent(deviceType)}/${deviceId}/air-data/latest`,
      );
      return readingFromCloud(json);
    },
  };
}
