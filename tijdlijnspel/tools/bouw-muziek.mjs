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

const MAX_PER_ARTIST = 4;
const qid = (uri) => uri.split("/").pop();

// Nummers (single, lied of muziekwerk) die aan het filter voldoen, zonder namen: snel, ook bij veel genres.
async function songRows(filter, minLinks) {
  // Q134556 = single, Q7366 = lied, Q2188189 = muziekwerk
  return sparql(`
    SELECT ?song ?n ?date ?artist WHERE {
      ${filter}
      VALUES ?type { wd:Q134556 wd:Q7366 wd:Q2188189 }
      ?song wdt:P31 ?type ; wikibase:sitelinks ?n .
      FILTER(?n >= ${minLinks})
      ?song wdt:P577 ?date ; wdt:P175 ?artist .
    }`);
}

// Namen ophalen via de Wikidata-API (50 per keer), Nederlands of Engels.
const labelCache = {};
async function labels(ids, preferNl) {
  const todo = [...new Set(ids)].filter((id) => !(id in labelCache));
  for (let i = 0; i < todo.length; i += 50) {
    const url =
      "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=nl|en&ids=" +
      todo.slice(i, i + 50).join("|");
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    const data = await res.json();
    for (const [id, e] of Object.entries(data.entities || {})) labelCache[id] = e.labels || {};
  }
  return (id) => {
    const l = labelCache[id] || {};
    const pick = preferNl ? l.nl || l.en : l.en || l.nl;
    return pick ? pick.value : null;
  };
}

async function songs(genre) {
  const minLinks = genre.minLinks || 5;
  let rows = [];
  if (genre.language) {
    rows = await songRows(`?song wdt:P407 wd:${genre.language} .`, minLinks);
  } else {
    const ids = new Set();
    for (const root of genre.roots) (await genreItems(root)).forEach((id) => ids.add(id));
    const list = [...ids];
    for (let i = 0; i < list.length; i += 60) {
      const chunk = list.slice(i, i + 60).map((id) => "wd:" + id).join(" ");
      rows = rows.concat(await songRows(`VALUES ?g { ${chunk} } ?song wdt:P136 ?g .`, minLinks));
    }
  }

  // Samenvoegen per nummer: vroegste jaar, alle artiesten.
  const bySong = new Map();
  for (const r of rows) {
    const id = qid(r.song.value);
    const year = Number(r.date.value.slice(0, r.date.value.startsWith("-") ? 5 : 4));
    const s = bySong.get(id) || { id, year, links: Number(r.n.value), artists: [] };
    s.year = Math.min(s.year, year);
    const a = qid(r.artist.value);
    if (!s.artists.includes(a)) s.artists.push(a);
    bySong.set(id, s);
  }
  const ranked = [...bySong.values()]
    .filter((s) => s.year >= 1900 && s.year <= THIS_YEAR)
    .sort((a, b) => b.links - a.links)
    .slice(0, PER_GENRE * 4);

  const name = await labels(ranked.flatMap((s) => [s.id, ...s.artists.slice(0, 2)]), !!genre.language);
  const perArtist = {};
  const result = [];
  for (const s of ranked) {
    const title = name(s.id);
    const artists = s.artists.slice(0, 2).map(name);
    if (!title || artists.some((a) => !a)) continue;
    const main = s.artists[0];
    perArtist[main] = (perArtist[main] || 0) + 1;
    if (perArtist[main] > MAX_PER_ARTIST) continue; // meer afwisseling
    result.push({ id: s.id, title, artist: artists.join(" & "), year: s.year, links: s.links });
  }
  return result;
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
    (list.length > 12 ? list.slice(0, 8).concat(list.slice(-4)) : list).forEach((s) => console.log(`    ${s.year}  ${s.artist} – ${s.title}  (${s.links})`));
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
