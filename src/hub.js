// -----------------------------------------------------------------------------
// The Awair hub: knows the sensors, finds them, reads them, publishes them.
//
// Where a sensor comes from, in order of preference:
//   1. the Local API, at an address found by mDNS (mediated by the core), typed
//      in the configuration, or remembered in the HOST param of a device the
//      user already added;
//   2. the cloud API, for the sensors of the account the Local API does not
//      reach (first-generation Awair, Glow), when a token is configured.
// The device UUID ("awair-element_5366") is the same on both paths: a sensor
// found both ways is one device, read locally.
//
// Refreshing: the core cannot be trusted to call onPoll (Gladys#3198, devices
// created without should_poll are never polled, even by a fixed core), so the
// hub runs its own timer. The core's onPoll stays as a fallback and is skipped
// when the timer polled the sensor less than 90 % of a period ago. Only the
// sensors the user added to Gladys are read: the core drops the states of the
// others.
//
// Logs: a normal cycle writes nothing at info level. A sensor that stops
// answering is one warning, its loss (3 failed reads in a row) one info line
// and a scene event, its return one info line and a scene event.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { createCloudClient } from './awair/cloud.js';
import { createLocalClient } from './awair/local.js';
import { modelName, scoreLevel } from './awair/model.js';
import { buildDevice, buildStates, featureKeys, sensorIds, uuidOfDevice } from './devices.js';
import { MDNS_SERVICE, SCAN_TIMEOUT_SECONDS, awairHostsFromMdns } from './discovery.js';
import { createIssueLog } from './issues.js';
import { STATUS } from './i18n.js';

export const WIDGET_KEY = 'air_quality';
export const TRIGGERS = { OFFLINE: 'sensor_offline', ONLINE: 'sensor_online' };

const TICK_MS = 5000;
// Failed reads in a row before a sensor counts as lost: a single missed answer
// (Wi-Fi hiccup, sensor busy) is not worth a scene.
const FAILURES_BEFORE_OFFLINE = 3;
// An unchanged value is still sent this often, so Gladys never shows it as old.
export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
// The Omni battery moves slowly: its settings page is read this often.
const POWER_REFRESH_MS = 5 * 60 * 1000;
// A lost local sensor may have a new DHCP address: browse mDNS again, at most
// this often.
const RESCAN_MS = 10 * 60 * 1000;
// After an HTTP 429 of the cloud, wait this long before asking again.
const QUOTA_BACKOFF_MS = 60 * 60 * 1000;
const MAX_PARALLEL_HOSTS = 8;

export class Hub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} [options.local] Local API client (createLocalClient)
   * @param {object} [options.cloud] cloud API client (createCloudClient)
   * @param {typeof fetch} [options.fetch] used by the default clients
   * @param {boolean} [options.timers] run the periodic timer
   * @param {() => number} [options.now]
   * @param {object} [options.logger]
   */
  constructor({ gladys, local, cloud, fetch, timers = true, now = () => Date.now(), logger }) {
    this.gladys = gladys;
    this.local = local ?? createLocalClient({ fetch });
    this.cloud = cloud ?? createCloudClient({ fetch });
    this.timers = timers;
    this.now = now;
    this.logger = logger ?? createLogger({ name: 'awair' });
    this.issues = createIssueLog(this.logger);
    this.config = null;
    /** @type {Map<string, object>} sensors by device UUID */
    this.sensors = new Map();
    this.inFlight = new Map();
    this.timer = null;
    this.stopped = false;
    this.lastScanAt = 0;
    this.cloudQuota = null;
    this.cloudState = null;
    this.mdnsState = null;
    this.lastSearch = { failedHosts: [], invalidHosts: [] };
    /** Feature keys last published, by UUID: a new key means publishing again. */
    this.publishedKeys = new Map();
  }

  // --- Lifecycle ---------------------------------------------------------------

  /** First start, or a reconnection (Gladys may have restarted). */
  async start(config) {
    this.config = config;
    this.stopped = false;
    await this.discover();
    await this.publish();
    await this.reportStatus();
    this.schedule();
    await this.pollCreated({ force: true });
  }

  /** New configuration: other addresses, token or pace. */
  async reconfigure(config) {
    this.config = config;
    this.cloudQuota = null;
    await this.start(config);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
  }

  /** "Search for sensors" or the Discovery tab: find, publish, report. */
  async rediscover() {
    await this.discover();
    await this.publish();
    await this.reportStatus();
    return this.summary();
  }

  // --- Discovery ---------------------------------------------------------------

  /** @param {{ quiet?: boolean }} [options] quiet: an automatic rescan, logged in debug */
  async discover({ quiet = false } = {}) {
    const config = this.config;
    this.lastScanAt = this.now();
    const mdnsHosts = await this.scanMdns();
    const knownHosts = [...this.sensors.values()]
      .filter((sensor) => sensor.source === 'local' && sensor.host)
      .map((sensor) => sensor.host);
    const createdHosts = (this.gladys.devices ?? [])
      .filter((device) => uuidOfDevice(this.gladys, device.external_id))
      .map((device) => device.params?.find((param) => param.name === 'HOST')?.value)
      .filter((host) => typeof host === 'string' && host !== '');
    const hosts = [...new Set([...config.hosts, ...mdnsHosts, ...knownHosts, ...createdHosts])];

    const failedHosts = [];
    await mapLimited(hosts, MAX_PARALLEL_HOSTS, async (host) => {
      try {
        await this.probeLocal(host);
      } catch (err) {
        this.logger.debug(`Discovery: ${err.message}`);
        if (config.hosts.includes(host)) {
          failedHosts.push(host);
        }
      }
    });
    await this.discoverCloud();
    this.lastSearch = { failedHosts, invalidHosts: config.invalidHosts };
    const local = [...this.sensors.values()].filter((sensor) => sensor.source === 'local').length;
    this.logger[quiet ? 'debug' : 'info'](
      `Discovery: ${this.sensors.size} Awair sensor(s) (${local} local)`,
    );
  }

  async scanMdns() {
    try {
      const results = await this.gladys.scanNetwork('mdns', {
        timeoutSeconds: SCAN_TIMEOUT_SECONDS,
      });
      this.mdnsState = 'ok';
      this.issues.ok('mdns', 'mDNS discovery works again');
      return awairHostsFromMdns(results);
    } catch (err) {
      // An older core, or a capture the user did not grant: the typed
      // addresses still work.
      this.mdnsState = 'unavailable';
      this.issues.fail('mdns', `mDNS discovery (${MDNS_SERVICE}) unavailable: ${err.message}`);
      return [];
    }
  }

  /** Identify and read the sensor at `host`; registers it as a local sensor. */
  async probeLocal(host) {
    const settings = await this.local.settings(host);
    const reading = await this.local.latest(host);
    const previous = this.sensors.get(settings.uuid);
    if (previous?.host && previous.host !== host && previous.source === 'local') {
      this.logger.info(`${this.label(previous)} moved from ${previous.host} to ${host}`);
    }
    const sensor = previous ?? this.newSensor(settings);
    Object.assign(sensor, {
      source: 'local',
      host,
      firmware: settings.firmware,
      power: settings.power,
      powerReadAt: this.now(),
    });
    this.sensors.set(sensor.uuid, sensor);
    this.acceptReading(sensor, reading);
    return sensor;
  }

  async discoverCloud() {
    const token = this.config.cloudToken;
    this.cloudState = null;
    if (!token) {
      return;
    }
    try {
      this.cloudQuota = await this.cloud.quota(token).catch((err) => {
        if (err.kind === 'auth') {
          throw err;
        }
        return null;
      });
      const devices = await this.cloud.devices(token);
      this.cloudState = 'ok';
      this.issues.ok('cloud', 'Awair cloud answers again');
      for (const device of devices) {
        const known = this.sensors.get(device.uuid);
        if (known) {
          // Local wins; the cloud only brings the name the user gave.
          known.name = known.name ?? device.name;
          continue;
        }
        const sensor = this.newSensor(device);
        Object.assign(sensor, { source: 'cloud', name: device.name });
        this.sensors.set(sensor.uuid, sensor);
        try {
          const reading = await this.cloud.latest(token, sensor);
          if (reading) {
            this.acceptReading(sensor, reading);
          }
        } catch (err) {
          this.logger.debug(`Discovery: ${this.label(sensor)}: ${err.message}`);
        }
      }
    } catch (err) {
      this.cloudState = err.kind === 'auth' ? 'refused' : 'down';
      this.issues.fail('cloud', `Awair cloud: ${err.message}`);
    }
  }

  newSensor({ uuid, deviceType, deviceId, name = null }) {
    return {
      uuid,
      deviceType,
      deviceId,
      name,
      source: null,
      host: null,
      firmware: null,
      power: null,
      powerReadAt: 0,
      reading: null,
      lastPolledAt: undefined,
      failures: 0,
      offline: false,
      backoffUntil: 0,
    };
  }

  /** Publish every sensor that has given at least one reading. */
  async publish() {
    const sensors = [...this.sensors.values()].filter((sensor) => sensor.reading);
    const devices = sensors.map((sensor) => buildDevice(this.gladys, sensor, this.config.language));
    await this.gladys.publishDiscoveredDevices(devices);
    for (const sensor of sensors) {
      this.publishedKeys.set(sensor.uuid, featureKeys(sensor).join(','));
    }
  }

  async reportStatus() {
    const sensors = [...this.sensors.values()];
    if (sensors.length > 0) {
      await this.gladys.setConnectionStatus(true);
    } else if (this.cloudState === 'refused') {
      await this.gladys.setConnectionStatus(false, STATUS.cloudRefused);
    } else {
      await this.gladys.setConnectionStatus(false, STATUS.noSensor);
    }
  }

  // --- Polling -----------------------------------------------------------------

  /** Refresh period of a sensor, in ms. */
  periodOf(sensor) {
    if (sensor.source !== 'cloud') {
      return this.config.localIntervalMs;
    }
    // The cloud quota is a number of calls a day: spread over the cloud
    // sensors the user added, never faster than the configured pace.
    const perDay = this.cloudQuota?.latestPerDay;
    const cloudSensors = Math.max(
      1,
      this.createdSensors().filter((s) => s.source === 'cloud').length,
    );
    const quotaMs = perDay ? Math.ceil((24 * 60 * 60 * 1000 * cloudSensors) / perDay) : 0;
    return Math.max(this.config.cloudIntervalMs, quotaMs);
  }

  /** The known sensors the user added to Gladys. */
  createdSensors() {
    const uuids = new Set(
      (this.gladys.devices ?? []).map((device) => uuidOfDevice(this.gladys, device.external_id)),
    );
    return [...this.sensors.values()].filter((sensor) => uuids.has(sensor.uuid));
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.timers || this.stopped) {
      return;
    }
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        await this.tick();
      } catch (err) {
        this.logger.error(`Polling cycle failed (${err.message})`);
      } finally {
        this.schedule();
      }
    }, TICK_MS);
    this.timer.unref?.();
  }

  /** One timer tick: read every added sensor whose period has elapsed. */
  async tick() {
    if (this.gladys.connected === false) {
      this.logger.debug('Gladys unreachable: poll skipped');
      return;
    }
    await this.pollCreated({ minGap: 0.95 });
  }

  async pollCreated({ force = false, minGap = 0.95 } = {}) {
    await Promise.all(
      this.createdSensors().map((sensor) => this.pollSensor(sensor, { force, minGap })),
    );
  }

  /** The core's onPoll (fallback): reads the sensor unless the timer just did. */
  async pollFromCore(device) {
    const sensor = this.sensorOfDevice(device);
    if (!sensor) {
      this.logger.debug(`onPoll ignored for unknown ${device.external_id}`);
      return;
    }
    await this.pollSensor(sensor, { minGap: 0.9 });
  }

  /** A device was just added in Gladys: send its states now. */
  async onDeviceCreated(device) {
    const sensor = this.sensorOfDevice(device);
    if (!sensor) {
      return;
    }
    this.gladys.forgetPublishedStates?.(device.external_id);
    await this.pollSensor(sensor, { force: true });
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  sensorOfDevice(device) {
    const uuid = uuidOfDevice(this.gladys, device?.external_id);
    return uuid ? (this.sensors.get(uuid) ?? null) : null;
  }

  /**
   * Read one sensor and publish what changed. Never throws: a failure is
   * counted, logged once, and turns into a lost sensor after a few in a row.
   * @returns {Promise<boolean>} whether a reading was published
   */
  async pollSensor(sensor, { force = false, minGap = 0.95 } = {}) {
    const running = this.inFlight.get(sensor.uuid);
    if (running) {
      return running;
    }
    const now = this.now();
    if (
      !force &&
      sensor.lastPolledAt !== undefined &&
      now - sensor.lastPolledAt < this.periodOf(sensor) * minGap
    ) {
      return false;
    }
    if (!force && sensor.backoffUntil > now) {
      return false;
    }
    sensor.lastPolledAt = now;
    const run = this.readAndPublish(sensor).finally(() => this.inFlight.delete(sensor.uuid));
    this.inFlight.set(sensor.uuid, run);
    return run;
  }

  async readAndPublish(sensor) {
    let reading;
    try {
      reading = await this.read(sensor);
    } catch (err) {
      await this.onFailure(sensor, err);
      return false;
    }
    const changedStructure = this.acceptReading(sensor, reading);
    try {
      if (changedStructure) {
        // A measurement the first reading lacked: the device gains a feature
        // (Gladys offers "Update" in the Discovery tab).
        await this.publish();
      }
      await this.gladys.publishChangedStates(buildStates(this.gladys, sensor), {
        heartbeat: HEARTBEAT_MS,
      });
      this.issues.ok(`publish:${sensor.uuid}`, `${this.label(sensor)}: states accepted again`);
    } catch (err) {
      this.issues.fail(
        `publish:${sensor.uuid}`,
        `${this.label(sensor)}: publishing the states failed (${err.message})`,
      );
      return false;
    }
    await this.onSuccess(sensor);
    return true;
  }

  async read(sensor) {
    if (sensor.source === 'cloud') {
      if (!this.config.cloudToken) {
        throw new Error('no cloud token configured');
      }
      const reading = await this.cloud.latest(this.config.cloudToken, sensor);
      if (!reading) {
        throw new Error('no reading sent to the Awair cloud for 10 minutes');
      }
      return reading;
    }
    const reading = await this.local.latest(sensor.host);
    if (sensor.power && this.now() - sensor.powerReadAt >= POWER_REFRESH_MS) {
      try {
        const settings = await this.local.settings(sensor.host);
        if (settings.uuid === sensor.uuid) {
          sensor.power = settings.power;
          sensor.powerReadAt = this.now();
        }
      } catch (err) {
        this.logger.debug(`${this.label(sensor)}: battery not read (${err.message})`);
      }
    }
    return reading;
  }

  /** Store a reading; true when it brings a feature the device lacks. */
  acceptReading(sensor, reading) {
    const previousLevel = sensor.reading ? scoreLevel(sensor.reading.values.score ?? 100) : null;
    sensor.reading = reading;
    const level = reading.values.score !== undefined ? scoreLevel(reading.values.score) : null;
    if (previousLevel !== null && level !== previousLevel) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
    const published = this.publishedKeys.get(sensor.uuid);
    return published !== undefined && published !== featureKeys(sensor).join(',');
  }

  async onSuccess(sensor) {
    sensor.failures = 0;
    sensor.backoffUntil = 0;
    this.issues.ok(sensor.uuid, `${this.label(sensor)}: answers again`);
    if (sensor.offline) {
      sensor.offline = false;
      this.logger.info(`${this.label(sensor)} is back`);
      await this.fireTrigger(TRIGGERS.ONLINE, sensor);
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async onFailure(sensor, err) {
    sensor.failures += 1;
    if (err.kind === 'quota') {
      sensor.backoffUntil = this.now() + QUOTA_BACKOFF_MS;
    }
    this.issues.fail(sensor.uuid, `${this.label(sensor)}: ${err.message}`);
    if (!sensor.offline && sensor.failures >= FAILURES_BEFORE_OFFLINE) {
      sensor.offline = true;
      this.logger.info(`${this.label(sensor)} is lost (${err.message})`);
      await this.fireTrigger(TRIGGERS.OFFLINE, sensor);
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
    if (sensor.source === 'local' && sensor.offline && this.now() - this.lastScanAt >= RESCAN_MS) {
      // Maybe a new DHCP address: the mDNS browse finds it, publish() upserts
      // the HOST param of the device.
      await this.discover({ quiet: true })
        .then(() => this.publish())
        .catch((scanErr) => this.logger.debug(`Rescan failed (${scanErr.message})`));
    }
  }

  async fireTrigger(key, sensor) {
    try {
      await this.gladys.publishSceneEvent(key, {
        device: sensorIds(this.gladys, sensor.uuid).device,
        device_name: this.deviceName(sensor),
      });
    } catch (err) {
      this.logger.warn(`Scene event ${key} refused (${err.message})`);
    }
  }

  // --- Read helpers (widgets, scene actions, reports) ------------------------------

  /** The name the user gave the device in Gladys, else the sensor's. */
  deviceName(sensor) {
    const externalId = sensorIds(this.gladys, sensor.uuid).device;
    const device = (this.gladys.devices ?? []).find((d) => d.external_id === externalId);
    return device?.name ?? sensor.name ?? `${modelName(sensor.deviceType)} ${sensor.deviceId}`;
  }

  /** For the logs: model and id, never more. */
  label(sensor) {
    return `${modelName(sensor.deviceType)} ${sensor.deviceId}`;
  }

  /** What "Search for sensors" reports. */
  summary() {
    return {
      sensors: [...this.sensors.values()].map((sensor) => ({
        name: this.deviceName(sensor),
        model: modelName(sensor.deviceType),
        host: sensor.host,
        source: sensor.source,
        reachable: Boolean(sensor.reading) && !sensor.offline,
      })),
      mdns: this.mdnsState,
      cloud: this.cloudState,
      quota: this.cloudQuota?.latestPerDay ?? null,
      failedHosts: this.lastSearch.failedHosts,
      invalidHosts: this.lastSearch.invalidHosts,
    };
  }
}

async function mapLimited(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      await fn(queue.shift());
    }
  });
  await Promise.all(workers);
}
