# Awair for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration for the
**Awair** indoor air quality monitors: Awair Element, Omni, 2nd Edition, Mint
and Glow C over their **Local API**, and, as an option, the sensors without a
Local API (first-generation Awair, Glow) through the Awair cloud.

> **Developed without the hardware: feedback welcome.** Everything was built
> from the Awair API documentation and from real answers of Awair sensors
> recorded by other open-source projects (see [Credits](#credits)). If your
> sensor behaves differently, please open an issue with the output of
> `node scripts/probe.mjs <ip>` (it prints nothing sensitive).

## Features

- **One Gladys device per sensor**, with the measurements it actually reports:
  Awair score, an air quality band (good / fair / poor, colored on the
  dashboard), temperature, humidity, CO2, VOC, PM2.5, PM10, light and noise
  (Omni, Mint), dew point, and the Omni battery. Measured values are preferred
  to the estimated ones when the sensor gives both.
- **Automatic discovery** through the mDNS relay of the Gladys core
  (`_http._tcp`, instance names starting with `AWAIR`), plus IP addresses typed
  by hand. A sensor that changes address is found again.
- **Read only**: nothing is ever written to a sensor or an account.
- **Dashboard widget** "Air quality": the score as a gauge, CO2, PM2.5,
  temperature and humidity as live tiles, the band and the connection.
- **Scene triggers** "Awair sensor lost" / "Awair sensor back", and the
  **scene action** "Read the air quality", which returns a ready-made sentence
  ("Office: air quality good (score 92/100), CO2 650 ppm…") and the values.
- Four languages (English, French, German, Spanish) for every text.

## Requirements

- Gladys Assistant **5.1.0** or later.
- The **Local API enabled** on each sensor, in the Awair Home app: open the
  sensor, **Awair+** → **Awair APIs** → **Local API**.
- Optional, for sensors without a Local API: an access token from the
  [Awair developer console](https://developer.getawair.com/). The free Hobbyist
  tier allows 300 "latest" calls a day, so a cloud sensor is
  read every 5 minutes at best.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter
   `https://github.com/guim31/gladys-awair` (or install **Awair** from the
   catalog once it is listed). The install screen shows the mDNS discovery
   request.
2. In **Configuration**, click **Search for sensors**.
3. Open the **Discovery** tab and add your sensors.
4. A sensor is missing? Enter its IP address in **Configuration** and search
   again. A DHCP reservation in your router helps.

The user guide, in four languages, is in [`docs/`](docs/en.md)
([fr](docs/fr.md), [de](docs/de.md), [es](docs/es.md)); Gladys links it from
the Configuration screen.

## How it works

- **Local API** (plain HTTP, no authentication): `GET /settings/config/data`
  (or `/settings/data` on newer Omni firmwares) for the identity, the firmware
  and the Omni battery, `GET /air-data/latest` for the readings, which the
  sensor refreshes every 10 seconds. The Omni Ethernet backplate answers JSON
  with a `text/html` content type: the body is parsed whatever the header says.
- **Cloud API** (`https://developer-apis.awair.is/v1`, bearer token): the
  account's sensors and their latest readings, at the pace the account's daily
  quota allows, with an hour of pause after an HTTP 429. A sensor reachable
  locally is always read locally.
- **Identity**: the device UUID (`awair-element_24947`) names the sensor in both
  APIs; it is the Gladys external id (`awair:<uuid>`), so a sensor found both
  ways is one device.
- **Refreshing**: the container runs its own timer (the Gladys core does not
  reliably poll external devices, GladysAssistant/Gladys#3198); the core's
  `onPoll` stays as a fallback. Only changed values are published, every value
  at least every 6 hours.
- **Logs**: a normal cycle writes nothing at info level. A sensor that stops
  answering writes one warning; its loss (three failed reads) and its return,
  one info line each. `LOG_LEVEL=debug` shows the rest. No token is ever logged.

## Limitations

- The Wi-Fi signal strength is not exposed by the Local API, so there is no
  signal feature.
- Only the Local API answers of the Element and the Omni could be checked
  against real recordings; the 2nd Edition, Mint and Glow C are expected to
  answer the same way.
- The first-generation Awair and the Glow have no Local API: cloud only.
- The display, LED and other sensor settings are not exposed (read only by
  design).

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
node scripts/probe.mjs 192.168.1.40   # a real sensor's Local API, read only
node scripts/probe.mjs --cloud        # the cloud API, with a fake token (expects a refusal)
```

The tests run against the SDK's fake Gladys (`@gladysassistant/integration-sdk/testing`)
and fake Awair sensors built from recorded answers (`test/fixtures/awair/`), one
of them behind a real HTTP server; they never touch the network.
`test/gladys-rules.test.js` checks every discovered device against the
category/type table of the Gladys core.

Releases go through **Actions → Release** (see `CLAUDE.md`). The hand-pushed
tag path (`git tag vX.Y.Z && git push --tags`) builds the image too, but only
after bumping `version` in `package.json` and in the manifest (with the
`docker_image` tag) by hand.

## Credits

- [python_awair](https://github.com/ahayworth/python_awair) by Andrew Hayworth
  and contributors (MIT): the Local and cloud API shapes, and the recorded
  answers reused (anonymized) in `test/fixtures/awair/`.
- Home Assistant's
  [`awair`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/awair)
  integration (Apache-2.0): the mDNS pattern, the absolute-over-estimated
  choice, the handling of the first-generation dust sensor and its test
  fixtures.
- [homebridge-awair2](https://github.com/DMBlakeley/homebridge-awair2) by
  Douglas Blakeley (Apache-2.0): the cloud quota tiers and the Omni battery.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Awair. "Awair" is
a trademark of its owner.

## License

Apache-2.0, see [`LICENSE`](LICENSE).
