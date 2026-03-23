import fs from "node:fs";
import path from "node:path";

import type { RemoteToolDefinition, RemoteToolsManifest } from "./types.js";

export function loadToolsManifest(manifestPath: string): RemoteToolsManifest {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const data = JSON.parse(raw) as Partial<RemoteToolsManifest>;

  if (!data || !Array.isArray(data.tools)) {
    throw new Error(`Invalid tools manifest: ${manifestPath}`);
  }

  return {
    generatedAt: typeof data.generatedAt === "string" ? data.generatedAt : new Date(0).toISOString(),
    serverUrl: typeof data.serverUrl === "string" ? data.serverUrl : "",
    tools: data.tools
      .filter((tool): tool is RemoteToolDefinition => !!tool && typeof tool.name === "string")
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: normalizeSchema(tool.inputSchema),
        outputSchema: normalizeSchema(tool.outputSchema),
        annotations: tool.annotations,
        execution: tool.execution,
        title: tool.title,
      })),
  };
}

export function writeToolsManifest(
  manifestPath: string,
  manifest: RemoteToolsManifest,
): void {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function normalizeSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return {
      type: "object",
      additionalProperties: true,
    };
  }
  return schema;
}

export interface ToolSelectionOptions {
  allowlist?: string[];
  denylist?: string[];
}

export interface ToolSelectionResult {
  tools: RemoteToolDefinition[];
  warnings: string[];
}

export function selectToolsFromManifest(
  manifest: RemoteToolsManifest,
  options: ToolSelectionOptions = {},
): ToolSelectionResult {
  const allow = new Set(options.allowlist ?? []);
  const deny = new Set(options.denylist ?? []);
  const seen = new Set<string>();
  const warnings: string[] = [];
  const tools: RemoteToolDefinition[] = [];

  for (const tool of manifest.tools) {
    if (!isSafeToolName(tool.name)) {
      warnings.push(`Skipped unsafe tool name: ${tool.name}`);
      continue;
    }
    if (seen.has(tool.name)) {
      warnings.push(`Skipped duplicate tool name: ${tool.name}`);
      continue;
    }
    seen.add(tool.name);

    if (allow.size > 0 && !allow.has(tool.name)) {
      continue;
    }
    if (deny.has(tool.name)) {
      continue;
    }
    tools.push(tool);
  }

  return { tools, warnings };
}

function isSafeToolName(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name);
}
