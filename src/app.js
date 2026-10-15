// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake Gladys)
// and returns the hub, so index.js stays a few lines and the tests drive the
// very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { Hub } from './hub.js';
import { SEARCH_TEXT, STATUS } from './i18n.js';
import { SCENE_ACTIONS } from './scenes.js';
import { WIDGETS } from './widgets.js';

export const SEARCH_ACTION_KEY = 'search';

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: fetch, local, cloud, timers, now, logger
 */
export function registerHandlers(gladys, options = {}) {
  const logger = options.logger ?? createLogger({ name: 'awair' });
  const hub = new Hub({ gladys, ...options, logger });

  // Resolved once the hub has started; every handler waits for it, so a
  // request arriving during the first discovery is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      // First start or reconnection (Gladys may have restarted and lost the
      // last states): discover, publish, read everything again.
      gladys.forgetPublishedStates?.();
      await hub.start(normalizeConfig(await gladys.getConfig()));
    } catch (err) {
      logger.error(`Initialization failed (${err.message})`);
      await gladys.setConnectionStatus(false, STATUS.initFailed).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.on('disconnected', () => hub.stop());

  gladys.onScanRequest(
    whenReady(async () => {
      logger.info('Search requested from the Discovery tab');
      await hub.rediscover();
    }),
  );

  gladys.onPoll(whenReady((device) => hub.pollFromCore(device)));

  gladys.onDeviceCreated(whenReady((device) => hub.onDeviceCreated(device)));
  gladys.onDeviceUpdated(whenReady((device) => hub.onDeviceCreated(device)));

  gladys.onConfigUpdated(
    whenReady(async (newConfig) => {
      logger.info('New configuration received');
      await hub.reconfigure(normalizeConfig(newConfig));
    }),
  );

  gladys.onAction(
    SEARCH_ACTION_KEY,
    whenReady(async () => {
      logger.info('Search requested from the Configuration screen');
      return searchMessage(await hub.rediscover());
    }),
  );

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(
      key,
      whenReady((fields) => handler(hub, { fields })),
    );
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(hub, request)),
    );
  }

  return {
    hub,
    ready,
    stop: () => hub.stop(),
  };
}

/** The report shown under the "Search for sensors" button, in every language. */
export function searchMessage(summary) {
  return Object.fromEntries(
    Object.entries(SEARCH_TEXT).map(([language, text]) => [language, searchReport(summary, text)]),
  );
}

function searchReport({ sensors, mdns, cloud, quota, failedHosts, invalidHosts }, text) {
  const lines = [];
  if (sensors.length === 0) {
    lines.push(text.none);
  } else {
    const reachable = sensors.filter((sensor) => sensor.reachable).length;
    lines.push(text.count(sensors.length, reachable));
    const list = sensors.map(({ name, model, host, source, reachable: up }) => {
      const where = source === 'local' ? `${text.local} ${host}` : text.cloud;
      return `${name} (${model}, ${up ? where : text.unreachable})`;
    });
    lines.push(`${list.join(', ')}.`);
  }
  if (mdns === 'unavailable') {
    lines.push(text.noMdns);
  }
  if (failedHosts.length > 0) {
    lines.push(text.failed(failedHosts.slice(0, 3).join(', ')));
  }
  if (invalidHosts.length > 0) {
    lines.push(text.ignored(invalidHosts.slice(0, 3).join(', ')));
  }
  if (cloud === 'ok') {
    lines.push(text.cloudOk(quota));
  } else if (cloud === 'refused') {
    lines.push(text.cloudRefused);
  } else if (cloud === 'down') {
    lines.push(text.cloudDown);
  }
  return lines.join(' ');
}
