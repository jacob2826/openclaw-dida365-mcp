import os from "node:os";
import path from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { RemoteToolDefinition } from "./types.js";

const PACKAGE_VERSION = "0.2.3";
const RECENT_STDERR_LIMIT = 20;
const STDERR_SUMMARY_LIMIT = 6;

export interface BridgeLogger {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  debug?: (message: string) => void;
}

export interface BridgeTransportLike {
  stderr?: unknown;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  close(): Promise<void>;
}

export interface BridgeClientLike {
  listTools(
    params?: unknown,
    options?: {
      timeout?: number;
      resetTimeoutOnProgress?: boolean;
      maxTotalTimeout?: number;
    },
  ): Promise<{
    tools?: Array<{
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
      outputSchema?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
      execution?: Record<string, unknown>;
      title?: string;
    }>;
  }>;
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    resultSchema?: unknown,
    options?: {
      timeout?: number;
      resetTimeoutOnProgress?: boolean;
      maxTotalTimeout?: number;
    },
  ): Promise<unknown>;
  close(): Promise<void>;
}

export interface BridgeConnection {
  client: BridgeClientLike;
  transport: BridgeTransportLike;
}

export interface BridgeOptions {
  serverUrl: string;
  command: string;
  args: string[];
  host: string;
  authTimeoutSeconds: number;
  requestTimeoutSeconds: number;
  toolAllowlist?: string[];
  toolDenylist?: string[];
  idleTimeoutSeconds: number;
  env?: NodeJS.ProcessEnv;
  logger?: BridgeLogger;
  connectRuntime?: (options: BridgeOptions, logger?: BridgeLogger) => Promise<BridgeConnection>;
}

export class Dida365Bridge {
  private readonly options: BridgeOptions;
  private logger: BridgeLogger | undefined;

  private client: BridgeClientLike | null = null;
  private transport: BridgeTransportLike | null = null;
  private connectPromise: Promise<BridgeClientLike> | null = null;
  private activeRequests = 0;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(options: BridgeOptions) {
    this.options = options;
    this.logger = options.logger;
  }

  async listTools(): Promise<RemoteToolDefinition[]> {
    return this.withClient(async (client) => {
      const result = await client.listTools(undefined, {
        timeout: this.options.requestTimeoutSeconds * 1000,
        resetTimeoutOnProgress: true,
        maxTotalTimeout: this.options.requestTimeoutSeconds * 1000,
      });
      return (result.tools ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
        outputSchema: tool.outputSchema as Record<string, unknown> | undefined,
        annotations: tool.annotations as Record<string, unknown> | undefined,
        execution: tool.execution as Record<string, unknown> | undefined,
        title: tool.title,
      }));
    });
  }

  async callTool(name: string, args: Record<string, unknown> | undefined) {
    return this.withClient(async (client) => {
      return client.callTool({
        name,
        arguments: args ?? {},
      }, undefined, {
        timeout: this.options.requestTimeoutSeconds * 1000,
        resetTimeoutOnProgress: true,
        maxTotalTimeout: this.options.requestTimeoutSeconds * 1000,
      });
    });
  }

  setLogger(logger: BridgeLogger | undefined): void {
    this.logger = logger;
  }

  async close(): Promise<void> {
    this.clearIdleTimer();
    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;
    this.connectPromise = null;

    try {
      await client?.close();
    } finally {
      await transport?.close();
    }
  }

  private async connect(): Promise<BridgeClientLike> {
    if (this.client) {
      return this.client;
    }
    if (!this.connectPromise) {
      this.connectPromise = this.connectInternal();
    }
    return this.connectPromise;
  }

  private async connectInternal(): Promise<BridgeClientLike> {
    const connection = this.options.connectRuntime
      ? await this.options.connectRuntime(this.options, this.logger)
      : await connectWithSdk(this.options, this.logger);

    const { client, transport } = connection;
    attachTransportHooks(
      transport,
      () => this.logger,
      () => {
        this.clearIdleTimer();
        this.client = null;
        this.transport = null;
        this.connectPromise = null;
      },
    );

    this.transport = transport;
    this.client = client;

    return client;
  }

  private async withClient<T>(fn: (client: BridgeClientLike) => Promise<T>): Promise<T> {
    this.clearIdleTimer();
    this.activeRequests += 1;
    try {
      const client = await this.connect();
      return await fn(client);
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      if (this.activeRequests === 0) {
        this.scheduleIdleClose();
      }
    }
  }

  private scheduleIdleClose(): void {
    this.clearIdleTimer();
    if (this.options.idleTimeoutSeconds <= 0 || !this.client || !this.transport) {
      return;
    }
    const timeoutMs = this.options.idleTimeoutSeconds * 1000;
    this.idleTimer = setTimeout(() => {
      if (this.activeRequests !== 0) {
        return;
      }
      this.logger?.info?.(
        `closing idle mcp-remote transport after ${this.options.idleTimeoutSeconds}s`,
      );
      void this.close();
    }, timeoutMs);
    this.idleTimer.unref?.();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}

async function connectWithSdk(
  options: BridgeOptions,
  logger?: BridgeLogger,
): Promise<BridgeConnection> {
  const recentStderr: string[] = [];
  const transport = new StdioClientTransport({
    command: options.command,
    args: [
      ...options.args,
      options.serverUrl,
      "--host",
      options.host,
      "--auth-timeout",
      String(options.authTimeoutSeconds),
    ],
    env: buildRuntimeEnv(options.env),
    stderr: "pipe",
  });

  pipeStderr(transport.stderr, logger, recentStderr);

  const client = new Client(
    {
      name: "openclaw-dida365-mcp",
      version: PACKAGE_VERSION,
    },
    {
      capabilities: {},
    },
  );

  try {
    await client.connect(transport, {
      timeout: options.requestTimeoutSeconds * 1000,
      resetTimeoutOnProgress: true,
      maxTotalTimeout: options.requestTimeoutSeconds * 1000,
    });
  } catch (error) {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
    throw new Error(
      formatConnectFailureMessage(error, recentStderr, options.serverUrl),
      { cause: error instanceof Error ? error : undefined },
    );
  }

  return {
    client,
    transport,
  };
}

function attachTransportHooks(
  transport: BridgeTransportLike,
  getLogger: () => BridgeLogger | undefined,
  onClose: () => void,
): void {
  const previousOnClose = transport.onclose;
  const previousOnError = transport.onerror;

  transport.onerror = (error) => {
    previousOnError?.(error);
    getLogger()?.error?.(`mcp-remote transport error: ${String(error)}`);
  };

  transport.onclose = () => {
    previousOnClose?.();
    getLogger()?.warn?.("mcp-remote transport closed");
    onClose();
  };
}

function pipeStderr(
  stream: unknown,
  logger: BridgeLogger | undefined,
  recentStderr: string[] = [],
): void {
  if (!stream || typeof stream !== "object" || !("on" in stream) || typeof stream.on !== "function") {
    return;
  }
  stream.on("data", (chunk: Buffer | string) => {
    const redacted = redactSensitiveText(String(chunk));
    pushRecentStderr(recentStderr, redacted);
    const text = redacted.trim();
    if (!text) {
      return;
    }
    logger?.info?.(text);
  });
}

export function buildRuntimeEnv(
  env: NodeJS.ProcessEnv | undefined,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const merged = stringifyEnv({
    ...baseEnv,
    ...env,
  });
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

export function redactSensitiveText(text: string): string {
  return text
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"REDACTED"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/gi, '"refresh_token":"REDACTED"')
    .replace(/"id_token"\s*:\s*"[^"]+"/gi, '"id_token":"REDACTED"')
    .replace(/([?&](?:access_token|refresh_token|id_token|code)=)[^&#\s"]+/gi, "$1REDACTED")
    .replace(/\b((?:access_token|refresh_token|id_token|code)=)[^&\s"]+/gi, "$1REDACTED");
}

export function formatConnectFailureMessage(
  error: unknown,
  recentStderr: string[],
  serverUrl?: string,
): string {
  const detail = error instanceof Error ? error.message : String(error);
  const prefix = serverUrl
    ? `Failed to connect mcp-remote to ${serverUrl}`
    : "Failed to connect mcp-remote";
  const stderrSummary = recentStderr.slice(-STDERR_SUMMARY_LIMIT).join(" | ");

  return stderrSummary
    ? `${prefix}: ${detail}. Recent stderr: ${stderrSummary}`
    : `${prefix}: ${detail}`;
}

function pushRecentStderr(
  recentStderr: string[],
  text: string,
): void {
  for (const line of text.split(/\r?\n/)) {
    const normalized = line.trim();
    if (!normalized) {
      continue;
    }
    recentStderr.push(normalized);
    if (recentStderr.length > RECENT_STDERR_LIMIT) {
      recentStderr.splice(0, recentStderr.length - RECENT_STDERR_LIMIT);
    }
  }
}

function stringifyEnv(
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}
