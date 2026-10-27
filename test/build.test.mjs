import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

test("fingerprints without observation IDs cannot inherit an unrelated translated release", (t) => {
  const parent = new URL("../artifacts/test-tmp/",import.meta.url);
  fs.mkdirSync(parent,{recursive:true});
  const root = fs.mkdtempSync(path.join(parent.pathname,"build-"));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const input = path.join(root,"input.jsonl");
  const output = path.join(root,"output.sqlite");
  const rows = [{ id: "a", system: "gba", kind: "unknown", titles: { ko: "별빛 항로", en: "Starlight Route" }, sources: ["fixture"],
    aliases: ["Starlight Route [Hack]"],
    releases: [{ id:"r1",kind:"translation",version:"v1.2",projectId:"p1" }],
    fingerprints: [{algorithm:"sha256",value:"a".repeat(64),scope:"content",source:"fixture"},
      {algorithm:"sha256",value:"b".repeat(64),scope:"patch-file",source:"fixture"}],
  }, { id:"base",system:"gba",kind:"official",titles:{en:"Starlight Base"},sources:["fixture"],
    projects:[{id:"p1",kind:"translation",baseGameId:"base"}] }];
  fs.writeFileSync(input,rows.map((r)=>JSON.stringify(r)).join("\n"));
  execFileSync(process.execPath,[new URL("../tools/build.mjs",import.meta.url).pathname,"--input",input,"--output",output]);
  const db = new DatabaseSync(output,{readOnly:true});
  try { assert.ok(db.prepare("SELECT release_id FROM fingerprint").all().every((row)=>row.release_id===null)); }
  finally { db.close(); }
  const exported=path.join(root,"retro-ko-names.json");
  execFileSync(process.execPath,[new URL("../tools/export-cookingfoil.mjs",import.meta.url).pathname,"--db",output,"--output",exported]);
  const data=JSON.parse(fs.readFileSync(exported,"utf8"));
  assert.ok(data.systems.gba["a".repeat(32)]);
  assert.equal(data.systems.gba["b".repeat(32)],undefined);
  assert.equal(data.titles.gba?.["starlight route"],undefined);
});

test("the CookingFoil export carries one CRC-32 and SHA-1 with the hash, and keys a record without SHA-256 by them", (t) => {
  const parent = new URL("../artifacts/test-tmp/",import.meta.url);
  fs.mkdirSync(parent,{recursive:true});
  const root = fs.mkdtempSync(path.join(parent.pathname,"export-"));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const input = path.join(root,"input.jsonl");
  const output = path.join(root,"output.sqlite");
  const fp = (algorithm,value) => ({ algorithm,value,scope:"content",source:"fixture" });
  const rows = [
    { id:"a",system:"nes",kind:"unknown",titles:{ko:"별빛 항로",en:"Starlight Route"},sources:["fixture"],
      fingerprints:[fp("sha256","a".repeat(64)),fp("crc32","0BADF00D"),fp("sha1-prefix128","c".repeat(32))] },
    { id:"b",system:"nes",kind:"unknown",titles:{ko:"달빛 항로",en:"Moonlight Route"},sources:["fixture"],
      fingerprints:[fp("crc32","1234abcd")] },
    { id:"c",system:"nes",kind:"unknown",titles:{ko:"두 파일",en:"Two Files"},sources:["fixture"],
      fingerprints:[fp("sha256","d".repeat(64)),fp("crc32","11111111"),fp("crc32","22222222")] },
  ];
  fs.writeFileSync(input,rows.map((r)=>JSON.stringify(r)).join("\n"));
  execFileSync(process.execPath,[new URL("../tools/build.mjs",import.meta.url).pathname,"--input",input,"--output",output]);
  const exported=path.join(root,"names.json");
  execFileSync(process.execPath,[new URL("../tools/export-cookingfoil.mjs",import.meta.url).pathname,"--db",output,"--output",exported]);
  const nes=JSON.parse(fs.readFileSync(exported,"utf8")).systems.nes;
  assert.deepEqual(nes["a".repeat(32)],["별빛 항로","Starlight Route","0badf00d","c".repeat(32)]);
  assert.deepEqual(nes["crc32:1234abcd"],["달빛 항로","Moonlight Route","1234abcd",""]);
  assert.equal(nes["d".repeat(32)][2],"","a set with two CRCs pairs neither with its SHA-256");
});

test("pack-plugin writes a CookingFoil plugin zip with its license and credits", (t) => {
  const parent = new URL("../artifacts/test-tmp/",import.meta.url);
  fs.mkdirSync(parent,{recursive:true});
  const out = fs.mkdtempSync(path.join(parent.pathname,"pack-"));
  t.after(() => fs.rmSync(out,{recursive:true,force:true}));
  execFileSync(process.execPath,[new URL("../tools/pack-plugin.mjs",import.meta.url).pathname,"--out",out],{stdio:"ignore"});
  const { version } = JSON.parse(fs.readFileSync(new URL("../package.json",import.meta.url),"utf8"));
  const dir = path.join(out,"oc-retro-db");
  const manifest = JSON.parse(fs.readFileSync(path.join(dir,"plugin.json"),"utf8"));
  assert.equal(manifest.version,version);
  assert.deepEqual(manifest.provides,["names"]);
  for (const f of ["index.js","names.json","CREDITS.md","LICENSE","LICENSE-DATA.md"]) assert.ok(fs.existsSync(path.join(dir,f)),f);
  assert.ok(fs.existsSync(path.join(out,`oc-retro-db-${version}.zip`)));
});
