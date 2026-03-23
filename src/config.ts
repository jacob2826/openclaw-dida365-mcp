import path from "node:path";

export interface Dida365PluginConfig {
  serverUrl?: string;
  command?: string;
  args?: string[];
  host?: string;
  authTimeoutSeconds?: number;
  requestTimeoutSeconds?: number;
  toolAllowlist?: string[];
  toolDenylist?: string[];
  idleTimeoutSeconds?: number;
  refreshManifestOnStartup?: boolean;
  manifestPath?: string;
}

export interface ResolvedPluginConfig {
  serverUrl: string;
  command: string;
  args: string[];
  host: string;
  authTimeoutSeconds: number;
  requestTimeoutSeconds: number;
  toolAllowlist: string[];
  toolDenylist: string[];
  idleTimeoutSeconds: number;
  refreshManifestOnStartup: boolean;
  manifestPath: string;
}

export function resolvePluginConfig(
  pluginConfig: Dida365PluginConfig | null | undefined,
  pluginRoot: string,
): ResolvedPluginConfig {
  const cfg = pluginConfig ?? {};
  return {
    serverUrl: cfg.serverUrl ?? "https://mcp.dida365.com",
    command: cfg.command ?? "npx",
    args: cfg.args ?? ["-y", "mcp-remote@latest"],
    host: cfg.host ?? "127.0.0.1",
    authTimeoutSeconds: cfg.authTimeoutSeconds ?? 300,
    requestTimeoutSeconds: cfg.requestTimeoutSeconds ?? 300,
    toolAllowlist: normalizeToolList(cfg.toolAllowlist),
    toolDenylist: normalizeToolList(cfg.toolDenylist),
    idleTimeoutSeconds: cfg.idleTimeoutSeconds ?? 600,
    refreshManifestOnStartup: cfg.refreshManifestOnStartup ?? false,
    manifestPath: cfg.manifestPath
      ? path.resolve(cfg.manifestPath)
      : path.join(pluginRoot, "data", "mcp-tools.json"),
  };
}

export function assertSafePluginConfig(config: ResolvedPluginConfig): void {
  if (!config.command.trim()) {
    throw new Error("Plugin command cannot be empty.");
  }

  if (config.args.some((arg) => !arg.trim())) {
    throw new Error("Plugin command args cannot contain empty strings.");
  }

  let url: URL;
  try {
    url = new URL(config.serverUrl);
  } catch (error) {
    throw new Error(`Invalid serverUrl: ${String(error)}`);
  }

  const hostname = url.hostname.toLowerCase();
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const isSecureRemote = url.protocol === "https:";
  const isLoopbackHttp = isLoopback && url.protocol === "http:";

  if (!isSecureRemote && !isLoopbackHttp) {
    throw new Error(
      `Refusing unsafe serverUrl ${config.serverUrl}. Use https:// for remote MCP servers or http:// only for loopback development.`,
    );
  }
}

function normalizeToolList(list: string[] | undefined): string[] {
  return [...new Set((list ?? []).map((item) => item.trim()).filter(Boolean))];
}
