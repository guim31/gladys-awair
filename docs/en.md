# Awair

## Overview

This integration brings the **Awair** air quality monitors into Gladys: Awair
Element, Awair Omni, Awair 2nd Edition, Awair Mint and Awair Glow C, read on
your own network through their **Local API**. Each sensor becomes a Gladys
device with its Awair score, temperature, humidity, CO2, VOC, fine particles
and, depending on the model, light and noise.

Sensors without a Local API (first-generation Awair, Awair Glow) can be read
through the Awair cloud with a developer token, as an option.

Everything is read only: the integration never changes a setting of your
sensors.

> Developed without the hardware: feedback welcome. The integration was built
> from the Awair API documentation and from real answers of the sensors
> recorded by other open-source projects. If something looks wrong with your
> model, open an issue on the GitHub repository.

This integration is not affiliated with Awair.

## Requirements

- Gladys Assistant 5.1.0 or later.
- For each sensor, the **Local API enabled** in the Awair Home app: open the
  sensor, then **Awair+** → **Awair APIs** → **Local API**, and enable it.
- The sensors on the same network as Gladys. A fixed IP address (DHCP
  reservation in your router) is recommended but not required.
- Optional: an Awair developer token, only for the sensors without a Local API.

## Configuration

Open **Integrations** → **Awair** → **Configuration**.

1. Click **Search for sensors**. The integration asks Gladys to browse the
   network (mDNS) and reads every Awair sensor it finds. The report under the
   button lists them, with their address.
2. Open the **Discovery** tab and add the sensors you want in Gladys.

| Setting                     | Use                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Sensor IP addresses         | Only for a sensor the search does not find. Several addresses separated by commas.                       |
| Local refresh interval      | 10 s, 30 s (default), 1 min or 5 min. The sensor itself updates its values every 10 seconds.             |
| Awair access token          | Optional. Token of the Awair developer console, for the sensors without a Local API.                     |
| Cloud refresh interval      | 5 min (default), 10, 15 or 30 min.                                                                       |
| Language of the integration | Names of the features of the devices added afterwards, and texts of the scene action. French by default. |

### Awair cloud quota

The Awair developer API counts the calls per day. The Hobbyist tier, the free
one, allows **300 "latest" calls a day**: 5 minutes between two readings of a
sensor is the fastest pace that stays within it. The integration reads the
quota of your account and never goes faster than it allows, spread over all
your cloud sensors. If the API still answers "quota exceeded", the sensor is
left alone for an hour. A sensor reachable through the Local API is always
read locally, and costs no quota.

## Devices

One device per sensor, named after its model until you rename it. Its features
are the measurements the sensor actually reports; as a guide:

| Feature     | Unit   | Models                                                  |
| ----------- | ------ | ------------------------------------------------------- |
| Awair score | 0-100  | all                                                     |
| Air quality | band   | all: good (80+), fair (60-79), poor (below 60)          |
| Temperature | °C     | all                                                     |
| Humidity    | %      | all                                                     |
| CO2         | ppm    | Element, Omni, 2nd Edition, Glow, first generation      |
| VOC         | ppb    | all                                                     |
| PM2.5       | µg/m³  | Element, Omni, 2nd Edition, Mint                        |
| PM10        | µg/m³  | Element and 2nd Edition (value estimated by the sensor) |
| Dust        | µg/m³  | first generation (one sensor for PM2.5 and PM10)        |
| Light       | lux    | Omni, Mint                                              |
| Noise       | dBA    | Omni                                                    |
| Dew point   | °C     | Element (Local API)                                     |
| Battery     | %      | Omni (Local API)                                        |
| Plugged in  | yes/no | Omni (Local API)                                        |

When the sensor gives both a measured and an estimated value (CO2, PM10), the
measured one is used. The **Air quality** band is shown in color on the
dashboard: green, yellow, orange.

The values only changing are sent to Gladys, plus every value at least every
6 hours so that none looks old.

## Dashboard widget

**Air quality**: choose a sensor in the widget settings. The widget shows the
Awair score as a gauge, CO2, PM2.5 (or dust), temperature and humidity as live
tiles, then the air quality band and the connection (local, cloud or
unreachable).

## Scene triggers

- **Awair sensor lost**: the sensor stopped answering, three failed readings in
  a row (unplugged, out of Wi-Fi, Local API disabled). Choose one sensor or
  leave the field empty for all. The scene receives the sensor name.
- **Awair sensor back**: a sensor counted as lost answers again.

The values themselves (score, CO2...) need no trigger: use the standard
"device value" trigger of Gladys on the device features.

## Scene action

**Read the air quality**: reads the sensor at once and gives the next actions
of the scene:

- `summary`: a ready-made sentence, for example "Office: air quality good
  (score 92/100), CO2 650 ppm, PM2.5 3 µg/m³, 21.5 °C, 45 % humidity.";
- `score`, `co2`, `pm25`, `temperature`, `humidity`: the values;
- `level`: `good`, `fair` or `poor`, to compare in a condition.

The sentence follows the language of the integration configuration.

## Scene examples

- **Open the windows**: trigger "device value" on CO2 above 1200 ppm → send a
  message "Time to air the room".
- **Morning report**: every day at 7:30 → action "Read the air quality" →
  send a message with `summary`.
- **Ventilation**: when the Air quality band becomes "poor" → turn on the
  ventilation plug; when it is back to "good" → turn it off.
- **Watch the sensor**: trigger "Awair sensor lost" → send a message with the
  sensor name.

## Troubleshooting

- **No sensor found**: check that the Local API is enabled in the Awair Home
  app, then enter the IP address of the sensor in the configuration. The
  address is shown in the Awair Home app, or in your router.
- **"Automatic discovery (mDNS) through Gladys is unavailable"**: your Gladys
  does not relay mDNS. Enter the IP addresses.
- **A sensor changed address**: the integration searches again by itself when
  a sensor stops answering, at most every 10 minutes. You can also click
  **Search for sensors**.
- **"The Awair cloud refused the token"**: copy the token again from the Awair
  developer console.
- **Logs**: the integration only writes what matters. For every reading, set
  the environment variable `LOG_LEVEL=debug`.

## Limits

- Read only: the display, the LED and the other settings of the sensor stay
  in the Awair Home app.
- The Wi-Fi signal of the sensor is not available: the Local API does not give
  it.
- The first-generation Awair and the Awair Glow have no Local API: they need
  the cloud token, and are read every 5 minutes at best.
- Only the Local API answers of the Element and of the Omni could be checked
  against real recordings; the other models are expected to answer the same
  way.
- Feature names are set when the device is added: changing the language later
  does not rename them.
