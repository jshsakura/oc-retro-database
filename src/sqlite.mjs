import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createResolver } from "./resolver.mjs";

/** Read the initial corpus schema without exposing private inventory rows or opening it for writes. */
export function readRecords(db) {
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='identity'").get()) {
    return db.prepare("SELECT document_json FROM identity ORDER BY id").all().map((row) => JSON.parse(row.document_json));
  }
  const map = new Map(db.prepare("SELECT id,system,ko,en FROM game").all().map((g) => [g.id, {
    ...g, aliases: [], fingerprints: [], links: [], sources: [], releases: [],
  }]));
  for (const a of db.prepare("SELECT game_id,text FROM alias").all()) map.get(a.game_id)?.aliases.push(a.text);
  for (const o of db.prepare("SELECT id,game_id,source,sha256,sha256_prefix,sha1_prefix,crc32,facts_json FROM observation").all()) {
    const record = map.get(o.game_id);
    if (!record) continue;
    record.sources.push(o.source);
    for (const [algorithm, value] of [["sha256", o.sha256], ["sha256-prefix128", o.sha256_prefix], ["sha1-prefix128", o.sha1_prefix], ["crc32", o.crc32]]) {
      if (value) record.fingerprints.push({ algorithm, value, scope: "content", source: o.source, observationId: o.id });
    }
    const facts = JSON.parse(o.facts_json);
    if (Object.values(facts).some((v) => v !== null && v !== false && v !== 0 && v !== "auto")) {
      record.releases.push({ observationId: o.id, kind: facts.is_korean_patched === 1 ? "translation" : "unknown", facts, source: o.source });
    }
  }
  for (const link of db.prepare("SELECT game_id,provider,external_id,status,by_rule FROM provider_link").all()) {
    map.get(link.game_id)?.links.push({ provider: link.provider, id: link.external_id, status: link.status, by: link.by_rule });
  }
  for (const set of db.prepare("SELECT short_name,description,parent,bios,ko FROM arcade_set").all()) {
    const en = set.description.replace(/\s*\([^()]*\)\s*$/, "");
    map.set(`fbneo:${set.short_name}`, {
      id: `fbneo:${set.short_name}`, system: "arcade", setName: set.short_name, arcadeNamespace: "fbneo", kind: set.bios ? "bios" : "unknown", ko: set.ko, en,
      aliases: [set.short_name], sources: ["fbneo"], links: [], parentSet: set.parent, fingerprints: [],
    });
  }
  for (const record of map.values()) record.sources = [...new Set(record.sources)].sort();
  return [...map.values()];
}

const stamp = (file) => {
  const s = fs.statSync(file, { bigint: true });
  return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(":");
};

/** Reload after a file replacement or an external SQLite commit, including WAL commits. */
export function openResolver(file) {
  let db = null;
  let version = null;
  let fileStamp = null;
  let resolver = null;
  function current() {
    const next = stamp(file);
    if (next !== fileStamp) {
      db?.close();
      db = null;
      resolver = null;
      db = new DatabaseSync(file, { readOnly: true });
      fileStamp = next;
      version = null;
    }
    const dataVersion = db.prepare("PRAGMA data_version").get().data_version;
    if (!resolver || dataVersion !== version) {
      resolver = createResolver(readRecords(db));
      version = dataVersion;
    }
    return resolver;
  }
  return {
    resolve: (input) => current().resolve(input),
    snapshot: () => current(),
    close() { db?.close(); db = null; resolver = null; fileStamp = null; },
  };
}
