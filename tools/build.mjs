import fs from "node:fs";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
const { values } = parseArgs({ options: { input: { type: "string" }, output: { type: "string" }, links: { type: "string" } } });
if (!values.input || !values.output) throw new Error("Usage: node tools/build.mjs --input identities.jsonl --output database.sqlite");
const rows = fs.readFileSync(values.input, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const overlay = values.links ? fs.readFileSync(values.links,"utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) : [];
const byId = new Map(rows.map((r) => [r.id,r]));
for (const item of overlay) {
  const record = byId.get(item.identityId);
  if (!record) throw new Error("Crosswalk refers to an unknown identity");
  (record.links ??= []).push(item.link);
  // A unique identity and a single DAT ROM can provide a direct full-hash lookup.
  // Disc tracks remain release references, not whole-game proof.
  const rom = item.release?.roms?.length === 1 ? item.release.roms[0] : null;
  if (item.link.status === "title-unique" && rom && /^[0-9a-f]{40}$/i.test(rom.sha1 ?? "")) {
    (record.fingerprints ??= []).push({ algorithm: "sha1", value: rom.sha1.toLowerCase(), scope: "dat-rom",
      source: "libretro-database", externalReleaseId: item.link.id });
  }
}
const ids = new Set();
for (const r of rows) {
  if (!r.id || !r.system || !r.titles || ids.has(r.id)) throw new Error("Each record needs a unique id, system and separate titles");
  if (r.originalTitle && (!r.originalTitle.text || !r.originalTitle.language || !r.originalTitle.source)) throw new Error("Original titles need text, language and source");
  ids.add(r.id);
}
for (const r of rows) if (r.baseGameId && !ids.has(r.baseGameId)) throw new Error("Unknown base-game identity");
fs.closeSync(fs.openSync(values.output, "wx"));
const db = new DatabaseSync(values.output);
try {
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE identity(id TEXT PRIMARY KEY,system TEXT NOT NULL,document_json TEXT NOT NULL);
    CREATE INDEX identity_system ON identity(system);
    CREATE TABLE project(id TEXT PRIMARY KEY,kind TEXT NOT NULL,base_game_id TEXT REFERENCES identity(id),document_json TEXT NOT NULL);
    CREATE TABLE release(id TEXT PRIMARY KEY,identity_id TEXT NOT NULL REFERENCES identity(id),project_id TEXT REFERENCES project(id),kind TEXT NOT NULL,version TEXT,date TEXT,document_json TEXT NOT NULL);
    CREATE TABLE fingerprint(release_id TEXT REFERENCES release(id),identity_id TEXT NOT NULL REFERENCES identity(id),algorithm TEXT NOT NULL,value TEXT NOT NULL,source TEXT NOT NULL);
    CREATE INDEX fingerprint_lookup ON fingerprint(algorithm,value);
    CREATE TABLE external_release(provider TEXT NOT NULL,id TEXT NOT NULL,document_json TEXT NOT NULL,PRIMARY KEY(provider,id));
    CREATE TABLE build_info(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    BEGIN;`);
  const identity = db.prepare("INSERT INTO identity VALUES(?,?,?)");
  for (const row of rows) identity.run(row.id,row.system,JSON.stringify(row));
  const external = db.prepare("INSERT OR IGNORE INTO external_release VALUES(?,?,?)");
  for (const item of overlay) external.run(item.link.provider,item.link.id,JSON.stringify(item.release));
  const project = db.prepare("INSERT INTO project VALUES(?,?,?,?)");
  const release = db.prepare("INSERT INTO release VALUES(?,?,?,?,?,?,?)");
  const fingerprint = db.prepare("INSERT INTO fingerprint VALUES(?,?,?,?,?)");
  for (const row of rows) for (const p of row.projects ?? []) project.run(p.id,p.kind,p.baseGameId ?? null,JSON.stringify(p));
  for (const row of rows) {
    const releaseIds = new Map();
    for (const r of row.releases ?? []) {
      const id = r.id ?? crypto.createHash("sha256").update(JSON.stringify([row.id,r])).digest("hex");
      if (r.observationId !== undefined && r.observationId !== null) releaseIds.set(r.observationId,id);
      release.run(id,row.id,r.projectId ?? null,r.kind ?? "unknown",r.version ?? r.facts?.patch_ver ?? null,r.date ?? null,JSON.stringify(r));
    }
    for (const fp of row.fingerprints ?? []) {
      const observedRelease = fp.observationId !== undefined && fp.observationId !== null ? releaseIds.get(fp.observationId) : null;
      fingerprint.run(fp.releaseId ?? observedRelease ?? null,row.id,fp.algorithm,fp.value,fp.source ?? "unspecified");
    }
  }
  db.prepare("INSERT INTO build_info VALUES(?,?)").run("format","oc-retro-database/1");
  db.prepare("INSERT INTO build_info VALUES(?,?)").run("source_sha256",crypto.createHash("sha256").update(fs.readFileSync(values.input)).digest("hex"));
  if (values.links) db.prepare("INSERT INTO build_info VALUES(?,?)").run("crosswalk_sha256",crypto.createHash("sha256").update(fs.readFileSync(values.links)).digest("hex"));
  db.exec("COMMIT");
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Database validation failed");
  process.stdout.write(`${rows.length} identities compiled\n`);
} finally { db.close(); }
