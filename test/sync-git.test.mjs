import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const projectDir = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = fileURLToPath(new URL("../scripts/sync-to-git.sh", import.meta.url));

test("sync-git keeps the target .git directory while deleting stale files", async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "dida365-sync-target-"));
  const gitDir = path.join(targetDir, ".git");
  const staleFile = path.join(targetDir, "stale.txt");

  await fs.mkdir(gitDir, { recursive: true });
  await fs.writeFile(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
  await fs.writeFile(staleFile, "remove me\n");

  await execFileAsync("bash", [scriptPath, targetDir], {
    cwd: projectDir,
  });

  await assert.doesNotReject(fs.access(gitDir));
  await assert.rejects(fs.access(staleFile));
});
