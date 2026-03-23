import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertSafePluginConfig, resolvePluginConfig } from "./config.js";
import { loadToolsManifest, selectToolsFromManifest, writeToolsManifest } from "./manifest.js";
import { getSharedBridgeForConfig } from "./runtime-state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, "..");

interface OpenClawPluginApi {
  pluginConfig?: Record<string, unknown>;
  logger: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
    debug?: (message: string) => void;
  };
  registerTool: (
    tool: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
      execute: (toolCallId: string, params: Record<string, unknown> | undefined) => Promise<unknown>;
    },
    options?: {
      optional?: boolean;
      names?: string[];
    },
  ) => void;
}

const plugin = {
  id: "openclaw-dida365-mcp",
  name: "Dida365 MCP",
  description: "Expose official Dida365 MCP tools to OpenClaw's normal chat agent.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  register(api: OpenClawPluginApi) {
    const config = resolvePluginConfig(api.pluginConfig, pluginRoot);
    assertSafePluginConfig(config);
    const bridge = getSharedBridgeForConfig(config, api.logger);

    if (config.refreshManifestOnStartup) {
      void bridge.listTools()
        .then((tools) => {
          writeToolsManifest(config.manifestPath, {
            generatedAt: new Date().toISOString(),
            serverUrl: config.serverUrl,
            tools,
          });
          api.logger.info?.(`[openclaw-dida365-mcp] refreshed manifest at ${config.manifestPath}`);
        })
        .catch((error) => {
          api.logger.warn?.(
            `[openclaw-dida365-mcp] manifest refresh failed on startup: ${String(error)}`,
          );
        });
    }

    if (!fs.existsSync(config.manifestPath)) {
      api.logger.warn?.(
        `[openclaw-dida365-mcp] missing manifest ${config.manifestPath}; run npm run refresh-tools first`,
      );
      return;
    }

    const manifest = loadToolsManifest(config.manifestPath);
    if (manifest.serverUrl && manifest.serverUrl !== config.serverUrl) {
      api.logger.warn?.(
        `[openclaw-dida365-mcp] manifest serverUrl ${manifest.serverUrl} does not match active serverUrl ${config.serverUrl}`,
      );
    }
    const selection = selectToolsFromManifest(manifest, {
      allowlist: config.toolAllowlist,
      denylist: config.toolDenylist,
    });

    for (const warning of selection.warnings) {
      api.logger.warn?.(`[openclaw-dida365-mcp] ${warning}`);
    }

    if (selection.tools.length === 0) {
      api.logger.warn?.("[openclaw-dida365-mcp] no tools selected from manifest");
    }

    for (const tool of selection.tools) {
      api.registerTool(
        {
          name: tool.name,
          description: buildToolDescription(tool),
          parameters: tool.inputSchema,
          async execute(_toolCallId, params) {
            return bridge.callTool(tool.name, params);
          },
        },
        { optional: true },
      );
    }

    api.logger.info?.(
      `[openclaw-dida365-mcp] registered ${selection.tools.length} official tool(s) from ${path.basename(
        config.manifestPath,
      )}`,
    );
  },
};

export default plugin;

function buildToolDescription(tool: {
  name: string;
  description?: string;
  annotations?: Record<string, unknown>;
}): string {
  const base = tool.description ?? `Official Dida365 MCP tool: ${tool.name}`;
  const hints: string[] = [];

  if (tool.annotations?.readOnlyHint === true) {
    hints.push("read-only");
  }
  if (tool.annotations?.destructiveHint === true) {
    hints.push("destructive");
  }
  if (tool.annotations?.idempotentHint === true) {
    hints.push("idempotent");
  }

  return hints.length > 0 ? `${base} [${hints.join(", ")}]` : base;
}
