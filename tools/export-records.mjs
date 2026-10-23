import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { readRecords } from "../src/sqlite.mjs";
const { values } = parseArgs({ options: { db: { type: "string" }, output: { type: "string" } } });
if (!values.db || !values.output) throw new Error("Usage: node tools/export-records.mjs --db corpus.sqlite --output identities.json");
const db = new DatabaseSync(values.db, { readOnly: true });
try {
  const records = readRecords(db).map(({ ko, en, ja, ...row }) => ({
    ...row, titles: row.titles ?? { ko: ko || null, en: en || null, ja: ja || null },
    originalTitle: row.originalTitle ?? null, romanizations: row.romanizations ?? [], baseGameId: row.baseGameId ?? null,
  }));
  fs.writeFileSync(values.output, JSON.stringify({ version: 1, records }), { flag: "wx" });
  process.stdout.write(`${records.length} identities exported without library paths or inventory\n`);
} finally { db.close(); }
