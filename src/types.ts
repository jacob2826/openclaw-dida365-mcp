export interface RemoteToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execution?: Record<string, unknown>;
  title?: string;
}

export interface RemoteToolsManifest {
  generatedAt: string;
  serverUrl: string;
  tools: RemoteToolDefinition[];
}
