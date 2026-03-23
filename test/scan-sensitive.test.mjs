import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanDirectory } from "../scripts/scan-sensitive.mjs";

test("scanDirectory finds local paths and secret-like values", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dida365-sensitive-"));
  const localPrefix = ["/Users", "jacob"].join("/");
  const openAiLikeKey = ["sk-", "1234567890abcdefghijklmnop"].join("");
  const appSecret = ["abcdef", "1234567890"].join("");
  await fs.writeFile(
    path.join(tempDir, "sample.txt"),
    [
      `const target = "${localPrefix}/private/file.txt";`,
      `const token = "${openAiLikeKey}";`,
      `const appSecret = "${appSecret}";`,
    ].join("\n"),
  );

  const findings = await scanDirectory(tempDir, { localPathPrefix: localPrefix });

  assert.equal(findings.length, 4);
  assert.deepEqual(
    findings.map((finding) => finding.kind),
    ["local path", "openai-like key", "token assignment", "appSecret assignment"],
  );
});

test("scanDirectory ignores obvious placeholders", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dida365-sensitive-"));
  await fs.writeFile(
    path.join(tempDir, "sample.txt"),
    [
      'const token = "REDACTED";',
      'const apiKey = "<your-api-key>";',
      'const secret = "example-secret";',
    ].join("\n"),
  );

  const findings = await scanDirectory(tempDir, { localPathPrefix: ["/Users", "jacob"].join("/") });

  assert.equal(findings.length, 0);
});
