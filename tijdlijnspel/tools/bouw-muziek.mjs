// Bouwt js/muziek-db.js: muziekkaarten per genre, uit Wikidata (de database achter Wikipedia).
// Alleen nummers waarvan Apple een fragment van 30 seconden heeft, komen erin.
//
//   node tijdlijnspel/tools/bouw-muziek.mjs
//
// Draait ook automatisch via .github/workflows/tijdlijn-muziek.yml. Resultaten van Apple worden
// bewaard in tools/itunes-cache.json, zodat een volgende run alleen nieuwe nummers opzoekt.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_FILE = join(ROOT, "tools", "itunes-cache.json");
const OUT_FILE = join(ROOT, "js", "muziek-db.js");
const UA = "TijdlijnSpel/1.0 (https://github.com/xwxj72cjg4-cmyk/boodschappenapp)";
const PER_GENRE = Number(process.env.PER_GENRE || 150);
// Met --alleen-wikidata slaat het script Apple over en toont het per genre een voorbeeld (snelle controle).
const ONLY_WIKIDATA = process.argv.includes("--alleen-wikidata");
const THIS_YEAR = new Date().getFullYear();

// Genres worden op hun Engelse Wikidata-naam opgezocht; subgenres tellen mee.
const GENRES = [
  { id: "pop", name: "Pop", emoji: "🎤", roots: ["pop music"] },
  { id: "rock", name: "Rock", emoji: "🎸", roots: ["rock music"] },
  { id: "hiphop", name: "Hiphop", emoji: "🧢", roots: ["hip hop music"] },
  { id: "dance", name: "Dance & elektronisch", emoji: "🎧", roots: ["electronic music"] },
  { id: "disco", name: "Disco & funk", emoji: "🪩", roots: ["disco", "funk"] },
  { id: "soul", name: "R&B & soul", emoji: "💜", roots: ["rhythm and blues", "soul music", "contemporary R&B"] },
  { id: "metal", name: "Metal", emoji: "🤘", roots: ["heavy metal"] },
  { id: "country", name: "Country", emoji: "🤠", roots: ["country music"] },
  { id: "jazz", name: "Jazz", emoji: "🎷", roots: ["jazz"] },
  { id: "nederlandstalig", name: "Nederlandstalig", emoji: "🇳🇱", language: "Q7411", minLinks: 1 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "query=" + encodeURIComponent(query),
    });
    if (res.ok) return (await res.json()).results.bindings;
    console.warn(`  Wikidata gaf ${res.status} (poging ${attempt})`);
    await sleep(5000 * attempt);
  }
  throw new Error("Wikidata-query mislukt");
}

// Zoek het genre-item met deze naam (bij meerdere: het bekendste) en al zijn subgenres.
async function genreItems(label) {
  // Q188451 = muziekgenre. Bij geen treffer zoeken we zonder die eis.
  let rows = await sparql(`
    SELECT ?g ?n WHERE {
      ?g rdfs:label "${label}"@en ; wdt:P31/wdt:P279* wd:Q188451 ; wikibase:sitelinks ?n .
    } ORDER BY DESC(?n) LIMIT 1`);
  if (!rows.length) {
    rows = await sparql(`
      SELECT ?g ?n WHERE { ?g rdfs:label "${label}"@en ; wikibase:sitelinks ?n . } ORDER BY DESC(?n) LIMIT 1`);
  }
  if (!rows.length) throw new Error(`Genre niet gevonden: ${label}`);
  const root = rows[0].g.value.split("/").pop();
  const subs = await sparql(`SELECT DISTINCT ?g WHERE { ?g wdt:P279* wd:${root} . }`);
  console.log(`  ${label} = ${root}, ${subs.length} (sub)genres`);
  return subs.map((r) => r.g.value.split("/").pop());
}

async function songs(genre) {
  let filter;
  if (genre.language) {
    filter = `?song wdt:P407 wd:${genre.language} .`;
  } else {
    const ids = new Set();
    for (const root of genre.roots) (await genreItems(root)).forEach((id) => ids.add(id));
    filter = `VALUES ?g { ${[...ids].map((id) => "wd:" + id).join(" ")} } ?song wdt:P136 ?g .`;
  }
  // Q134556 = single, Q7366 = lied, Q2188189 = muziekwerk
  const rows = await sparql(`
    SELECT ?song (SAMPLE(?t) AS ?title) (GROUP_CONCAT(DISTINCT ?a; separator=" & ") AS ?artists)
           (MIN(YEAR(?date)) AS ?year) (MAX(?n) AS ?links) WHERE {
      ${filter}
      VALUES ?type { wd:Q134556 wd:Q7366 wd:Q2188189 }
      ?song wdt:P31 ?type ; wdt:P577 ?date ; wdt:P175 ?artist ; wikibase:sitelinks ?n .
      FILTER(?n >= ${genre.minLinks || 5})
      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "${genre.language ? "nl,en" : "en,nl"}" .
        ?song rdfs:label ?t . ?artist rdfs:label ?a .
      }
    }
    GROUP BY ?song ORDER BY DESC(?links) LIMIT ${PER_GENRE * 3}`);
  return rows
    .map((r) => ({
      id: r.song.value.split("/").pop(),
      title: r.title.value,
      artist: r.artists.value.split(" & ").slice(0, 2).join(" & "),
      year: Number(r.year.value),
      links: Number(r.links.value),
    }))
    .filter((s) => s.year >= 1900 && s.year <= THIS_YEAR && !/^Q\d+$/.test(s.title));
}

// ---------- Apple: bestaat er een fragment? ----------

const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, "utf8")) : {};
const normalize = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

async function itunesId(song) {
  const key = song.artist + "|" + song.title;
  if (key in cache) return cache[key];
  const term = encodeURIComponent((song.artist.split(" & ")[0] + " " + song.title).replace(/&/g, " "));
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=15&country=NL&term=${term}`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    await sleep(3200); // Apple staat ongeveer 20 zoekopdrachten per minuut toe
    const res = await fetch(url, { headers: { "User-Agent": UA } }).catch(() => null);
    if (res && res.ok) {
      const results = ((await res.json()).results || []).filter((r) => r.previewUrl);
      const artist = normalize(song.artist.split(" & ")[0]);
      const title = normalize(song.title.replace(/\(.*?\)/g, "")).slice(0, 10);
      const hit = results.find(
        (r) => normalize(r.artistName).includes(artist) && normalize(r.trackName).startsWith(title)
      );
      cache[key] = hit ? hit.trackId : 0;
      return cache[key];
    }
    console.warn(`  Apple gaf ${res ? res.status : "geen antwoord"}, even wachten…`);
    await sleep(30000 * attempt);
  }
  return 0; // niet in de cache, dus de volgende run probeert het opnieuw
}

// ---------- Bouwen ----------

const decks = [];
let lookups = 0;
for (const genre of GENRES) {
  console.log(`${genre.name}:`);
  const list = await songs(genre);
  console.log(`  ${list.length} kandidaten uit Wikidata`);
  if (ONLY_WIKIDATA) {
    list.slice(0, 8).concat(list.slice(-4)).forEach((s) => console.log(`    ${s.year}  ${s.artist} – ${s.title}  (${s.links})`));
    continue;
  }
  const cards = [];
  for (const song of list) {
    if (cards.length >= PER_GENRE) break;
    if (!(song.artist + "|" + song.title in cache)) lookups++;
    const id = await itunesId(song);
    if (id) cards.push([song.year, song.title, song.artist, "", id]);
    if (lookups && lookups % 50 === 0) writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 0));
  }
  cards.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  console.log(`  ${cards.length} kaarten met fragment`);
  decks.push({ id: "genre-" + genre.id, name: genre.name, emoji: genre.emoji, music: true, cards });
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 0));
}

if (ONLY_WIKIDATA) process.exit(0);

const total = decks.reduce((n, d) => n + d.cards.length, 0);
writeFileSync(
  OUT_FILE,
  "// Automatisch gemaakt door tools/bouw-muziek.mjs uit Wikidata (CC0). Niet met de hand aanpassen.\n" +
    "// Kaart: [jaar, titel, artiest, spotify-link, iTunes-track-ID]\n" +
    `// ${total} kaarten, gemaakt op ${new Date().toISOString().slice(0, 10)}.\n` +
    "window.MUSIC_DB = " +
    JSON.stringify(decks).replace(/\],\[/g, "],\n[") +
    ";\n"
);
console.log(`Klaar: ${total} kaarten in ${decks.length} genres → js/muziek-db.js`);
