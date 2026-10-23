import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
for (const dir of ["src", "tools", "test"]) {
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith(".mjs")) execFileSync(process.execPath, ["--check", path.join(dir,file)], { stdio: "inherit" });
    if (file.endsWith(".py")) execFileSync("python3", ["-c", "import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(),sys.argv[1],'exec')",path.join(dir,file)], { stdio: "inherit" });
  }
}
JSON.parse(fs.readFileSync("schema.json", "utf8"));
