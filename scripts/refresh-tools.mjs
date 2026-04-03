import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(projectRoot, "data", "mcp-tools.json");
const serverUrl = process.env.DIDA365_MCP_SERVER_URL ?? "https://mcp.dida365.com";
const host = process.env.DIDA365_MCP_HOST ?? "127.0.0.1";
const authTimeoutSeconds = Number(process.env.DIDA365_MCP_AUTH_TIMEOUT_SECONDS ?? "300");
const requestTimeoutSeconds = Number(process.env.DIDA365_MCP_REQUEST_TIMEOUT_SECONDS ?? "300");

const transport = new StdioClientTransport({
  command: "npx",
  args: [
    "-y",
    "mcp-remote@latest",
    serverUrl,
    "--host",
    host,
    "--auth-timeout",
    String(authTimeoutSeconds),
  ],
  env: buildRuntimeEnv(process.env),
  stderr: "pipe",
});

pipeStderr(transport.stderr);

const client = new Client(
  { name: "openclaw-dida365-mcp-refresh", version: "0.2.2" },
  { capabilities: {} },
);

try {
  await client.connect(transport, {
    timeout: requestTimeoutSeconds * 1000,
    resetTimeoutOnProgress: true,
    maxTotalTimeout: requestTimeoutSeconds * 1000,
  });

  const result = await client.listTools(undefined, {
    timeout: requestTimeoutSeconds * 1000,
    resetTimeoutOnProgress: true,
    maxTotalTimeout: requestTimeoutSeconds * 1000,
  });
  const manifest = {
    generatedAt: new Date().toISOString(),
    serverUrl,
    tools: result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
      execution: tool.execution,
      title: tool.title,
    })),
  };

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Saved ${manifest.tools.length} tool(s) to ${manifestPath}`);
  for (const tool of manifest.tools) {
    console.log(tool.name);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
  await transport.close().catch(() => {});
}

function pipeStderr(stream) {
  if (!stream) {
    return;
  }
  stream.on("data", (chunk) => {
    const text = redactSensitiveText(String(chunk));
    if (text) {
      process.stderr.write(text);
    }
  });
}

function redactSensitiveText(text) {
  return text
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"REDACTED"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/gi, '"refresh_token":"REDACTED"')
    .replace(/"id_token"\s*:\s*"[^"]+"/gi, '"id_token":"REDACTED"')
    .replace(/([?&](?:access_token|refresh_token|id_token|code)=)[^&#\s"]+/gi, "$1REDACTED")
    .replace(/\b((?:access_token|refresh_token|id_token|code)=)[^&\s"]+/gi, "$1REDACTED");
}

function buildRuntimeEnv(env) {
  const merged = stringifyEnv(env);
  const configuredCache = [merged.NPM_CONFIG_CACHE, merged.npm_config_cache]
    .find((value) => typeof value === "string" && value.trim().length > 0);

  if (configuredCache) {
    return merged;
  }

  const stateDir = merged.OPENCLAW_STATE_DIR?.trim();
  const npmCacheDir = stateDir
    ? path.resolve(stateDir, "npm")
    : path.join(os.homedir(), ".openclaw", "cache", "openclaw-dida365-mcp", "npm");

  return {
    ...merged,
    NPM_CONFIG_CACHE: npmCacheDir,
    npm_config_cache: npmCacheDir,
  };
}

function stringifyEnv(env) {
  return Object.fromEntries(
    Object.entries(env).filter((entry) => typeof entry[1] === "string"),
  );
}
