# Tijdlijn – partyspel in de stijl van Hitster

Een digitaal spel waarin je kaarten in de juiste volgorde op je eigen tijdlijn
legt. Werkt op **iPhone, iPad** (als app op je beginscherm) en op een **LG-tv**
(webOS-app, te bedienen met de afstandsbediening).

Het is een gewone web-app (HTML, CSS en JavaScript, zonder build-stap). Daardoor
draait dezelfde code op alle apparaten.

## Scenario's

| Set                    | Kaarten | Wat raad je                                                 |
|------------------------|---------|-------------------------------------------------------------|
| 🎵 Muziekhits          | 52      | Je hoort een fragment van 30 sec. en raadt het jaar         |
| 🎬 Films               | 43      | Het jaar waarin de film uitkwam                             |
| 🌍 Wereldgeschiedenis  | 36      | Het jaar van de gebeurtenis                                 |
| 🇳🇱 Nederland           | 35      | Vaderlandse geschiedenis, sport en cultuur                  |
| 💡 Uitvindingen & tech | 35      | Van boekdrukkunst tot ChatGPT                               |
| ✏️ Eigen kaarten       | –       | Je eigen set, in de app te maken (bijv. familiemomenten)    |

Sets kun je combineren. Nieuwe sets toevoegen kan in `js/decks.js`: één regel
per kaart, `[jaar, "titel", "extra info"]`.

## Muziek per genre (via Wikipedia)

Naast de vaste sets zijn er genre-sets: Pop, Rock, Hiphop, Dance & elektronisch,
Disco & funk, R&B & soul, Metal, Country, Jazz en Nederlandstalig. Met
**🎶 Alles door elkaar** zet je alle genres in één keer aan. Die komen uit
[Wikidata](https://www.wikidata.org), de database achter Wikipedia:

- per genre (inclusief subgenres) de bekendste nummers, gemeten aan het aantal
  Wikipedia-talen met een artikel over het nummer;
- het jaar is de vroegste publicatiedatum in Wikidata;
- alleen Engels- en Nederlandstalige nummers (op taal, of anders op land van
  herkomst: Engelstalige landen, Nederland, België en Scandinavië);
- alleen nummers waarvan Apple een fragment heeft, komen erin.

Het script `tools/bouw-muziek.mjs` maakt daarvan `js/muziek-db.js`. Het draait
automatisch op GitHub (*Actions* → *Tijdlijn – muziekdatabase bouwen*, of met
*Run workflow*) en zet het resultaat terug in de branch. De eerste run duurt
ongeveer anderhalf uur, omdat Apple maar ~20 zoekopdrachten per minuut toestaat.
Daarna gaat het snel dankzij `tools/itunes-cache.json`. Meer nummers per genre:
zet `PER_GENRE` (standaard 150) hoger.

Let op: Wikidata wordt door vrijwilligers bijgehouden. Een enkel jaartal kan
afwijken, bijvoorbeeld het jaar van een heruitgave.

## Nummers uit een Deezer-playlist toevoegen

```bash
node scripts/import-recent.js <playlist-id, link of chart> [--set recent] [--naam "Recente hits"] [--marge 1] [--droog]
```

Het script (Node 18+, geen installatie nodig) haalt alle nummers uit de playlist op. Per nummer:

1. **Overslaan** als het al in een kaartenset staat (`decks.js`, `muziek-db.js` of
   `muziek-extra.js`). Er wordt vergeleken op titel en hoofdartiest, zonder toevoegingen als
   *Remastered* of *Radio Edit*.
2. **Jaar controleren** via [MusicBrainz](https://musicbrainz.org): het vroegste jaar van de
   opname met precies die titel en artiest.
3. **Toevoegen** aan `js/muziek-extra.js` (set *Recente hits*, of de naam bij `--naam`) als dat
   jaar hooguit `--marge` jaar afwijkt van de releasedatum bij Deezer.
4. **Ter controle** in `tools/import-controle.json` als de jaren meer afwijken of het nummer niet
   op MusicBrainz staat. Daar staan beide jaartallen bij. Klopt een nummer toch, zet het dan met
   het juiste jaar in `js/muziek-extra.js`.

Met `--droog` zie je eerst wat er zou gebeuren, zonder iets weg te schrijven. Het script wacht
tussen verzoeken (MusicBrainz staat 1 verzoek per seconde toe), dus 100 nummers duren ongeveer
twee minuten. `muziek-extra.js` wordt niet door `tools/bouw-muziek.mjs` overschreven.

### Automatisch importeren (elk apparaat krijgt de nieuwe nummers)

De workflow `.github/workflows/tijdlijn-import.yml` draait **elke maandagochtend** en importeert
alle playlists uit `tools/playlists.json`. Standaard staat daar alleen `"chart"`: de actuele
Deezer-top-100, waarvoor je geen playlist of account nodig hebt. Zo komen er elke week vanzelf de
nieuwste hits bij. Eigen of openbare playlists voeg je zo toe:

```json
{
  "playlists": [
    { "id": "1234567890", "set": "recent", "naam": "Recente hits" },
    { "id": "9876543210", "set": "zomer", "naam": "Zomerhits", "marge": 1 }
  ]
}
```

Een losse playlist kan ook met de hand: op GitHub *Actions → Tijdlijn – nummers uit
Deezer-playlists importeren → Run workflow* en vul het ID of de link in. Na afloop slaat de
workflow `js/muziek-extra.js` en `tools/import-controle.json` op en werkt hij de branch
`tijdlijn-site` bij. Netlify zet het daarna online. Let op: GitHub draait geplande en
handmatige workflows alleen vanaf `main`, dus dit werkt pas als de code daar staat.

## Spelregels

1. Iedere speler (2–8) begint met één open kaart.
2. Om de beurt pak je een kaart. Bij muziek hoor je alleen een fragment, bij
   andere sets zie je de gebeurtenis maar niet het jaar.
3. Kies de plek op jouw tijdlijn: ervoor, ertussen of erna.
4. Goed: je houdt de kaart. Fout: de kaart gaat weg.
5. Wie als eerste het doelaantal haalt (5, 8, 10 of 12), wint.
6. **Munten 🪙**: je begint met 2. Raad je bij muziek titel én artiest goed,
   dan krijg je er een bij. Met een munt mag je een kaart overslaan.

## Feest bij een goed antwoord

Leg je een kaart goed, dan zakt er een vlaggetjesslinger naar beneden, dwarrelen
er confetti en serpentines over het scherm en klinkt er een fanfare (trompetten, pauken en
een bekken). Bij de winnaar is het feest groter, met gejuich en applaus na de fanfare. Slinger, confetti en geluid worden in de
browser zelf gemaakt (canvas en Web Audio), dus er zijn geen geluidsbestanden of
internet voor nodig. Uitzetten kan bij *Nieuw spel* → *Feest bij goed antwoord*.

## Muziek afspelen

Bij *Nieuw spel* kies je hoe de muziekkaarten klinken:

- **🔊 Fragment (30 sec.):** het fragment speelt direct in de app zodra je
  *Pak een kaart* kiest (zie hieronder). Met de knop pauzeer of herstart je het.
- **📖 Voorlezen:** titel en artiest staan open op de kaart.

Na het onthullen kun je met *Hele nummer op Spotify* verder luisteren. Standaard
opent dat de zoekresultaten voor *artiest + titel*. Wil je het nummer direct
openen, geef de kaart dan een Spotify-link als vierde waarde:
`[1975, "Bohemian Rhapsody", "Queen", "https://open.spotify.com/track/…"]`.
Bij *Eigen kaarten* plak je de link achteraan de regel.

### Muziekfragmenten

De fragmenten komen live via de gratis
[iTunes Search API](https://performance-partners.apple.com/search-api) van
Apple: dezelfde previews van 30 seconden die je in de iTunes Store hoort. Er is
geen account of sleutel nodig, wel internet. Wordt er geen fragment gevonden,
dan toont de app titel en artiest en leest iemand de kaart voor. Je kunt de
fragmenten ook uitzetten bij *Nieuw spel*.

De jaartallen staan in de kaarten zelf (het oorspronkelijke jaar van uitkomen),
niet in de gegevens van Apple. Die tonen vaak het jaar van een heruitgave.

## Lokaal proberen

```bash
cd tijdlijnspel
python3 -m http.server 8080
```

Open <http://localhost:8080>. Op de computer werken de pijltjestoetsen, Enter en
Esc net als de afstandsbediening.

## Online zetten (nodig voor iPhone/iPad)

De map `tijdlijnspel` is een losse statische site. Twee gratis opties:

- **Netlify Drop (het snelst):** ga naar <https://app.netlify.com/drop> en sleep
  de map `tijdlijnspel` erin. Je krijgt meteen een https-adres.
- **Netlify gekoppeld aan GitHub (aanbevolen):** GitHub zet het spel automatisch
  in de branch `tijdlijn-site` (zie `.github/workflows/tijdlijn-site.yml`). Koppel
  in Netlify de repo en kies bij *Branch to deploy* **`tijdlijn-site`**; laat Base
  directory, Build command en Publish directory leeg. De instellingen staan in
  `netlify.toml`. Via de gewone branches lukt het niet: dan ziet Netlify de
  Next.js-boodschappenapp in de hoofdmap en dwingt hij een Next.js-build af.
- **Vercel:** maak een *nieuw* project van deze repo en zet bij
  *Root Directory* `tijdlijnspel` (framework: *Other*). Zo blijft het los van de
  boodschappenapp.

## Op iPhone of iPad zetten

1. Open het adres in **Safari**.
2. Tik op de deelknop → **Zet op beginscherm**.
3. Start Tijdlijn vanaf het beginscherm: volledig scherm, net een app.

De app zelf werkt daarna ook offline. Alleen de muziekfragmenten hebben internet
nodig.

## Op de LG-tv

Er zijn drie manieren, van makkelijk naar mooi:

1. **AirPlay vanaf de iPad.** De meeste LG-tv's vanaf 2018 ondersteunen
   AirPlay 2. Open het spel op de iPad → Bedieningspaneel → *Scherm
   synchroniseren* → kies de tv. Het spel en het geluid gaan naar de tv en je
   speelt op de iPad.
2. **Browser van de tv.** Open de webbrowser op de tv en ga naar het adres.
   Werkt direct; bediening met de pijltjes en OK.
3. **Als echte app (webOS).** Deze map bevat al `appinfo.json`, de iconen en de
   ondersteuning voor de Terug-knop van de afstandsbediening.
   1. Installeer op de tv de app **Developer Mode** uit de LG Content Store,
      log in met een (gratis) LG-developeraccount en zet Dev Mode aan.
   2. Installeer op je Mac de webOS CLI: `npm install -g @webos-tools/cli`.
   3. Koppel de tv: `ares-setup-device` (IP-adres van de tv, poort 9922) en
      `ares-novacom --device tv --getkey` (met de passphrase uit de
      Developer Mode-app).
   4. Verpakken en installeren:
      ```bash
      ares-package tijdlijnspel
      ares-install --device tv nl.tijdlijn.spel_1.0.0_all.ipk
      ares-launch --device tv nl.tijdlijn.spel
      ```
   Let op: in Developer Mode verloopt de sessie na 50 uur. Verleng die in de
   Developer Mode-app. Wil je de app in de LG Content Store zetten, dan moet hij
   door LG's keuring (via het LG Seller Lounge-account).

### Bediening op de tv

| Toets                | Actie                                                  |
|----------------------|--------------------------------------------------------|
| ◀ ▶                  | Plek op de tijdlijn kiezen, of naar de knop ernaast    |
| ▲ ▼                  | Naar de rij erboven of eronder (bijv. *Speel fragment*) |
| OK                   | Bevestigen of kaart plaatsen                           |
| Terug                | Een scherm terug of het spel stoppen                   |

## Bestanden

```
tijdlijnspel/
├── index.html            app-shell
├── css/style.css         opmaak (schaalt van telefoon tot 4K-tv)
├── js/decks.js           vaste kaartensets
├── js/muziek-db.js       genre-sets uit Wikidata (automatisch gemaakt)
├── js/muziek-extra.js    nummers uit Deezer-playlists (scripts/import-recent.js)
├── tools/                bouwscript voor de genre-sets
├── js/app.js             spel-logica, schermen, afstandsbediening, fragmenten
├── js/feest.js           slingers en confetti bij een goed antwoord
├── js/geluiden.js        de fanfare (Web Audio, werkt offline)
├── sw.js                 offline-cache (PWA)
├── manifest.webmanifest  PWA-gegevens voor iPhone/iPad
├── appinfo.json          gegevens voor de LG webOS-app
└── icons/                app-iconen en tv-splashscreen
```

## Ideeën voor later

- Telefoons als controller met de tv als scherm (vereist een kleine server
  voor realtime verbinding, bijvoorbeeld via Supabase Realtime, dat de
  boodschappenapp al gebruikt).
- Teams in plaats van losse spelers.
- Meer sets: sport, tv-series, games, Songfestival-winnaars.
- Kaarten met afbeeldingen (filmposters, albumhoezen via dezelfde API).
