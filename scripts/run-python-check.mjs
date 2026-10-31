// Runs python/check_golden.py with whichever Python exists on this machine:
// python3 (macOS/Linux), python or py (Windows).
import { spawnSync } from "node:child_process";

for (const cmd of ["python3", "python", "py"]) {
  const probe = spawnSync(cmd, ["-c", "import numpy"], { stdio: "ignore", shell: process.platform === "win32" });
  if (probe.status !== 0) continue;
  const run = spawnSync(cmd, ["python/check_golden.py"], { stdio: "inherit", shell: process.platform === "win32" });
  process.exit(run.status ?? 1);
}
console.error("No Python with numpy found. Install Python 3 (tick \"Add python.exe to PATH\"), then run: pip install numpy");
process.exit(1);
