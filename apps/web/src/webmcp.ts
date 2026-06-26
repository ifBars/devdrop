type WebMcpInput = Record<string, unknown>;

type WebMcpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: WebMcpInput): Promise<string> | string;
};

type WebMcpContext = {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): void | Promise<void>;
};

type WebMcpHost = {
  modelContext?: WebMcpContext;
};

export function registerPathstashWebMcpTools(): AbortController | null {
  const modelContext = (document as Document & WebMcpHost).modelContext ?? (navigator as Navigator & WebMcpHost).modelContext;
  if (!modelContext) {
    return null;
  }

  const controller = new AbortController();
  for (const tool of webMcpTools()) {
    void modelContext.registerTool(tool, { signal: controller.signal });
  }
  return controller;
}

function webMcpTools(): WebMcpTool[] {
  return [
    {
      name: "pathstash_get_public_context",
      title: "Get PathStash public context",
      description: "Fetch PathStash llms.txt public product, dashboard, API, and agent guidance.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: () => fetchText("/llms.txt"),
    },
    {
      name: "pathstash_get_auth_guidance",
      title: "Get PathStash Auth.md",
      description: "Fetch PathStash authentication and agent registration guidance.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: () => fetchText("/auth.md"),
    },
    {
      name: "pathstash_get_protected_resource_metadata",
      title: "Get PathStash protected resource metadata",
      description: "Fetch PathStash bearer-token protected-resource metadata for agent clients.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: () => fetchText("/.well-known/oauth-protected-resource"),
    },
    {
      name: "pathstash_get_mcp_server_card",
      title: "Get PathStash MCP server card",
      description: "Fetch the remote MCP server card for PathStash's Streamable HTTP endpoint.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: () => fetchText("/.well-known/mcp/server-card.json"),
    },
    {
      name: "pathstash_check_relay_health",
      title: "Check PathStash relay health",
      description: "Fetch the hosted relay health response and database status.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: () => fetchText("https://pathstash-relay.ifbars.workers.dev/health"),
    },
    {
      name: "pathstash_open_dashboard",
      title: "Open PathStash dashboard",
      description: "Navigate this tab to a PathStash dashboard section.",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: ["overview", "workspaces", "teams", "devices", "secrets", "files", "tokens", "security", "audit", "billing", "agents"],
            description: "Dashboard section to open. Defaults to overview.",
          },
        },
        additionalProperties: false,
      },
      execute: ({ section }) => {
        const path = dashboardPath(typeof section === "string" ? section : undefined);
        window.location.assign(path);
        return `Opened ${path}`;
      },
    },
  ];
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: "text/markdown, application/json, text/plain, */*",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PathStash request failed: ${response.status} ${text}`);
  }
  return text;
}

function dashboardPath(section?: string): string {
  switch (section) {
    case "workspaces":
    case "teams":
    case "devices":
    case "secrets":
    case "files":
    case "tokens":
    case "security":
    case "audit":
    case "billing":
    case "agents":
      return `/dashboard/${section}`;
    default:
      return "/dashboard";
  }
}
