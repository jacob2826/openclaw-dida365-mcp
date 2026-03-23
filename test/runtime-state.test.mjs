import assert from "node:assert/strict";
import test from "node:test";

import { Dida365Bridge } from "../dist/bridge.js";
import { resolvePluginConfig } from "../dist/config.js";
import { getSharedBridgeForConfig, resetSharedBridgeStateForTests } from "../dist/runtime-state.js";

class TestBridge extends Dida365Bridge {
  closeCalls = 0;

  async close() {
    this.closeCalls += 1;
    await super.close();
  }
}

test("shared bridge returns the same instance for the same config", async () => {
  await resetSharedBridgeStateForTests();
  const config = resolvePluginConfig({}, "/tmp/plugin-root");
  const created = [];

  const first = getSharedBridgeForConfig(
    config,
    undefined,
    (options) => {
      const bridge = new TestBridge({
        ...options,
        connectRuntime: async () => ({
          client: {
            async listTools() {
              return { tools: [] };
            },
            async callTool() {
              return {};
            },
            async close() {},
          },
          transport: {
            async close() {},
          },
        }),
      });
      created.push(bridge);
      return bridge;
    },
  );

  const second = getSharedBridgeForConfig(
    config,
    { info() {} },
    () => {
      throw new Error("Factory should not be called for identical config");
    },
  );

  assert.strictEqual(first, second);
  assert.equal(created.length, 1);
});

test("shared bridge replaces the instance when config changes", async () => {
  await resetSharedBridgeStateForTests();
  const base = resolvePluginConfig({}, "/tmp/plugin-root");
  const first = getSharedBridgeForConfig(
    base,
    undefined,
    (options) =>
      new TestBridge({
        ...options,
        connectRuntime: async () => ({
          client: {
            async listTools() {
              return { tools: [] };
            },
            async callTool() {
              return {};
            },
            async close() {},
          },
          transport: {
            async close() {},
          },
        }),
      }),
  );

  const second = getSharedBridgeForConfig(
    { ...base, idleTimeoutSeconds: 1 },
    undefined,
    (options) =>
      new TestBridge({
        ...options,
        connectRuntime: async () => ({
          client: {
            async listTools() {
              return { tools: [] };
            },
            async callTool() {
              return {};
            },
            async close() {},
          },
          transport: {
            async close() {},
          },
        }),
      }),
  );

  assert.notStrictEqual(first, second);
  assert.equal(first.closeCalls, 1);
});
