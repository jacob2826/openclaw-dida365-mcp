import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_IGNORES = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".sync-git.local",
  ".DS_Store",
]);

const TOKEN_PATTERNS = [
  { kind: "openai-like key", regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { kind: "google api key", regex: /\bAIza[0-9A-Za-z_-]{20,}\b/g },
  { kind: "github token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { kind: "slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
];

const ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|app[_-]?secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|id[_-]?token|token|password|secret)\b\s*[:=]\s*["'`]?([^\s"'`,;]+)["'`]?/gi;

export async function scanDirectory(rootDir, options = {}) {
  const findings = [];
  const localPathPrefix = options.localPathPrefix ?? process.env.LOCAL_PATH_PREFIX ?? "";
  const root = path.resolve(rootDir);
  await walk(root, root, findings, localPathPrefix);
  return findings;
}

async function walk(root, current, findings, localPathPrefix) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (DEFAULT_IGNORES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath) || entry.name;

    if (entry.isDirectory()) {
      await walk(root, absolutePath, findings, localPathPrefix);
      continue;
    }

    const buffer = await fs.readFile(absolutePath);
    if (isBinary(buffer)) {
      continue;
    }

    const text = buffer.toString("utf8");
    const lines = text.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      if (localPathPrefix && line.includes(localPathPrefix)) {
        findings.push({
          file: relativePath,
          line: index + 1,
          kind: "local path",
          match: localPathPrefix,
        });
      }

      for (const pattern of TOKEN_PATTERNS) {
        pattern.regex.lastIndex = 0;
        const match = pattern.regex.exec(line);
        if (match) {
          findings.push({
            file: relativePath,
            line: index + 1,
            kind: pattern.kind,
            match: match[0],
          });
        }
      }

      ASSIGNMENT_PATTERN.lastIndex = 0;
      for (const match of line.matchAll(ASSIGNMENT_PATTERN)) {
        const key = match[1];
        const value = match[2];
        if (!shouldFlagAssignment(value)) {
          continue;
        }
        findings.push({
          file: relativePath,
          line: index + 1,
          kind: `${key} assignment`,
          match: `${key}=${value}`,
        });
      }
    }
  }
}

function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

function shouldFlagAssignment(value) {
  if (value.length < 8) {
    return false;
  }

  const normalized = value.toLowerCase();
  const placeholders = [
    "redacted",
    "example",
    "placeholder",
    "changeme",
    "dummy",
    "sample",
    "your-",
    "your_",
    "<",
    ">",
    "{",
    "}",
  ];

  if (placeholders.some((item) => normalized.includes(item))) {
    return false;
  }

  return /[A-Za-z0-9]/.test(value);
}

async function main() {
  const rootDir = process.argv[2];
  if (!rootDir) {
    console.error("Usage: node ./scripts/scan-sensitive.mjs <directory>");
    process.exit(1);
  }

  const findings = await scanDirectory(rootDir);
  if (findings.length === 0) {
    console.log(`No sensitive findings in ${path.resolve(rootDir)}`);
    return;
  }

  console.error(`Sensitive findings detected in ${path.resolve(rootDir)}:`);
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} [${finding.kind}] ${redactMatch(finding.match)}`,
    );
  }
  process.exit(1);
}

function redactMatch(match) {
  if (match.length <= 12) {
    return match;
  }
  return `${match.slice(0, 4)}...${match.slice(-4)}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
