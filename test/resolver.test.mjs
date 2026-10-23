import { test } from "node:test";
import assert from "node:assert/strict";
import { createResolver, splitName } from "../src/resolver.mjs";

const records = [
  { id: "a", system: "gba", ko: "별빛 항로", en: "Starlight Exploration Adventure", aliases: ["Stellar Trail"], sources: ["fixture"], fingerprints: [{ algorithm: "sha256", value: "a".repeat(64), scope: "content" }] },
  { id: "b", system: "gba", ko: "별빛 항로 2", en: "Starlight Exploration Adventure II", sources: ["fixture"] },
  { id: "c", system: "snes", ko: "별빛 항로", en: "Starlight Exploration Adventure", sources: ["fixture"] },
];
test("lookup titles and patch tags are separate, including nested aliases", () => {
  assert.deepEqual(splitName("별빛 항로 (Starlight Route (Sky)) (Korea) [J-K v1.2].gba"), { ko: "별빛 항로", en: "Starlight Route (Sky)", suffix: " (Korea) [J-K v1.2]" });
  assert.deepEqual(splitName("Starlight Route (USA).gba"), { ko: "", en: "Starlight Route", suffix: " (USA)" });
});
test("exact aliases, filename decomposition and extension inference stay within their system", () => {
  const r = createResolver(records);
  assert.equal(r.resolve({ name: "Stellar Trail.gba" }).id, "a");
  assert.equal(r.resolve({ system: "sfc", name: "Starlight Exploration Adventure.zip" }).id, "c");
  assert.equal(r.resolve({ system: "gba", name: "별빛 항로 (Starlight Exploration Adventure) [J-K v1.2].gba" }).id, "a");
  assert.equal(r.resolve({ name: "Stellar Trail.zip" }).reason, "system-required");
  assert.equal(r.resolve({ system: "snes", name: "Stellar Trail.gba" }).reason, "system-conflict");
});
test("hashes outrank title conflicts; truncated hashes and CRCs never count as full-file proof", () => {
  const r = createResolver(records);
  assert.equal(r.resolve({ system: "gba", name: "Different.gba", sha256: "a".repeat(64) }).by, "hash");
  assert.equal(r.resolve({ system: "gba", name: "Different.gba", sha256: "a".repeat(32) }).status, "unmatched");
});
test("one typo in a long distinct title can resolve but sequel numbers cannot", () => {
  const r = createResolver(records);
  const typo = r.resolve({ system: "gba", name: "Starlight Exploration Adventuer.gba" });
  assert.equal(typo.id, "a");
  assert.equal(typo.by, "fuzzy-title");
  assert.equal(r.resolve({ system: "gba", name: "Starlight Exploration Adventure III.gba" }).status, "unmatched");
});
test("ambiguous aliases, close runners, subtitle changes and mods require review", () => {
  const r = createResolver([...records, { id: "d", system: "gba", ko: "다른 항로", en: "Stellar Trail", sources: ["fixture"] }]);
  assert.equal(r.resolve({ name: "Stellar Trail.gba" }).reason, "ambiguous");
  assert.equal(r.resolve({ system: "gba", name: "Starlight Exploration Adventure [Hack].zip" }).reason, "variant-needs-evidence");
  assert.equal(r.resolve({ system: "gba", name: "다른 제목 (Starlight Exploration Adventure).zip" }).reason, "localized-title-conflict");
  const near = createResolver([
    { id: "one", system: "gba", en: "Starlight Exploration Adventure", sources: ["fixture"] },
    { id: "two", system: "gba", en: "Starlight Exploration Adventures", sources: ["fixture"] },
  ]);
  assert.equal(near.resolve({ name: "Starlight Exploration Adventuer.gba" }).status, "review");
  assert.notEqual(r.resolve({ name: "Starlight Exploration Adventure - Sky.gba" }).status, "matched");
});
test("a name observed only on a file is not independent confirmation", () => {
  const r = createResolver([{ id: "a", system: "gba", en: "Starlight Route", sources: ["rpi-filename"] }]);
  assert.equal(r.resolve({ name: "Starlight Route.gba" }).reason, "filename-observation-only");
});
test("arcade short sets are exact and inherited metadata IDs never identify hacks", () => {
  const r = createResolver([
    { id: "set", system: "arcade", setName: "starset", en: "Starlight", aliases: ["starset"], sources: ["fixture"] },
    { id: "hack", system: "gba", en: "Starlight Hack", kind: "romhack", links: [{ provider: "launchbox", id: "10", status: "verified", relation: "base" }] },
  ]);
  assert.equal(r.resolve({ system: "arcade", name: "starset.zip" }).id, "set");
  assert.equal(r.resolve({ system: "arcade", name: "starste.zip" }).reason, "unknown-arcade-set");
  assert.equal(r.resolve({ system: "arcade", name: "Starlight.zip" }).reason, "arcade-display-name");
  assert.equal(r.resolve({ system: "gba", name: "Other.gba", providerIds: { launchbox: "10" } }).status, "unmatched");
});

test("patch, audio-track and unspecified fingerprints stay references", () => {
  for (const scope of ["patch-file", "track", undefined]) {
    const r = createResolver([{ id: "a", system: "gba", en: "Starlight Route", sources: ["fixture"], fingerprints: [
      { algorithm: "sha256", value: "a".repeat(64), scope },
    ] }]);
    assert.notEqual(r.resolve({ system: "gba", name: "Unlabeled.zip", sha256: "a".repeat(64) }).by, "hash");
  }
});

test("source-backed originals and romanizations are searchable without replacing display titles", () => {
  const r = createResolver([{ id: "a", system: "gba", titles: { ko: "별빛 항로", en: "Starlight Route", ja: null },
    originalTitle: { text: "Hoshi no Michi", language: "ja-Latn", source: "fixture" },
    romanizations: [{ text: "Hoshi Road", source: "fixture" }], sources: ["fixture"] }]);
  for (const name of ["Hoshi no Michi.gba", "Hoshi Road.gba"]) {
    const result = r.resolve({ name });
    assert.equal(result.id,"a");
    assert.equal(result.candidates[0].titles.en,"Starlight Route");
    assert.equal(result.candidates[0].originalTitle.language,"ja-Latn");
  }
});
