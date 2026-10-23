import fs from "node:fs";
import { parseArgs } from "node:util";
import { openResolver } from "../src/sqlite.mjs";

const { values } = parseArgs({ options: { db: { type: "string" }, inventory: { type: "string" }, output: { type: "string" } } });
if (!values.db || !values.inventory || !values.output) throw new Error("Usage: node tools/resolve.mjs --db corpus.sqlite --inventory inventory.json --output report.json");
// Exclusive creation prevents accidentally overwriting an input or an existing report.
const output = fs.openSync(values.output, "wx");
const reader = openResolver(values.db);
try {
  const input = JSON.parse(fs.readFileSync(values.inventory, "utf8"));
  const inventory = Array.isArray(input) ? input : input.items;
  if (!Array.isArray(inventory)) throw new Error("Inventory must be an array or an object with items");
  const resolver = reader.snapshot();
  const started = performance.now();
  const items = inventory.map((row) => ({ input: row, resolution: resolver.resolve(row) }));
  const counts = {};
  for (const row of items) {
    const result = row.resolution;
    const key = `${result.status}:${result.by ?? result.reason}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const summary = { identities: resolver.size, files: items.length, elapsedMs: Math.round(performance.now() - started), counts };
  fs.writeFileSync(output, JSON.stringify({ version: 1, summary, items }, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
  reader.close();
  fs.closeSync(output);
}
