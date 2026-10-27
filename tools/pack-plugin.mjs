// Builds the CookingFoil plugin zip: plugin.json (version from package.json), index.js, names.json,
// and the license and credit files the data must travel with.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { out: { type: "string" } } });
if (!values.out) throw new Error("Usage: node tools/pack-plugin.mjs --out <empty or new directory>");
const root = path.resolve(import.meta.dirname, "..");
const out = path.resolve(values.out);
fs.mkdirSync(out, { recursive: true });
if (fs.readdirSync(out).length) throw new Error(`${out} is not empty`);

const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const node = (script, ...args) => execFileSync(process.execPath, [path.join(root, "tools", script), ...args], { stdio: ["ignore", "inherit", "inherit"] });
const db = path.join(out, "names.sqlite");
node("build.mjs", "--input", path.join(root, "datasets/identities.jsonl"), "--links", path.join(root, "datasets/libretro-crosswalk.jsonl"), "--output", db);

const dir = path.join(out, "oc-retro-db");
fs.mkdirSync(dir);
node("export-cookingfoil.mjs", "--db", db, "--output", path.join(dir, "names.json"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin/plugin.json"), "utf8"));
fs.writeFileSync(path.join(dir, "plugin.json"), `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
for (const f of ["plugin/index.js", "CREDITS.md", "LICENSE", "LICENSE-DATA.md"]) fs.copyFileSync(path.join(root, f), path.join(dir, path.basename(f)));

const zip = path.join(out, `oc-retro-db-${version}.zip`);
execFileSync("zip", ["-q", "-r", "-X", zip, "oc-retro-db"], { cwd: out });
process.stdout.write(`${zip}\n`);
