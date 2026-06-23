#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_RELAY = "https://pathstash-relay.ifbars.workers.dev";

const server = new McpServer({
  name: "pathstash",
  version: "0.1.0",
});

server.registerTool(
  "pathstash_llms",
  {
    title: "Fetch PathStash llms.txt",
    description: "Fetch the public PathStash agent guidance document.",
    inputSchema: z.object({
      relay: z.string().url().optional(),
    }),
  },
  async ({ relay }) => textResult(await relayText(relay ?? defaultRelay(), "/llms.txt")),
);

server.registerTool(
  "pathstash_account_markdown",
  {
    title: "Fetch PathStash account markdown",
    description: "Fetch authenticated account, workspace, and device context in markdown.",
    inputSchema: z.object({
      relay: z.string().url().optional(),
      token: z.string().optional(),
    }),
  },
  async ({ relay, token }) => textResult(await relayText(relay ?? defaultRelay(), "/v1/me.md", token)),
);

server.registerTool(
  "pathstash_devices",
  {
    title: "List PathStash devices",
    description: "List devices visible to the authenticated PathStash account.",
    inputSchema: z.object({
      relay: z.string().url().optional(),
      token: z.string().optional(),
    }),
  },
  async ({ relay, token }) => textResult(await relayJson(relay ?? defaultRelay(), "/v1/devices", token)),
);

server.registerTool(
  "pathstash_manifest_markdown",
  {
    title: "Fetch workspace manifest markdown",
    description: "Fetch an authenticated workspace manifest summary in markdown.",
    inputSchema: z.object({
      workspaceId: z.string().min(1),
      relay: z.string().url().optional(),
      token: z.string().optional(),
    }),
  },
  async ({ workspaceId, relay, token }) =>
    textResult(await relayText(relay ?? defaultRelay(), `/v1/workspaces/${encodeURIComponent(workspaceId)}/manifest.md`, token)),
);

server.registerTool(
  "pathstash_manifest_json",
  {
    title: "Fetch workspace manifest JSON",
    description: "Fetch an authenticated workspace manifest as JSON.",
    inputSchema: z.object({
      workspaceId: z.string().min(1),
      relay: z.string().url().optional(),
      token: z.string().optional(),
    }),
  },
  async ({ workspaceId, relay, token }) =>
    textResult(await relayJson(relay ?? defaultRelay(), `/v1/workspaces/${encodeURIComponent(workspaceId)}/manifest`, token)),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PathStash MCP server running on stdio");
}

async function relayText(relay: string, path: string, token?: string) {
  const response = await fetch(`${normalizeRelay(relay)}${path}`, {
    headers: authHeaders(token),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PathStash request failed: ${response.status} ${text}`);
  }
  return text;
}

async function relayJson(relay: string, path: string, token?: string) {
  const response = await fetch(`${normalizeRelay(relay)}${path}`, {
    headers: authHeaders(token),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PathStash request failed: ${response.status} ${text}`);
  }
  return JSON.stringify(JSON.parse(text), null, 2);
}

function authHeaders(token?: string) {
  const resolved = token ?? process.env.PATHSTASH_TOKEN;
  return resolved ? { authorization: `Bearer ${resolved}` } : undefined;
}

function textResult(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

function defaultRelay() {
  return process.env.PATHSTASH_RELAY ?? DEFAULT_RELAY;
}

function normalizeRelay(relay: string) {
  return relay.trim().replace(/\/+$/, "");
}

main().catch((error) => {
  console.error("Fatal error in PathStash MCP server:", error);
  process.exit(1);
});
