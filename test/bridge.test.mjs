import assert from "node:assert/strict";
import test from "node:test";

import {
  Dida365Bridge,
  buildRuntimeEnv,
  formatConnectFailureMessage,
  redactSensitiveText,
} from "../dist/bridge.js";

function createRuntime({ callDelayMs = 0 } = {}) {
  const sessions = [];
  let connectCalls = 0;

  return {
    sessions,
    get connectCalls() {
      return connectCalls;
    },
    connectRuntime: async () => {
      connectCalls += 1;
      const session = createSession({ callDelayMs });
      sessions.push(session);
      return session;
    },
  };
}

function createSession({ callDelayMs }) {
  const callLog = [];
  const transport = {
    onclose: undefined,
    onerror: undefined,
    closeCalls: 0,
    async close() {
      this.closeCalls += 1;
      this.onclose?.();
    },
  };

  const client = {
    closeCalls: 0,
    async listTools() {
      return { tools: [] };
    },
    async callTool(params) {
      callLog.push(params);
      if (callDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, callDelayMs));
      }
      return { ok: true, params };
    },
    async close() {
      this.closeCalls += 1;
    },
  };

  return { client, transport, callLog };
}

function createBridge(runtime, overrides = {}) {
  return new Dida365Bridge({
    serverUrl: "https://mcp.dida365.com",
    command: "npx",
    args: ["-y", "mcp-remote@latest"],
    host: "127.0.0.1",
    authTimeoutSeconds: 300,
    requestTimeoutSeconds: 300,
    idleTimeoutSeconds: 60,
    connectRuntime: runtime.connectRuntime,
    ...overrides,
  });
}

test("reuses a single connection for concurrent calls in one bridge", async () => {
  const runtime = createRuntime({ callDelayMs: 20 });
  const bridge = createBridge(runtime);

  await Promise.all([
    bridge.callTool("list_projects", {}),
    bridge.callTool("get_user_preference", {}),
  ]);

  assert.equal(runtime.connectCalls, 1);
  assert.equal(runtime.sessions.length, 1);
  assert.equal(runtime.sessions[0].callLog.length, 2);

  await bridge.close();
});

test("closes idle connections after the configured timeout", async () => {
  const runtime = createRuntime();
  const bridge = createBridge(runtime, { idleTimeoutSeconds: 0.05 });

  await bridge.callTool("list_projects", {});
  await new Promise((resolve) => setTimeout(resolve, 120));

  assert.equal(runtime.sessions.length, 1);
  assert.equal(runtime.sessions[0].client.closeCalls, 1);
  assert.equal(runtime.sessions[0].transport.closeCalls, 1);
});

test("reconnects after idle shutdown", async () => {
  const runtime = createRuntime();
  const bridge = createBridge(runtime, { idleTimeoutSeconds: 0.05 });

  await bridge.callTool("list_projects", {});
  await new Promise((resolve) => setTimeout(resolve, 120));
  await bridge.callTool("list_projects", {});

  assert.equal(runtime.connectCalls, 2);

  await bridge.close();
});

test("redacts token-like secrets from stderr text", () => {
  const redacted = redactSensitiveText(
    '{"access_token":"abc","refresh_token":"def","id_token":"ghi"} https://example.com/callback?code=secret&access_token=token',
  );

  assert.equal(
    redacted,
    '{"access_token":"REDACTED","refresh_token":"REDACTED","id_token":"REDACTED"} https://example.com/callback?code=REDACTED&access_token=REDACTED',
  );
});

test("uses an isolated npm cache under OPENCLAW_STATE_DIR by default", () => {
  const env = buildRuntimeEnv(
    { OPENCLAW_STATE_DIR: "/tmp/openclaw-dida365-state" },
    {},
  );

  assert.equal(env.NPM_CONFIG_CACHE, "/tmp/openclaw-dida365-state/npm");
  assert.equal(env.npm_config_cache, "/tmp/openclaw-dida365-state/npm");
});

test("preserves an explicitly configured npm cache", () => {
  const env = buildRuntimeEnv(
    { NPM_CONFIG_CACHE: "/tmp/custom-cache" },
    { OPENCLAW_STATE_DIR: "/tmp/openclaw-dida365-state" },
  );

  assert.equal(env.NPM_CONFIG_CACHE, "/tmp/custom-cache");
  assert.equal(env.npm_config_cache, undefined);
});

test("includes recent stderr lines in connect failure messages", () => {
  const message = formatConnectFailureMessage(
    new Error("Connection closed"),
    [
      "npm error code EPERM",
      "Your cache folder contains root-owned files",
    ],
    "https://mcp.dida365.com",
  );

  assert.match(message, /Connection closed/);
  assert.match(message, /EPERM/);
  assert.match(message, /root-owned files/);
});
