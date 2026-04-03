import os from "node:os";
import path from "node:path";
import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const authTimeoutSeconds = Number(process.env.DIDA365_MCP_AUTH_TIMEOUT_SECONDS ?? "300");
const requestTimeoutSeconds = Number(process.env.DIDA365_MCP_REQUEST_TIMEOUT_SECONDS ?? "300");
const opts = {
  timeout: requestTimeoutSeconds * 1000,
  resetTimeoutOnProgress: true,
  maxTotalTimeout: requestTimeoutSeconds * 1000,
};

const transport = new StdioClientTransport({
  command: "npx",
  args: [
    "-y",
    "mcp-remote@latest",
    "https://mcp.dida365.com",
    "--host",
    "127.0.0.1",
    "--auth-timeout",
    String(authTimeoutSeconds),
  ],
  env: buildRuntimeEnv(process.env),
  stderr: "pipe",
});

transport.stderr?.on("data", (chunk) => {
  process.stderr.write(redactSensitiveText(String(chunk)));
});

const client = new Client(
  { name: "openclaw-dida365-mcp-verify-basic", version: "0.2.3" },
  { capabilities: {} },
);

try {
  await client.connect(transport, opts);

  const projects = await client.callTool(
    { name: "list_projects", arguments: {} },
    undefined,
    opts,
  );
  const projectList = asArray(projects?.structuredContent?.result);
  const inbox = projectList.find((project) => project?.name === "Inbox") ?? projectList[0];
  if (!inbox?.id) {
    throw new Error("Unable to resolve a writable project for verification.");
  }

  const today = await client.callTool(
    {
      name: "list_undone_tasks_by_time_query",
      arguments: { query_command: "today" },
    },
    undefined,
    opts,
  );
  const todayTasks = asArray(today?.structuredContent?.result);

  const title = `[openclaw-dida365-mcp verify] ${new Date().toISOString()}`;
  const created = await client.callTool(
    {
      name: "create_task",
      arguments: {
        task: {
          projectId: inbox.id,
          title,
        },
      },
    },
    undefined,
    opts,
  );

  const createdTask = created?.structuredContent;
  if (!createdTask?.id || !createdTask?.projectId) {
    throw new Error("create_task did not return task id/projectId.");
  }

  const completed = await client.callTool(
    {
      name: "complete_task",
      arguments: {
        project_id: createdTask.projectId,
        task_id: createdTask.id,
      },
    },
    undefined,
    opts,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectCount: projectList.length,
        inboxProjectId: inbox.id,
        todayTaskCount: todayTasks.length,
        createdTaskId: createdTask.id,
        createdTaskProjectId: createdTask.projectId,
        completedStatus: completed?.structuredContent?.result?.status ?? null,
        completedTime: completed?.structuredContent?.result?.completedTime ?? null,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
  await transport.close().catch(() => {});
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function redactSensitiveText(text) {
  return text
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"REDACTED"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/gi, '"refresh_token":"REDACTED"')
    .replace(/"id_token"\s*:\s*"[^"]+"/gi, '"id_token":"REDACTED"')
    .replace(/([?&](?:access_token|refresh_token|id_token|code)=)[^&#\s"]+/gi, "$1REDACTED")
    .replace(/\b((?:access_token|refresh_token|id_token|code)=)[^&\s"]+/gi, "$1REDACTED");
}

function buildRuntimeEnv(env) {
  const merged = Object.fromEntries(
    Object.entries(env).filter((entry) => typeof entry[1] === "string"),
  );
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
