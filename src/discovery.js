// -----------------------------------------------------------------------------
// mDNS discovery, mediated by the Gladys core (the container sits on a bridge
// network that multicast never reaches, see the manifest `network_discovery`).
//
// Awair sensors announce a web server, `_http._tcp`, under an instance name
// that starts with "AWAIR" (AWAIR-ELEM-1419E1, awair-omni-18959-backplate...),
// the pattern Home Assistant matches too. Every other web server of the
// network answers the same browse: only the Awair names are kept, and each is
// then confirmed by its own settings page before becoming a device.
// -----------------------------------------------------------------------------

import { isIP } from 'node:net';

export const MDNS_SERVICE = '_http._tcp';
export const SCAN_TIMEOUT_SECONDS = 5;

/**
 * The addresses of the Awair sensors in a raw mDNS scan result.
 * @param {Array<{ name?: string, host?: string, addresses?: string[], port?: number }>} results
 * @returns {string[]} hosts, "ip" or "ip:port"
 */
export function awairHostsFromMdns(results) {
  const hosts = [];
  for (const result of Array.isArray(results) ? results : []) {
    const label = `${result?.name ?? ''} ${result?.host ?? ''}`;
    if (!/(^|\s)awair/i.test(label)) {
      continue;
    }
    // A .local host name does not resolve inside the container: the IPv4
    // address the core captured is the only usable one.
    const address = (result.addresses ?? []).find((candidate) => isIP(candidate) === 4);
    if (!address) {
      continue;
    }
    const host = result.port && result.port !== 80 ? `${address}:${result.port}` : address;
    if (!hosts.includes(host)) {
      hosts.push(host);
    }
  }
  return hosts;
}
