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
    // Row key: the SHA-256 prefix, else the SHA-1 prefix or CRC-32 under a prefix that is never 32 hex.
    // A CRC or SHA-1 rides along only when the record has exactly one, so a multi-file set never pairs
    // one file's CRC with another's SHA-256.
    const seen = { sha256: new Set(), sha1: new Set(), crc32: new Set() };
    for (const fp of r.fingerprints ?? []) {
      if (!ROM_SCOPES.has(fp.scope)) continue;
      const v = String(fp.value).toLowerCase();
      if ((fp.algorithm === "sha256" && /^[0-9a-f]{64}$/.test(v)) || (fp.algorithm === "sha256-prefix128" && /^[0-9a-f]{32}$/.test(v))) seen.sha256.add(v.slice(0, 32));
      else if ((fp.algorithm === "sha1" && /^[0-9a-f]{40}$/.test(v)) || (fp.algorithm === "sha1-prefix128" && /^[0-9a-f]{32}$/.test(v))) seen.sha1.add(v.slice(0, 32));
      else if (fp.algorithm === "crc32" && /^[0-9a-f]{8}$/.test(v)) seen.crc32.add(v);
    }
    const crc = seen.crc32.size === 1 ? [...seen.crc32][0] : "";
    const sha1 = seen.sha1.size === 1 ? [...seen.sha1][0] : "";
    const keys = seen.sha256.size ? [...seen.sha256] : sha1 ? [`sha1:${sha1}`] : crc ? [`crc32:${crc}`] : [];
    for (const k of keys) collect(hashes, JSON.stringify([r.system, k]), [ko, en, crc, sha1]);
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
