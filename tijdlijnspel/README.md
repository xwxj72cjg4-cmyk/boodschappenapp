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

## Spelregels

1. Iedere speler (2–8) begint met één open kaart.
2. Om de beurt pak je een kaart. Bij muziek hoor je alleen een fragment, bij
   andere sets zie je de gebeurtenis maar niet het jaar.
3. Kies de plek op jouw tijdlijn: ervoor, ertussen of erna.
4. Goed: je houdt de kaart. Fout: de kaart gaat weg.
5. Wie als eerste het doelaantal haalt (5, 8, 10 of 12), wint.
6. **Munten 🪙**: je begint met 2. Raad je bij muziek titel én artiest goed,
   dan krijg je er een bij. Met een munt mag je een kaart overslaan.

## Muziekfragmenten

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
├── js/decks.js           alle kaartensets
├── js/app.js             spel-logica, schermen, afstandsbediening, fragmenten
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
