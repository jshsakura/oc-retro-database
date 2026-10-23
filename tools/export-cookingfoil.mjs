import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { readRecords } from "../src/sqlite.mjs";
import { ROM_SCOPES, splitName } from "../src/resolver.mjs";

const { values } = parseArgs({ options: { db: { type: "string" }, output: { type: "string" } } });
if (!values.db || !values.output) throw new Error("Usage: node tools/export-cookingfoil.mjs --db database.sqlite --output retro-ko-names.json");
const db = new DatabaseSync(values.db, { readOnly: true });
// CookingFoil's existing title dictionary contract. Conflicting labels are omitted.
const keyOf = (s) => String(s).normalize("NFKC").toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const collect = (map, key, value) => {
  if (!map.has(key)) map.set(key, new Map());
  map.get(key).set(JSON.stringify(value), value);
};
try {
  const titles = new Map();
  const hashes = new Map();
  for (const r of readRecords(db)) {
    const ko = r.titles?.ko ?? r.ko;
    const en = r.titles?.en ?? r.en ?? null;
    if (!ko || !/[가-힣]/.test(ko) || r.system === "arcade" || r.kind === "bios") continue;
    if (r.sources?.length && r.sources.every((s) => s === "rpi-filename")) continue;
    const aliases = (r.aliases ?? []).map((a) => typeof a === "string" ? a : a.name);
    const modified = ["romhack", "homebrew", "bootleg"].includes(r.kind)
      || aliases.some((a) => /(?:\[[^\]]*\b(?:hack|mod|homebrew|unl|pirate)\b[^\]]*\]|\([^)]*\b(?:hack|mod|homebrew|unl|pirate)\b[^)]*\))|개조|핵롬/i.test(a));
    for (const a of modified ? [] : [en, ...aliases].filter(Boolean)) {
      const latin = splitName(a).en;
      if (latin) collect(titles, JSON.stringify([r.system,keyOf(latin)]), ko);
    }
    for (const fp of r.fingerprints ?? []) {
      if (!ROM_SCOPES.has(fp.scope)) continue;
      if ((fp.algorithm === "sha256" && /^[0-9a-f]{64}$/i.test(fp.value))
        || (fp.algorithm === "sha256-prefix128" && /^[0-9a-f]{32}$/i.test(fp.value))) {
        collect(hashes, JSON.stringify([r.system,fp.value.toLowerCase().slice(0,32)]), [ko,en,"",""]);
      }
    }
  }
  const output = { source: "oc-retro-database", count: 0, folders: {}, systems: {}, titles: {} };
  let conflicts = 0;
  for (const [key, labels] of [...titles].sort()) {
    if (labels.size !== 1) { conflicts++; continue; }
    const [system,title] = JSON.parse(key);
    (output.titles[system] ??= {})[title] = [...labels.values()][0];
  }
  for (const [key, labels] of [...hashes].sort()) {
    if (labels.size !== 1) { conflicts++; continue; }
    const [system,hash] = JSON.parse(key);
    (output.systems[system] ??= {})[hash] = [...labels.values()][0];
    output.count++;
  }
  fs.writeFileSync(values.output, `${JSON.stringify(output)}\n`, { flag: "wx" });
  process.stdout.write(`${output.count} hash labels, ${Object.values(output.titles).reduce((n,v) => n+Object.keys(v).length,0)} title aliases; ${conflicts} conflicts omitted\n`);
} finally { db.close(); }
