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
