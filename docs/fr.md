# Awair

## Présentation

Cette intégration amène dans Gladys les capteurs de qualité de l'air **Awair** :
Awair Element, Awair Omni, Awair 2nd Edition, Awair Mint et Awair Glow C, lus
sur votre propre réseau par leur **Local API**. Chaque capteur devient un
appareil Gladys avec son score Awair, la température, l'humidité, le CO2, les
COV, les particules fines et, selon le modèle, la luminosité et le bruit.

Les capteurs sans Local API (Awair première génération, Awair Glow) peuvent
être lus par le cloud Awair avec un jeton développeur, en option.

Tout est en lecture seule : l'intégration ne modifie jamais un réglage de vos
capteurs.

> Développée sans le matériel : vos retours sont les bienvenus. L'intégration a
> été écrite à partir de la documentation de l'API Awair et de vraies réponses
> des capteurs enregistrées par d'autres projets libres. Si quelque chose
> semble faux avec votre modèle, ouvrez une issue sur le dépôt GitHub.

Cette intégration n'est pas affiliée à Awair.

## Prérequis

- Gladys Assistant 5.1.0 ou plus récent.
- Pour chaque capteur, la **Local API activée** dans l'application Awair Home :
  ouvrez le capteur, puis **Awair+** → **Awair APIs** → **Local API**, et
  activez-la.
- Les capteurs sur le même réseau que Gladys. Une adresse IP fixe (réservation
  DHCP dans votre box) est conseillée mais pas obligatoire.
- Facultatif : un jeton développeur Awair, seulement pour les capteurs sans
  Local API.

## Configuration

Ouvrez **Intégrations** → **Awair** → **Configuration**.

1. Cliquez sur **Rechercher les capteurs**. L'intégration demande à Gladys de
   parcourir le réseau (mDNS) et lit chaque capteur Awair trouvé. Le compte
   rendu sous le bouton les liste, avec leur adresse.
2. Ouvrez l'onglet **Découverte** et ajoutez les capteurs voulus dans Gladys.

| Réglage                              | Usage                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Adresses IP des capteurs             | Seulement pour un capteur que la recherche ne trouve pas. Plusieurs adresses séparées par des virgules.      |
| Intervalle de rafraîchissement local | 10 s, 30 s (par défaut), 1 min ou 5 min. Le capteur met lui-même ses valeurs à jour toutes les 10 secondes.  |
| Jeton d'accès Awair                  | Facultatif. Jeton de la console développeur Awair, pour les capteurs sans Local API.                         |
| Intervalle de rafraîchissement cloud | 5 min (par défaut), 10, 15 ou 30 min.                                                                        |
| Langue de l'intégration              | Noms des fonctionnalités des appareils ajoutés ensuite, et textes de l'action de scène. Français par défaut. |

### Quota du cloud Awair

L'API développeur Awair compte les appels par jour. Le niveau Hobbyist, le
gratuit, autorise **300 appels « latest » par jour** : 5 minutes entre deux
lectures d'un capteur est le rythme le plus rapide qui reste dedans.
L'intégration lit le quota de votre compte et ne va jamais plus vite qu'il ne
le permet, réparti sur tous vos capteurs cloud. Si l'API répond quand même
« quota dépassé », le capteur est laissé en paix pendant une heure. Un capteur
joignable par la Local API est toujours lu en local, sans consommer de quota.

## Appareils

Un appareil par capteur, nommé d'après son modèle tant que vous ne le renommez
pas. Ses fonctionnalités sont les mesures que le capteur remonte vraiment ; à
titre indicatif :

| Fonctionnalité   | Unité   | Modèles                                                  |
| ---------------- | ------- | -------------------------------------------------------- |
| Score Awair      | 0-100   | tous                                                     |
| Qualité de l'air | niveau  | tous : bonne (80+), moyenne (60-79), mauvaise (sous 60)  |
| Température      | °C      | tous                                                     |
| Humidité         | %       | tous                                                     |
| CO2              | ppm     | Element, Omni, 2nd Edition, Glow, première génération    |
| COV              | ppb     | tous                                                     |
| PM2.5            | µg/m³   | Element, Omni, 2nd Edition, Mint                         |
| PM10             | µg/m³   | Element et 2nd Edition (valeur estimée par le capteur)   |
| Poussières       | µg/m³   | première génération (un seul capteur pour PM2.5 et PM10) |
| Luminosité       | lux     | Omni, Mint                                               |
| Bruit            | dBA     | Omni                                                     |
| Point de rosée   | °C      | Element (Local API)                                      |
| Batterie         | %       | Omni (Local API)                                         |
| Sur secteur      | oui/non | Omni (Local API)                                         |

Quand le capteur donne à la fois une valeur mesurée et une valeur estimée (CO2,
PM10), la valeur mesurée est retenue. Le niveau **Qualité de l'air** s'affiche
en couleur sur le tableau de bord : vert, jaune, orange.

Seules les valeurs qui changent sont envoyées à Gladys, plus chaque valeur au
moins toutes les 6 heures pour qu'aucune ne paraisse ancienne.

## Widget du tableau de bord

**Qualité de l'air** : choisissez un capteur dans les réglages du widget. Le
widget montre le score Awair en jauge, le CO2, les PM2.5 (ou les poussières),
la température et l'humidité en tuiles en direct, puis le niveau de qualité de
l'air et la connexion (locale, cloud ou injoignable).

## Déclencheurs de scène

- **Capteur Awair perdu** : le capteur ne répond plus, trois lectures ratées de
  suite (débranché, hors Wi-Fi, Local API désactivée). Choisissez un capteur ou
  laissez le champ vide pour tous. La scène reçoit le nom du capteur.
- **Capteur Awair de retour** : un capteur compté comme perdu répond à nouveau.

Les valeurs elles-mêmes (score, CO2…) n'ont pas besoin de déclencheur :
utilisez le déclencheur standard « valeur d'un appareil » de Gladys sur les
fonctionnalités de l'appareil.

## Action de scène

**Lire la qualité de l'air** : lit le capteur tout de suite et donne aux
actions suivantes de la scène :

- `summary` : une phrase toute faite, par exemple « Bureau : qualité de l'air
  bonne (score 92/100), CO2 650 ppm, PM2.5 3 µg/m³, 21,5 °C, 45 %
  d'humidité. » ;
- `score`, `co2`, `pm25`, `temperature`, `humidity` : les valeurs ;
- `level` : `good`, `fair` ou `poor`, à comparer dans une condition.

La phrase suit la langue de la configuration de l'intégration.

## Exemples de scènes

- **Ouvrir les fenêtres** : déclencheur « valeur d'un appareil » sur le CO2
  au-dessus de 1200 ppm → envoyer le message « Il est temps d'aérer ».
- **Bilan du matin** : chaque jour à 7 h 30 → action « Lire la qualité de
  l'air » → envoyer un message avec `summary`.
- **Ventilation** : quand le niveau Qualité de l'air passe à « mauvaise » →
  allumer la prise de la VMC ; quand il revient à « bonne » → l'éteindre.
- **Surveiller le capteur** : déclencheur « Capteur Awair perdu » → envoyer un
  message avec le nom du capteur.

## Dépannage

- **Aucun capteur trouvé** : vérifiez que la Local API est activée dans
  l'application Awair Home, puis saisissez l'adresse IP du capteur dans la
  configuration. L'adresse est affichée dans l'application Awair Home, ou dans
  votre box.
- **« La découverte automatique (mDNS) par Gladys est indisponible »** : votre
  Gladys ne relaie pas le mDNS. Saisissez les adresses IP.
- **Un capteur a changé d'adresse** : l'intégration relance d'elle-même une
  recherche quand un capteur ne répond plus, au plus toutes les 10 minutes.
  Vous pouvez aussi cliquer sur **Rechercher les capteurs**.
- **« Le cloud Awair a refusé le jeton »** : recopiez le jeton depuis la
  console développeur Awair.
- **Journaux** : l'intégration n'écrit que l'essentiel. Pour voir chaque
  lecture, réglez la variable d'environnement `LOG_LEVEL=debug`.

## Limites

- Lecture seule : l'affichage, la LED et les autres réglages du capteur restent
  dans l'application Awair Home.
- Le signal Wi-Fi du capteur n'est pas disponible : la Local API ne le donne
  pas.
- L'Awair première génération et l'Awair Glow n'ont pas de Local API : il leur
  faut le jeton cloud, et ils sont lus toutes les 5 minutes au mieux.
- Seules les réponses Local API de l'Element et de l'Omni ont pu être vérifiées
  sur de vrais enregistrements ; les autres modèles devraient répondre de la
  même façon.
- Les noms des fonctionnalités sont fixés à l'ajout de l'appareil : changer la
  langue ensuite ne les renomme pas.
