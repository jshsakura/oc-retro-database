import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the published corpus keeps titles separate and contains no library or account fields", () => {
  const lines = fs.readFileSync(new URL("../datasets/identities.jsonl", import.meta.url), "utf8").trim().split("\n");
  const ids = new Set();
  for (const line of lines) {
    const row = JSON.parse(line);
    assert.ok(row.id && row.system && row.titles && row.sources);
    assert.equal(ids.has(row.id), false);
    ids.add(row.id);
    assert.ok(Object.hasOwn(row,"originalTitle"));
    if (row.originalTitle) assert.ok(row.originalTitle.text && row.originalTitle.language && row.originalTitle.source);
    assert.doesNotMatch(line, /\/home\/|\/tmp\/|"(?:session_id|rom_path|cover_path|password|api_key)"/);
  }
  assert.ok(ids.size > 0);
});

test("every description sidecar entry points to a known identity", () => {
  const ids = new Set(fs.readFileSync(new URL("../datasets/identities.jsonl", import.meta.url), "utf8").trim().split("\n").map((line) => JSON.parse(line).id));
  const lines = fs.readFileSync(new URL("../datasets/descriptions.jsonl", import.meta.url), "utf8").trim().split("\n");
  for (const line of lines) {
    const row = JSON.parse(line);
    assert.ok(ids.has(row.id));
    assert.ok(Array.isArray(row.descriptions) && row.descriptions.length > 0);
    for (const d of row.descriptions) {
      assert.ok(d.text && d.language && d.source);
    }
  }
  assert.ok(lines.length > 4000);
});

test("every libretro crosswalk points to a known identity and records its uncertainty", () => {
  const rows = fs.readFileSync(new URL("../datasets/identities.jsonl", import.meta.url), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const ids = new Set(rows.map((r) => r.id));
  const lines = fs.readFileSync(new URL("../datasets/libretro-crosswalk.jsonl", import.meta.url), "utf8").trim().split("\n");
  for (const line of lines) {
    const row = JSON.parse(line);
    assert.ok(ids.has(row.identityId));
    assert.ok(["ambiguous","title-unique"].includes(row.link.status));
    assert.equal(row.link.mediaAvailability,"unknown");
    assert.equal(row.link.relation,"release-reference");
    assert.ok(row.release.hashScope);
  }
});
