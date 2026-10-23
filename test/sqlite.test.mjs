import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openResolver } from "../src/sqlite.mjs";

test("an external WAL edit and a database replacement reload without a restart", (t) => {
  const parent = new URL("../artifacts/test-tmp/", import.meta.url);
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent.pathname, "sqlite-"));
  const file = path.join(root, "names.sqlite");
  const writer = new DatabaseSync(file);
  writer.exec("PRAGMA journal_mode=WAL; CREATE TABLE identity(id TEXT PRIMARY KEY, document_json TEXT NOT NULL)");
  const insert = (db, en) => db.prepare("INSERT OR REPLACE INTO identity VALUES(?,?)").run("a", JSON.stringify({ id: "a", system: "gba", titles: { en }, sources: ["fixture"] }));
  insert(writer, "Starlight Route");
  const reader = openResolver(file);
  t.after(() => { reader.close(); writer.close(); fs.rmSync(root, { recursive: true, force: true }); });
  assert.equal(reader.resolve({ name: "Starlight Route.gba" }).id, "a");
  insert(writer, "Moonlight Voyage");
  assert.equal(reader.resolve({ name: "Moonlight Voyage.gba" }).id, "a");
  assert.notEqual(reader.resolve({ name: "Starlight Route.gba" }).status, "matched");
  const next = path.join(root, "next.sqlite");
  const replacement = new DatabaseSync(next);
  replacement.exec("CREATE TABLE identity(id TEXT PRIMARY KEY, document_json TEXT NOT NULL)");
  insert(replacement, "Cloudlight Adventure");
  replacement.close();
  // Close the old WAL connection before replacing its database file.
  reader.close();
  writer.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  fs.renameSync(next, file);
  assert.equal(reader.resolve({ name: "Cloudlight Adventure.gba" }).id, "a");
  const readOnly = new DatabaseSync(file, { readOnly: true });
  try { assert.throws(() => insert(readOnly, "Other Title"), /readonly|read-only/i); }
  finally { readOnly.close(); }
});
