import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import plugin from "../dist/index.js";
import { resetSharedBridgeStateForTests } from "../dist/runtime-state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(projectRoot, "data", "mcp-tools.json");

function createApi(pluginConfig = {}) {
  const registered = [];
  const infoMessages = [];
  const warnMessages = [];

  return {
    registered,
    infoMessages,
    warnMessages,
    api: {
      pluginConfig: {
        manifestPath,
        ...pluginConfig,
      },
      logger: {
        info(message) {
          infoMessages.push(message);
        },
        warn(message) {
          warnMessages.push(message);
        },
        error() {},
      },
      registerTool(tool) {
        registered.push(tool);
      },
    },
  };
}

test("registers all official tools from the manifest by default", async () => {
  await resetSharedBridgeStateForTests();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const { api, registered, infoMessages } = createApi();

  plugin.register(api);

  assert.equal(registered.length, manifest.tools.length);
  assert.deepEqual(
    registered.map((tool) => tool.name),
    manifest.tools.map((tool) => tool.name),
  );
  assert.match(
    infoMessages.join("\n"),
    /tools\.alsoAllow: \["group:plugins"\]/,
  );

  await resetSharedBridgeStateForTests();
});

test("allowlist and denylist narrow the registered tool set", async () => {
  await resetSharedBridgeStateForTests();
  const { api, registered } = createApi({
    toolAllowlist: ["list_projects", "create_task"],
    toolDenylist: ["create_task"],
  });

  plugin.register(api);

  assert.deepEqual(registered.map((tool) => tool.name), ["list_projects"]);

  await resetSharedBridgeStateForTests();
});
