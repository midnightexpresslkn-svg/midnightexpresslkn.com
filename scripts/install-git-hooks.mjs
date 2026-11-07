import { spawnSync } from "node:child_process";
import fs from "node:fs";

if (!fs.existsSync(".git")) process.exit(0);

spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  stdio: "ignore",
});
