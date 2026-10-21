#!/usr/bin/env node
// Importeert nummers uit een Deezer-playlist als Tijdlijn-kaartjes.
//
//   node scripts/import-recent.js <playlist-id> [--set recent] [--naam "Recente hits"] [--marge 1] [--droog]
//   node scripts/import-recent.js chart   (de actuele Deezer-top-100, geen playlist of account nodig)
//
// Per nummer:
//   1. titel, artiest en releasedatum komen van Deezer;
//   2. het jaar wordt gecontroleerd via MusicBrainz (vroegste releasedatum van de opname);
//   3. nummers die al in een kaartenset staan (decks.js, muziek-db.js, muziek-extra.js) worden overgeslagen;
//   4. klopt het jaar (verschil met Deezer hooguit --marge jaar), dan komt het kaartje in
//      tijdlijnspel/js/muziek-extra.js; anders gaat het naar tijdlijnspel/tools/import-controle.json.
//
// Kaartformaat zoals overal: [jaar, titel, artiest, spotify-link, iTunes-track-ID].
// De iTunes-ID blijft 0: de app zoekt het fragment dan zelf op artiest en titel.
// muziek-extra.js wordt niet door tools/bouw-muziek.mjs overschreven, dus imports blijven bewaard.

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "tijdlijnspel");
const FILES = {
  decks: path.join(ROOT, "js", "decks.js"),
  db: path.join(ROOT, "js", "muziek-db.js"),
  extra: path.join(ROOT, "js", "muziek-extra.js"),
  review: path.join(ROOT, "tools", "import-controle.json"),
};
const UA = "TijdlijnSpel/1.0 (https://github.com/xwxj72cjg4-cmyk/boodschappenapp)";
const THIS_YEAR = new Date().getFullYear();

// ---------- Opties ----------

function parseArgs(argv) {
  const opts = { set: "recent", naam: "Recente hits", emoji: "🆕", marge: 1, droog: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--set") opts.set = argv[++i];
    else if (a === "--naam") opts.naam = argv[++i];
    else if (a === "--emoji") opts.emoji = argv[++i];
    else if (a === "--marge") opts.marge = Number(argv[++i]);
    else if (a === "--droog") opts.droog = true;
    else rest.push(a);
  }
  // Ook een volledige link mag: https://www.deezer.com/nl/playlist/1234567. "chart" = Deezer-top-100.
  const m = String(rest[0] || "").match(/(\d{3,})\s*$/) || String(rest[0] || "").match(/playlist\/(\d+)/);
  opts.playlist = rest[0] === "chart" ? "chart" : m ? m[1] : null;
  if (!/^[a-z0-9-]+$/.test(opts.set) || Number.isNaN(opts.marge)) opts.playlist = null;
  return opts;
}

// ---------- Hulpjes ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// "Song (Remastered 2011) - Radio Edit" → "Song"; "Artist feat. X" → "Artist"
function cleanTitle(title) {
  return String(title)
    .replace(/\s*[([][^)\]]*(remaster|version|edit|mix|live|mono|stereo|feat\.?|ft\.|with )[^)\]]*[)\]]/gi, "")
    .replace(/\s+-\s+.*(remaster|version|edit|mix|live|mono|stereo).*$/i, "")
    .trim();
}
function mainArtist(artist) {
  // Alleen op "feat./ft." splitsen: "Earth, Wind & Fire" en "Simon & Garfunkel" blijven heel.
  return String(artist).split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0].trim();
}
function cardKey(title, artist) {
  return normalize(cleanTitle(title)) + "|" + normalize(mainArtist(artist));
}

async function getJson(url, label) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    } catch (e) {
      res = null;
    }
    if (res && res.ok) {
      const data = await res.json();
      // Deezer geeft bij een fout 200 terug met { error: { code, message } }; code 4 = te veel verzoeken.
      if (data && data.error && data.error.code === 4) {
        await sleep(5000 * attempt);
        continue;
      }
      if (data && data.error) throw new Error(`${label}: ${data.error.message || JSON.stringify(data.error)}`);
      return data;
    }
    const status = res ? res.status : "geen verbinding";
    if (res && res.status === 404) throw new Error(`${label}: niet gevonden (404)`);
    console.warn(`  ${label} gaf ${status}, poging ${attempt}`);
    await sleep(3000 * attempt);
  }
  throw new Error(`${label}: mislukt na 4 pogingen`);
}

// ---------- Bestaande kaartjes ----------

// De kaartbestanden zijn scripts die window.DECKS / window.MUSIC_DB / window.MUSIC_EXTRA zetten.
function loadWindowFile(file) {
  if (!fs.existsSync(file)) return {};
  const window = {};
  new Function("window", fs.readFileSync(file, "utf8"))(window);
  return window;
}

function existingKeys() {
  const keys = new Set();
  const decks = []
    .concat(loadWindowFile(FILES.decks).DECKS || [])
    .concat(loadWindowFile(FILES.db).MUSIC_DB || [])
    .concat(loadWindowFile(FILES.extra).MUSIC_EXTRA || []);
  for (const d of decks) if (d.music) for (const c of d.cards) keys.add(cardKey(c[1], c[2]));
  return keys;
}

// ---------- Deezer ----------

async function playlistTracks(id) {
  if (id === "chart") {
    const chart = await getJson("https://api.deezer.com/chart/0/tracks?limit=100", "Deezer-top-100");
    return { title: "Deezer-top-100", tracks: chart.data || [] };
  }
  const info = await getJson(`https://api.deezer.com/playlist/${id}`, "Deezer-playlist");
  const tracks = [];
  let url = `https://api.deezer.com/playlist/${id}/tracks?limit=100&index=0`;
  while (url) {
    const page = await getJson(url, "Deezer-tracks");
    tracks.push(...(page.data || []));
    url = page.next || null;
    await sleep(150); // Deezer: maximaal 50 verzoeken per 5 seconden
  }
  return { title: info.title, tracks };
}

// De releasedatum staat niet in de playlistlijst, wel bij het nummer zelf (= datum van het album).
async function deezerYear(trackId) {
  const t = await getJson(`https://api.deezer.com/track/${trackId}`, "Deezer-nummer");
  await sleep(150);
  const y = parseInt(String(t.release_date || (t.album && t.album.release_date) || "").slice(0, 4), 10);
  return y > 1800 ? y : null;
}

// ---------- MusicBrainz ----------

// Vroegste jaar van alle opnames die op titel én artiest passen. MusicBrainz staat 1 verzoek per seconde toe.
async function musicbrainzYear(title, artist) {
  const esc = (s) => s.replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, "\\$1");
  const q = `recording:"${esc(cleanTitle(title))}" AND artist:"${esc(mainArtist(artist))}"`;
  const url = "https://musicbrainz.org/ws/2/recording?fmt=json&limit=25&query=" + encodeURIComponent(q);
  const data = await getJson(url, "MusicBrainz");
  await sleep(1100);
  const wantTitle = normalize(cleanTitle(title));
  const wantArtist = normalize(mainArtist(artist));
  let best = null;
  for (const r of data.recordings || []) {
    if ((r.score || 0) < 80) continue;
    const credit = normalize((r["artist-credit"] || []).map((c) => c.name).join(" "));
    if (!credit.includes(wantArtist)) continue;
    // Exacte titel: "Feather (Remix)" is een andere opname dan "Feather" en mag het jaar niet bepalen.
    if (normalize(r.title) !== wantTitle) continue;
    const y = parseInt(String(r["first-release-date"] || "").slice(0, 4), 10);
    if (y > 1800 && (!best || y < best.year)) best = { year: y, mbid: r.id };
  }
  return best;
}

// ---------- Wegschrijven ----------

function writeExtra(newCards, opts) {
  const current = loadWindowFile(FILES.extra).MUSIC_EXTRA || [];
  const id = "genre-" + opts.set;
  let deck = current.find((d) => d.id === id);
  if (!deck) {
    deck = { id, name: opts.naam, emoji: opts.emoji, music: true, cards: [] };
    current.push(deck);
  }
  deck.cards = deck.cards.concat(newCards).sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  const total = current.reduce((n, d) => n + d.cards.length, 0);
  fs.writeFileSync(
    FILES.extra,
    "// Gemaakt door scripts/import-recent.js (Deezer-playlists, jaar gecontroleerd via MusicBrainz).\n" +
      "// Mag met de hand worden aangepast; tools/bouw-muziek.mjs overschrijft dit bestand niet.\n" +
      "// Kaart: [jaar, titel, artiest, spotify-link, iTunes-track-ID]\n" +
      `// ${total} kaarten.\n` +
      "window.MUSIC_EXTRA = " +
      JSON.stringify(current).replace(/\],\[/g, "],\n[") +
      ";\n"
  );
}

function writeReview(items) {
  const current = fs.existsSync(FILES.review) ? JSON.parse(fs.readFileSync(FILES.review, "utf8")) : [];
  const seen = new Set(current.map((i) => i.deezerId));
  const merged = current.concat(items.filter((i) => !seen.has(i.deezerId)));
  fs.writeFileSync(FILES.review, JSON.stringify(merged, null, 2) + "\n");
  return merged.length;
}

// ---------- Hoofdprogramma ----------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.playlist) {
    console.error('Gebruik: node scripts/import-recent.js <playlist-id, link of "chart"> [--set recent] [--naam "Recente hits"] [--marge 1] [--droog]');
    process.exit(1);
  }

  const known = existingKeys();
  const { title, tracks } = await playlistTracks(opts.playlist);
  console.log(`Playlist "${title}": ${tracks.length} nummers, ${known.size} nummers al in de kaartensets.`);

  const added = [];
  const review = [];
  let skipped = 0;
  for (const t of tracks) {
    const songTitle = cleanTitle(t.title_short || t.title);
    const artist = t.artist && t.artist.name;
    if (!songTitle || !artist) continue;
    const key = cardKey(songTitle, artist);
    if (known.has(key)) {
      skipped++;
      continue;
    }
    known.add(key); // ook dubbelen binnen de playlist overslaan

    const dz = await deezerYear(t.id);
    const mb = await musicbrainzYear(songTitle, artist);
    const base = { deezerId: t.id, titel: songTitle, artiest: artist, deezerJaar: dz, musicbrainzJaar: mb ? mb.year : null, mbid: mb ? mb.mbid : null };

    let reason = null;
    if (!mb) reason = "niet gevonden op MusicBrainz";
    else if (mb.year > THIS_YEAR) reason = "jaar ligt in de toekomst";
    else if (dz && Math.abs(dz - mb.year) > opts.marge) reason = `jaren wijken ${Math.abs(dz - mb.year)} jaar af`;

    if (reason) {
      review.push(Object.assign(base, { reden: reason }));
      console.log(`  ?  ${artist} – ${songTitle}: ${reason} (Deezer ${dz || "–"}, MusicBrainz ${mb ? mb.year : "–"})`);
    } else {
      added.push([mb.year, songTitle, artist, "", 0]);
      console.log(`  +  ${mb.year}  ${artist} – ${songTitle}`);
    }
  }

  console.log(`\nNieuw: ${added.length} · al aanwezig: ${skipped} · ter controle: ${review.length}`);
  if (opts.droog) {
    console.log("Droog: er is niets weggeschreven.");
    return;
  }
  if (added.length) {
    writeExtra(added, opts);
    console.log(`Toegevoegd aan ${path.relative(process.cwd(), FILES.extra)} (set "${opts.naam}").`);
  }
  if (review.length) {
    const n = writeReview(review);
    console.log(`Ter controle in ${path.relative(process.cwd(), FILES.review)} (${n} in totaal).`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Fout: " + e.message);
    process.exit(1);
  });
}

module.exports = { cleanTitle, mainArtist, cardKey, parseArgs };
