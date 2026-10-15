# Awair

## Überblick

Diese Integration bringt die Luftqualitätssensoren von **Awair** in Gladys:
Awair Element, Awair Omni, Awair 2nd Edition, Awair Mint und Awair Glow C,
gelesen in deinem eigenen Netzwerk über ihre **Local API**. Jeder Sensor wird
ein Gladys-Gerät mit seinem Awair-Score, Temperatur, Luftfeuchtigkeit, CO2, VOC,
Feinstaub und, je nach Modell, Helligkeit und Lärm.

Sensoren ohne Local API (Awair der ersten Generation, Awair Glow) können
optional über die Awair-Cloud mit einem Entwickler-Token gelesen werden.

Alles ist schreibgeschützt: Die Integration ändert nie eine Einstellung deiner
Sensoren.

> Ohne die Hardware entwickelt: Rückmeldungen sind willkommen. Die Integration
> wurde anhand der Dokumentation der Awair-API und echter Antworten der
> Sensoren geschrieben, die andere Open-Source-Projekte aufgezeichnet haben.
> Wenn bei deinem Modell etwas falsch aussieht, öffne ein Issue im
> GitHub-Repository.

Diese Integration steht in keiner Verbindung zu Awair.

## Voraussetzungen

- Gladys Assistant 5.1.0 oder neuer.
- Für jeden Sensor die **aktivierte Local API** in der App Awair Home: Öffne
  den Sensor, dann **Awair+** → **Awair APIs** → **Local API**, und aktiviere
  sie.
- Die Sensoren im selben Netzwerk wie Gladys. Eine feste IP-Adresse
  (DHCP-Reservierung im Router) wird empfohlen, ist aber nicht nötig.
- Optional: ein Awair-Entwickler-Token, nur für Sensoren ohne Local API.

## Konfiguration

Öffne **Integrationen** → **Awair** → **Konfiguration**.

1. Klicke auf **Sensoren suchen**. Die Integration lässt Gladys das Netzwerk
   durchsuchen (mDNS) und liest jeden gefundenen Awair-Sensor. Der Bericht
   unter der Schaltfläche listet sie mit ihrer Adresse auf.
2. Öffne den Tab **Entdecken** und füge die gewünschten Sensoren zu Gladys
   hinzu.

| Einstellung                      | Zweck                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| IP-Adressen der Sensoren         | Nur für einen Sensor, den die Suche nicht findet. Mehrere Adressen durch Kommas getrennt.             |
| Lokales Aktualisierungsintervall | 10 s, 30 s (Standard), 1 min oder 5 min. Der Sensor selbst aktualisiert seine Werte alle 10 Sekunden. |
| Awair-Zugangstoken               | Optional. Token der Awair-Entwicklerkonsole, für Sensoren ohne Local API.                             |
| Cloud-Aktualisierungsintervall   | 5 min (Standard), 10, 15 oder 30 min.                                                                 |
| Sprache der Integration          | Namen der Funktionen danach hinzugefügter Geräte und Texte der Szenenaktion. Standard: Französisch.   |

### Kontingent der Awair-Cloud

Die Awair-Entwickler-API zählt die Abrufe pro Tag. Die kostenlose Stufe
Hobbyist erlaubt **300 „latest“-Abrufe pro Tag**: 5 Minuten zwischen zwei
Messungen eines Sensors ist das schnellste Tempo, das darin bleibt. Die
Integration liest das Kontingent deines Kontos und ist nie schneller, als es
erlaubt, verteilt auf alle deine Cloud-Sensoren. Antwortet die API trotzdem
„Kontingent überschritten“, wird der Sensor eine Stunde in Ruhe gelassen. Ein
über die Local API erreichbarer Sensor wird immer lokal gelesen und verbraucht
kein Kontingent.

## Geräte

Ein Gerät pro Sensor, nach seinem Modell benannt, bis du es umbenennst. Seine
Funktionen sind die Messwerte, die der Sensor tatsächlich liefert; als
Anhaltspunkt:

| Funktion         | Einheit | Modelle                                               |
| ---------------- | ------- | ----------------------------------------------------- |
| Awair-Score      | 0-100   | alle                                                  |
| Luftqualität     | Stufe   | alle: gut (80+), mäßig (60-79), schlecht (unter 60)   |
| Temperatur       | °C      | alle                                                  |
| Luftfeuchtigkeit | %       | alle                                                  |
| CO2              | ppm     | Element, Omni, 2nd Edition, Glow, erste Generation    |
| VOC              | ppb     | alle                                                  |
| PM2.5            | µg/m³   | Element, Omni, 2nd Edition, Mint                      |
| PM10             | µg/m³   | Element und 2nd Edition (vom Sensor geschätzter Wert) |
| Staub            | µg/m³   | erste Generation (ein Sensor für PM2.5 und PM10)      |
| Helligkeit       | lux     | Omni, Mint                                            |
| Lärm             | dBA     | Omni                                                  |
| Taupunkt         | °C      | Element (Local API)                                   |
| Akku             | %       | Omni (Local API)                                      |
| Am Stromnetz     | ja/nein | Omni (Local API)                                      |

Liefert der Sensor sowohl einen gemessenen als auch einen geschätzten Wert
(CO2, PM10), wird der gemessene verwendet. Die Stufe **Luftqualität** wird auf
dem Dashboard farbig angezeigt: grün, gelb, orange.

Nur sich ändernde Werte werden an Gladys gesendet, dazu jeder Wert mindestens
alle 6 Stunden, damit keiner veraltet wirkt.

## Dashboard-Widget

**Luftqualität**: Wähle einen Sensor in den Widget-Einstellungen. Das Widget
zeigt den Awair-Score als Anzeige, CO2, PM2.5 (oder Staub), Temperatur und
Luftfeuchtigkeit als Live-Kacheln, dann die Luftqualitätsstufe und die
Verbindung (lokal, Cloud oder nicht erreichbar).

## Szenenauslöser

- **Awair-Sensor verloren**: Der Sensor antwortet nicht mehr, drei
  fehlgeschlagene Messungen in Folge (ausgesteckt, kein WLAN, Local API
  deaktiviert). Wähle einen Sensor oder lass das Feld für alle leer. Die Szene
  erhält den Namen des Sensors.
- **Awair-Sensor wieder da**: Ein als verloren gezählter Sensor antwortet
  wieder.

Die Werte selbst (Score, CO2 …) brauchen keinen Auslöser: Nutze den normalen
Gladys-Auslöser „Gerätewert“ auf den Funktionen des Geräts.

## Szenenaktion

**Luftqualität lesen**: Liest den Sensor sofort und gibt den nächsten Aktionen
der Szene:

- `summary`: einen fertigen Satz, zum Beispiel „Büro: Luftqualität gut (Score
  92/100), CO2 650 ppm, PM2.5 3 µg/m³, 21,5 °C, 45 % Luftfeuchtigkeit.“;
- `score`, `co2`, `pm25`, `temperature`, `humidity`: die Werte;
- `level`: `good`, `fair` oder `poor`, zum Vergleichen in einer Bedingung.

Der Satz folgt der Sprache der Integrationskonfiguration.

## Szenenbeispiele

- **Fenster öffnen**: Auslöser „Gerätewert“ auf CO2 über 1200 ppm → Nachricht
  „Zeit zum Lüften“ senden.
- **Morgenbericht**: jeden Tag um 7:30 → Aktion „Luftqualität lesen“ →
  Nachricht mit `summary` senden.
- **Lüftung**: Wenn die Stufe Luftqualität auf „schlecht“ wechselt → die
  Steckdose der Lüftung einschalten; wenn sie wieder „gut“ ist → ausschalten.
- **Sensor überwachen**: Auslöser „Awair-Sensor verloren“ → Nachricht mit dem
  Namen des Sensors senden.

## Fehlerbehebung

- **Kein Sensor gefunden**: Prüfe, dass die Local API in der App Awair Home
  aktiviert ist, und gib dann die IP-Adresse des Sensors in der Konfiguration
  ein. Die Adresse steht in der App Awair Home oder in deinem Router.
- **„Die automatische Erkennung (mDNS) über Gladys ist nicht verfügbar“**:
  Dein Gladys leitet mDNS nicht weiter. Gib die IP-Adressen ein.
- **Ein Sensor hat die Adresse gewechselt**: Die Integration sucht von selbst
  erneut, wenn ein Sensor nicht mehr antwortet, höchstens alle 10 Minuten. Du
  kannst auch auf **Sensoren suchen** klicken.
- **„Die Awair-Cloud hat das Token abgelehnt“**: Kopiere das Token erneut aus
  der Awair-Entwicklerkonsole.
- **Protokolle**: Die Integration schreibt nur das Wesentliche. Um jede Messung
  zu sehen, setze die Umgebungsvariable `LOG_LEVEL=debug`.

## Grenzen

- Schreibgeschützt: Anzeige, LED und die übrigen Einstellungen des Sensors
  bleiben in der App Awair Home.
- Das WLAN-Signal des Sensors ist nicht verfügbar: Die Local API liefert es
  nicht.
- Die Awair der ersten Generation und die Awair Glow haben keine Local API:
  Beide brauchen das Cloud-Token und werden höchstens alle 5 Minuten gelesen.
- Nur die Local-API-Antworten von Element und Omni konnten an echten
  Aufzeichnungen geprüft werden; die anderen Modelle sollten genauso antworten.
- Die Funktionsnamen werden beim Hinzufügen des Geräts festgelegt: Eine
  spätere Sprachänderung benennt sie nicht um.
