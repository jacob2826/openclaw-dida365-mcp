import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assertSafePluginConfig, resolvePluginConfig } from "../dist/config.js";
import { loadToolsManifest, selectToolsFromManifest, writeToolsManifest } from "../dist/manifest.js";

test("resolvePluginConfig provides stable defaults", () => {
  const config = resolvePluginConfig({}, "/tmp/plugin-root");

  assert.equal(config.serverUrl, "https://mcp.dida365.com");
  assert.equal(config.command, "npx");
  assert.equal(config.idleTimeoutSeconds, 600);
  assert.deepEqual(config.toolAllowlist, []);
  assert.deepEqual(config.toolDenylist, []);
  assert.equal(config.manifestPath, "/tmp/plugin-root/data/mcp-tools.json");
});

test("assertSafePluginConfig rejects insecure remote MCP URLs", () => {
  const config = {
    ...resolvePluginConfig({}, "/tmp/plugin-root"),
    serverUrl: "http://example.com/mcp",
  };

  assert.throws(() => assertSafePluginConfig(config), /Refusing unsafe serverUrl/);
});

test("assertSafePluginConfig rejects empty command strings", () => {
  const config = {
    ...resolvePluginConfig({}, "/tmp/plugin-root"),
    command: "   ",
  };

  assert.throws(() => assertSafePluginConfig(config), /cannot be empty/i);
});

test("assertSafePluginConfig allows loopback http URLs", () => {
  const config = {
    ...resolvePluginConfig({}, "/tmp/plugin-root"),
    serverUrl: "http://127.0.0.1:3000/mcp",
  };

  assert.doesNotThrow(() => assertSafePluginConfig(config));
});

test("writeToolsManifest and loadToolsManifest round-trip", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dida365-manifest-"));
  const manifestPath = path.join(tempDir, "mcp-tools.json");

  writeToolsManifest(manifestPath, {
    generatedAt: "2026-03-24T00:00:00.000Z",
    serverUrl: "https://mcp.dida365.com",
    tools: [
      {
        name: "list_projects",
        description: "List projects",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  });

  const loaded = loadToolsManifest(manifestPath);
  assert.equal(loaded.tools.length, 1);
  assert.equal(loaded.tools[0].name, "list_projects");
});

test("selectToolsFromManifest filters invalid, duplicate, allowlisted, and denied tools", () => {
  const result = selectToolsFromManifest(
    {
      generatedAt: "2026-03-24T00:00:00.000Z",
      serverUrl: "https://mcp.dida365.com",
      tools: [
        { name: "list_projects", inputSchema: { type: "object" } },
        { name: "list_projects", inputSchema: { type: "object" } },
        { name: "bad-name", inputSchema: { type: "object" } },
        { name: "create_task", inputSchema: { type: "object" } },
      ],
    },
    {
      allowlist: ["list_projects", "create_task"],
      denylist: ["create_task"],
    },
  );

  assert.deepEqual(result.tools.map((tool) => tool.name), ["list_projects"]);
  assert.equal(result.warnings.length, 2);
});
