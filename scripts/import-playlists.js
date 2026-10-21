#!/usr/bin/env node
// Draait scripts/import-recent.js voor alle playlists in tijdlijnspel/tools/playlists.json,
// of voor één playlist als die als argument wordt meegegeven. Gebruikt door de workflow
// .github/workflows/tijdlijn-import.yml (wekelijks en met de hand).
//
//   node scripts/import-playlists.js                 alle playlists uit playlists.json
//   node scripts/import-playlists.js <id> [naam]     één playlist
//
// playlists.json: { "playlists": [ { "id": "1234567", "set": "recent", "naam": "Recente hits" } ] }
// Gebruik "chart" als id voor de actuele Deezer-top-100.

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const CONFIG = path.join(__dirname, "..", "tijdlijnspel", "tools", "playlists.json");
const IMPORT = path.join(__dirname, "import-recent.js");

function playlists() {
  const [id, naam] = process.argv.slice(2);
  if (id) return [{ id, naam: naam || undefined }];
  const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  return config.playlists || [];
}

const list = playlists();
if (!list.length) {
  console.log("Geen playlists: voeg er een toe aan tijdlijnspel/tools/playlists.json of geef een ID mee.");
  process.exit(0);
}

let failed = 0;
for (const p of list) {
  const args = [IMPORT, String(p.id)];
  if (p.set) args.push("--set", p.set);
  if (p.naam) args.push("--naam", p.naam);
  if (p.marge !== undefined) args.push("--marge", String(p.marge));
  console.log(`\n=== Playlist ${p.id}${p.naam ? " (" + p.naam + ")" : ""} ===`);
  try {
    execFileSync(process.execPath, args, { stdio: "inherit" });
  } catch (e) {
    // Eén mislukte playlist houdt de rest niet tegen; aan het eind faalt de run wel.
    failed++;
  }
}
if (failed) {
  console.error(`\n${failed} van ${list.length} playlists mislukt.`);
  process.exit(1);
}
