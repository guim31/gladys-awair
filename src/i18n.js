// -----------------------------------------------------------------------------
// Every text the integration produces, in the four languages of the Gladys
// interface. German says "du", Spanish "usted" (test/i18n.test.js checks it).
// Feature names are frozen when the user adds the device: they follow the
// `language` of the configuration at that moment.
// -----------------------------------------------------------------------------

export const FEATURE_NAMES = {
  en: {
    score: 'Awair score',
    air_quality: 'Air quality',
    temperature: 'Temperature',
    humidity: 'Humidity',
    co2: 'CO2',
    voc: 'VOC',
    pm25: 'PM2.5',
    pm10: 'PM10',
    dust: 'Dust (PM2.5-PM10)',
    illuminance: 'Light',
    noise: 'Noise',
    dew_point: 'Dew point',
    battery: 'Battery',
    plugged: 'Plugged in',
  },
  fr: {
    score: 'Score Awair',
    air_quality: "Qualité de l'air",
    temperature: 'Température',
    humidity: 'Humidité',
    co2: 'CO2',
    voc: 'COV',
    pm25: 'PM2.5',
    pm10: 'PM10',
    dust: 'Poussières (PM2.5-PM10)',
    illuminance: 'Luminosité',
    noise: 'Bruit',
    dew_point: 'Point de rosée',
    battery: 'Batterie',
    plugged: 'Sur secteur',
  },
  de: {
    score: 'Awair-Score',
    air_quality: 'Luftqualität',
    temperature: 'Temperatur',
    humidity: 'Luftfeuchtigkeit',
    co2: 'CO2',
    voc: 'VOC',
    pm25: 'PM2.5',
    pm10: 'PM10',
    dust: 'Staub (PM2.5-PM10)',
    illuminance: 'Helligkeit',
    noise: 'Lärm',
    dew_point: 'Taupunkt',
    battery: 'Akku',
    plugged: 'Am Stromnetz',
  },
  es: {
    score: 'Puntuación Awair',
    air_quality: 'Calidad del aire',
    temperature: 'Temperatura',
    humidity: 'Humedad',
    co2: 'CO2',
    voc: 'COV',
    pm25: 'PM2.5',
    pm10: 'PM10',
    dust: 'Polvo (PM2.5-PM10)',
    illuminance: 'Luminosidad',
    noise: 'Ruido',
    dew_point: 'Punto de rocío',
    battery: 'Batería',
    plugged: 'Conectado a la red',
  },
};

/** The Awair score bands (see scoreLevel in src/awair/model.js). */
export const LEVEL_NAMES = {
  en: { good: 'Good', fair: 'Fair', poor: 'Poor' },
  fr: { good: 'Bonne', fair: 'Moyenne', poor: 'Mauvaise' },
  de: { good: 'Gut', fair: 'Mäßig', poor: 'Schlecht' },
  es: { good: 'Buena', fair: 'Regular', poor: 'Mala' },
};

/** Connection status shown in the Configuration screen. */
export const STATUS = {
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  noSensor: {
    en: 'No Awair sensor found yet: enable the Local API, then use "Search for sensors".',
    fr: 'Aucun capteur Awair trouvé : activez la Local API, puis « Rechercher les capteurs ».',
    de: 'Noch kein Awair-Sensor gefunden: Aktiviere die Local API, dann „Sensoren suchen“.',
    es: 'Ningún sensor Awair encontrado: active la Local API y luego «Buscar sensores».',
  },
  cloudRefused: {
    en: 'The Awair cloud refused the token: check it in the configuration.',
    fr: 'Le cloud Awair a refusé le jeton : vérifiez-le dans la configuration.',
    de: 'Die Awair-Cloud hat das Token abgelehnt: Prüfe es in der Konfiguration.',
    es: 'La nube de Awair ha rechazado el token: compruébelo en la configuración.',
  },
};

/** Pieces of the report shown under the "Search for sensors" button. */
export const SEARCH_TEXT = {
  en: {
    none: 'No Awair sensor found.',
    count: (total, reachable) => `${total} sensor(s), ${reachable} answering:`,
    local: 'local',
    cloud: 'cloud',
    unreachable: 'unreachable',
    noMdns: 'Automatic discovery (mDNS) through Gladys is unavailable: enter the IP addresses.',
    ignored: (list) => `Ignored addresses: ${list}.`,
    failed: (list) => `No Awair answer from: ${list}.`,
    cloudOk: (quota) =>
      quota ? `Cloud token accepted (${quota} calls a day).` : 'Cloud token accepted.',
    cloudRefused: 'The Awair cloud refused the token.',
    cloudDown: 'The Awair cloud did not answer.',
  },
  fr: {
    none: 'Aucun capteur Awair trouvé.',
    count: (total, reachable) => `${total} capteur(s), ${reachable} répondent :`,
    local: 'local',
    cloud: 'cloud',
    unreachable: 'injoignable',
    noMdns:
      'La découverte automatique (mDNS) par Gladys est indisponible : saisissez les adresses IP.',
    ignored: (list) => `Adresses ignorées : ${list}.`,
    failed: (list) => `Pas de réponse Awair de : ${list}.`,
    cloudOk: (quota) =>
      quota ? `Jeton cloud accepté (${quota} appels par jour).` : 'Jeton cloud accepté.',
    cloudRefused: 'Le cloud Awair a refusé le jeton.',
    cloudDown: "Le cloud Awair n'a pas répondu.",
  },
  de: {
    none: 'Kein Awair-Sensor gefunden.',
    count: (total, reachable) => `${total} Sensor(en), davon ${reachable} erreichbar:`,
    local: 'lokal',
    cloud: 'Cloud',
    unreachable: 'nicht erreichbar',
    noMdns:
      'Die automatische Erkennung (mDNS) über Gladys ist nicht verfügbar: Gib die IP-Adressen ein.',
    ignored: (list) => `Ignorierte Adressen: ${list}.`,
    failed: (list) => `Keine Awair-Antwort von: ${list}.`,
    cloudOk: (quota) =>
      quota ? `Cloud-Token akzeptiert (${quota} Abrufe pro Tag).` : 'Cloud-Token akzeptiert.',
    cloudRefused: 'Die Awair-Cloud hat das Token abgelehnt.',
    cloudDown: 'Die Awair-Cloud hat nicht geantwortet.',
  },
  es: {
    none: 'No se ha encontrado ningún sensor Awair.',
    count: (total, reachable) => `${total} sensor(es), ${reachable} responden:`,
    local: 'local',
    cloud: 'nube',
    unreachable: 'inaccesible',
    noMdns:
      'El descubrimiento automático (mDNS) a través de Gladys no está disponible: introduzca las direcciones IP.',
    ignored: (list) => `Direcciones ignoradas: ${list}.`,
    failed: (list) => `Sin respuesta Awair de: ${list}.`,
    cloudOk: (quota) =>
      quota
        ? `Token de la nube aceptado (${quota} llamadas al día).`
        : 'Token de la nube aceptado.',
    cloudRefused: 'La nube de Awair ha rechazado el token.',
    cloudDown: 'La nube de Awair no ha respondido.',
  },
};

/** Texts of the dashboard widget (short: tiles and status rows). */
export const WIDGET_TEXT = {
  en: {
    pick: 'Choose an Awair sensor in the widget settings.',
    unknown: 'This sensor is not known to the integration (yet): run a search.',
    level: 'Air quality',
    connection: 'Connection',
    local: 'Local',
    cloud: 'Cloud',
    unreachable: 'Unreachable',
    waiting: 'Waiting',
  },
  fr: {
    pick: 'Choisissez un capteur Awair dans les réglages du widget.',
    unknown: "Ce capteur est inconnu de l'intégration : lancez une recherche.",
    level: "Qualité de l'air",
    connection: 'Connexion',
    local: 'Locale',
    cloud: 'Cloud',
    unreachable: 'Injoignable',
    waiting: 'En attente',
  },
  de: {
    pick: 'Wähle einen Awair-Sensor in den Widget-Einstellungen.',
    unknown: 'Dieser Sensor ist der Integration (noch) unbekannt: Starte eine Suche.',
    level: 'Luftqualität',
    connection: 'Verbindung',
    local: 'Lokal',
    cloud: 'Cloud',
    unreachable: 'Nicht erreichbar',
    waiting: 'Warten',
  },
  es: {
    pick: 'Elija un sensor Awair en los ajustes del widget.',
    unknown: 'La integración no conoce (todavía) este sensor: lance una búsqueda.',
    level: 'Calidad del aire',
    connection: 'Conexión',
    local: 'Local',
    cloud: 'Nube',
    unreachable: 'Inaccesible',
    waiting: 'En espera',
  },
};

/** The one-line summary returned by the "Read the air quality" scene action. */
export const SUMMARY_TEXT = {
  en: {
    head: (name, level, score) => `${name}: air quality ${level} (score ${score}/100)`,
    co2: (value) => `CO2 ${value} ppm`,
    pm25: (value) => `PM2.5 ${value} µg/m³`,
    temperature: (value) => `${value} °C`,
    humidity: (value) => `${value} % humidity`,
    noReading: (name) => `${name}: no recent reading from the sensor.`,
    unknown: 'This device is not an Awair sensor known to the integration.',
  },
  fr: {
    head: (name, level, score) => `${name} : qualité de l'air ${level} (score ${score}/100)`,
    co2: (value) => `CO2 ${value} ppm`,
    pm25: (value) => `PM2.5 ${value} µg/m³`,
    temperature: (value) => `${value} °C`,
    humidity: (value) => `${value} % d'humidité`,
    noReading: (name) => `${name} : pas de mesure récente du capteur.`,
    unknown: "Cet appareil n'est pas un capteur Awair connu de l'intégration.",
  },
  de: {
    head: (name, level, score) => `${name}: Luftqualität ${level} (Score ${score}/100)`,
    co2: (value) => `CO2 ${value} ppm`,
    pm25: (value) => `PM2.5 ${value} µg/m³`,
    temperature: (value) => `${value} °C`,
    humidity: (value) => `${value} % Luftfeuchtigkeit`,
    noReading: (name) => `${name}: keine aktuelle Messung des Sensors.`,
    unknown: 'Dieses Gerät ist kein Awair-Sensor, den die Integration kennt.',
  },
  es: {
    head: (name, level, score) => `${name}: calidad del aire ${level} (puntuación ${score}/100)`,
    co2: (value) => `CO2 ${value} ppm`,
    pm25: (value) => `PM2.5 ${value} µg/m³`,
    temperature: (value) => `${value} °C`,
    humidity: (value) => `${value} % de humedad`,
    noReading: (name) => `${name}: sin medición reciente del sensor.`,
    unknown: 'Este dispositivo no es un sensor Awair conocido por la integración.',
  },
};
