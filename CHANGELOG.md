# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-15

### Added

- Awair air quality monitors (Element, Omni, 2nd Edition, Mint, Glow C) read
  over their Local API, one Gladys device per sensor: Awair score, air quality
  band (good, fair, poor), temperature, humidity, CO2, VOC, PM2.5, PM10, light,
  noise, dew point and the Omni battery, depending on the model.
- Automatic discovery through the mDNS relay of Gladys, IP addresses typed by
  hand, and a "Search for sensors" button that reports what was found.
- Optional Awair cloud token for the sensors without a Local API
  (first-generation Awair, Glow), read at the pace the daily quota allows.
- Dashboard widget "Air quality": score gauge, CO2, PM2.5, temperature,
  humidity, band and connection.
- Scene triggers "Awair sensor lost" and "Awair sensor back", and the scene
  action "Read the air quality", which returns a ready-made sentence and the
  values.
- English, French, German and Spanish for every text, and a user guide in the
  four languages.

[Unreleased]: https://github.com/guim31/gladys-awair/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-awair/releases/tag/v1.0.1
