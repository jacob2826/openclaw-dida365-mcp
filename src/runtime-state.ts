import process from "node:process";

import type { ResolvedPluginConfig } from "./config.js";
import { Dida365Bridge, type BridgeLogger, type BridgeOptions } from "./bridge.js";

interface SharedState {
  bridge: Dida365Bridge | null;
  configKey: string | null;
  exitHookInstalled: boolean;
}

const STATE_KEY = Symbol.for("openclaw-dida365-mcp.shared-state");

export function getSharedBridgeForConfig(
  config: ResolvedPluginConfig,
  logger?: BridgeLogger,
  factory: (options: BridgeOptions) => Dida365Bridge = (options) => new Dida365Bridge(options),
): Dida365Bridge {
  const state = getState();
  const configKey = JSON.stringify(config);

  if (state.bridge && state.configKey === configKey) {
    state.bridge.setLogger(logger);
    return state.bridge;
  }

  if (state.bridge) {
    void state.bridge.close();
  }

  const bridge = factory({
    ...config,
    logger,
  });

  state.bridge = bridge;
  state.configKey = configKey;

  if (!state.exitHookInstalled) {
    process.once("exit", () => {
      const current = getState().bridge;
      if (current) {
        void current.close();
      }
    });
    state.exitHookInstalled = true;
  }

  return bridge;
}

export async function resetSharedBridgeStateForTests(): Promise<void> {
  const state = getState();
  if (state.bridge) {
    await state.bridge.close();
  }
  state.bridge = null;
  state.configKey = null;
}

function getState(): SharedState {
  const globalRecord = globalThis as Record<PropertyKey, unknown>;
  if (!globalRecord[STATE_KEY]) {
    globalRecord[STATE_KEY] = {
      bridge: null,
      configKey: null,
      exitHookInstalled: false,
    } satisfies SharedState;
  }
  return globalRecord[STATE_KEY] as SharedState;
}
