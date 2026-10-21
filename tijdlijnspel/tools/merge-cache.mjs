// Voegt een andere Apple-cache samen met tools/itunes-cache.json (gevonden ID's winnen van "niet gevonden").
//   node tijdlijnspel/tools/merge-cache.mjs andere-cache.json
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = join(dirname(fileURLToPath(import.meta.url)), "itunes-cache.json");
const read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8") || "{}") : {});
const ours = read(file);
const other = read(process.argv[2]);
for (const [key, id] of Object.entries(other)) if (!(key in ours) || (!ours[key] && id)) ours[key] = id;
writeFileSync(file, JSON.stringify(ours));
console.log(`Apple-cache: ${Object.keys(ours).length} nummers`);
