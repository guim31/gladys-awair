# Awair fixtures

Real answers of Awair sensors and of the Awair developer API, recorded by
other projects, anonymized (MAC addresses, Wi-Fi name, IP addresses, user
identity) and kept as close to the originals as possible.

| File                          | Source                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `local-element-settings.json` | Home Assistant `tests/components/awair/fixtures/local_devices.json` (Apache-2.0), Wi-Fi name and MAC replaced                  |
| `local-element-latest.json`   | Home Assistant `awair-local.json`, unchanged                                                                                   |
| `local-element-latest-2.json` | python_awair `tests/fixtures/cassettes/latest_local.yaml` (MIT), Element firmware 1.1.5                                        |
| `local-omni-settings.json`    | python_awair `local_backplate.yaml`: Omni with Ethernet backplate, firmware 1.8.1, served as `text/html`; MAC and IPs replaced |
| `local-omni-latest.json`      | python_awair `latest_local_backplate.yaml`, unchanged                                                                          |
| `cloud-latest-*.json`         | Home Assistant `awair.json`, `awair-r2.json`, `glow.json`, `mint.json`, `omni.json`, `awair-offline.json`, unchanged           |
| `cloud-devices.json`          | Home Assistant `cloud_devices.json`, MAC and ids replaced, two entries added in the same shape                                 |
| `cloud-user.json`             | Home Assistant `user.json`, identity replaced; `LATEST` usage and the Hobbyist quotas set by hand (illustrative values)        |
