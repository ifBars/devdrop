type Env = {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  RELAY?: {
    fetch(request: Request): Promise<Response>;
  };
};

const DEFAULT_RELAY = "https://pathstash-relay.ifbars.workers.dev";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const MCP_SERVER_INFO = {
  name: "pathstash-web",
  title: "PathStash Web MCP",
  version: "0.1.0",
};

type JsonObject = Record<string, unknown>;
type JsonRpcId = string | number | null;
type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: JsonObject;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonObject;
};

function pageMarkdown(origin: string): string {
  return `# PathStash

PathStash is the developer workspace layer around Git. It is Dropbox-like consistency for developer workspaces, but with repo-aware rules: workspace roots, selected files, generated-folder ignores, devices, encrypted secret records, manifests, internal docs, concept assets, and large file pointers stay available across machines and agents.

## Product

PathStash keeps your development workspace recognizable everywhere. Git remains the source of code history. PathStash stores the workspace map and sidecar context around it: where roots live, which devices are connected, which generated folders should stay local, which internal docs and artifacts matter, and which encrypted environment-secret records belong to a workspace.

## Web app

- Marketing site: ${origin}/
- Dashboard: ${origin}/dashboard
- Billing: ${origin}/dashboard/billing
- Security: ${origin}/dashboard/security
- Agent context: ${origin}/dashboard/agents

## Run with no native install

\`\`\`sh
npx pathstash help
bunx pathstash help
\`\`\`

## First run

\`\`\`sh
npx pathstash login --token <dashboard-api-token>
npx pathstash sidecar init --root . --name "Project Context"
npx pathstash push --root .pathstash-context
npx pathstash hydrate --root ./restored --workspace-id <workspace-id>
\`\`\`

Create and verify the account in the dashboard first. Browser login uses a password and email verification; CLI, CI, and agent surfaces use explicit scoped API tokens.

## Plans

- Free: solo workspace sync for a few devices.
- Pro: more devices, storage, large files, and encrypted secrets.
- Team: shared workspaces, policy, audit logs, and team-scale storage.

## Positioning

PathStash is not a general shared drive or enterprise content-management suite. Box, Dropbox, Google Drive, and OneDrive are better fits for broad company file sharing. Use PathStash when the important problem is restoring developer project context across machines, teams, CI, and agents: fresh repo awareness, known local project roots, encrypted environment-secret records, sidecar files, and private context without putting that state into Git.

## Agent support

- \`/llms.txt\`: stable agent-facing project summary.
- \`/robots.txt\`: crawler and sitemap discovery.
- \`/sitemap.xml\`: public URL inventory.
- \`/auth.md\`: API authentication guidance.
- \`/.well-known/oauth-protected-resource\`: bearer-token protected-resource metadata.
- \`/openapi.json\`: relay API catalog.
- \`/.well-known/mcp/server-card.json\`: remote MCP server card.
- \`/.well-known/mcp-server\`: compatibility alias for MCP server discovery.
- \`/.well-known/webmcp\`: browser WebMCP discovery manifest.
- \`/.well-known/webmcp.json\`: JSON alias for browser WebMCP discovery.
- \`/.well-known/agent-card.json\`: A2A discovery card for PathStash agent interfaces.
- \`/.well-known/ai-plugin.json\`: historical plugin-style OpenAPI discovery manifest.
- \`/mcp\`: Streamable HTTP MCP endpoint for public context and authenticated relay tools.
- Relay \`/v1/me.md\`: authenticated account and workspace markdown.
- Relay \`/v1/me/export.json\`: authenticated account portability export with metadata only; no plaintext secrets or token values.
- Relay \`/v1/workspaces\`: authenticated workspace list, including shared team workspaces. Use \`?status=archived\` or \`?status=all\` for archived metadata.
- Relay \`/v1/workspaces/{workspaceId}/manifest.md\`: authenticated manifest markdown.
- Relay \`/v1/workspaces/{workspaceId}/files\`: authenticated manifest-derived file inventory.
- Relay \`/v1/teams\`: authenticated team membership, invite, and shared workspace state.
- Relay \`/v1/audit/events\`: authenticated account activity history.
- Local MCP server: \`@pathstash/mcp\`.

## Relay

Default relay: https://pathstash-relay.ifbars.workers.dev

## Repository

https://github.com/ifBars/pathstash
`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      return handleMcp(request, url.origin, env);
    }

    if (
      url.pathname === "/.well-known/mcp/server-card.json" ||
      url.pathname === "/.well-known/mcp.json" ||
      url.pathname === "/.well-known/mcp-server" ||
      url.pathname === "/.well-known/mcp-server.json"
    ) {
      return jsonResponse(mcpServerCard(url.origin), {
        "content-type": "application/json; charset=utf-8",
        link: discoveryLinkHeader(),
      });
    }

    if (url.pathname === "/.well-known/mcp/servers.json") {
      return jsonResponse(mcpServersIndex(url.origin), {
        "content-type": "application/json; charset=utf-8",
        link: discoveryLinkHeader(),
      });
    }

    if (url.pathname === "/.well-known/agent-card.json") {
      return jsonResponse(a2aAgentCard(url.origin), {
        "content-type": "application/json; charset=utf-8",
        link: discoveryLinkHeader(),
      });
    }

    if (url.pathname === "/.well-known/ai-plugin.json") {
      return jsonResponse(aiPluginManifest(url.origin), {
        "content-type": "application/json; charset=utf-8",
        link: discoveryLinkHeader(),
      });
    }

    if (url.pathname === "/.well-known/webmcp" || url.pathname === "/.well-known/webmcp.json") {
      return jsonResponse(webMcpManifest(url.origin), {
        "content-type": "application/json; charset=utf-8",
        link: discoveryLinkHeader(),
      });
    }

    if (url.pathname === "/.well-known/api-catalog") {
      return new Response(JSON.stringify(apiCatalog(url.origin), null, 2), {
        headers: {
          "content-type": `application/linkset+json; profile="https://www.rfc-editor.org/rfc/rfc9727"`,
          link: discoveryLinkHeader(),
        },
      });
    }

    if (url.pathname === "/.well-known/oauth-protected-resource") {
      return jsonResponse(oauthProtectedResource(url.origin), {
        "content-type": "application/json; charset=utf-8",
        link: discoveryLinkHeader(),
      });
    }

    if (url.pathname.startsWith("/.well-known/")) {
      const response = await env.ASSETS.fetch(request);
      if (!response.headers.get("content-type")?.includes("text/html")) {
        return response;
      }
      return jsonResponse(
        { error: "not_found" },
        {
          "content-type": "application/json; charset=utf-8",
          link: discoveryLinkHeader(),
        },
        404,
      );
    }

    if (url.pathname === "/api/relay" || url.pathname.startsWith("/api/relay/")) {
      return proxyRelayRequest(request, url, env);
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return jsonResponse(
        { error: "not_found", relay: DEFAULT_RELAY },
        {
          "content-type": "application/json; charset=utf-8",
          link: discoveryLinkHeader(),
        },
        404,
      );
    }

    if (shouldGateDashboardPage(request, url)) {
      const authenticated = await isDashboardSessionAuthenticated(request, env);
      if (!authenticated) {
        return redirectToLogin(url);
      }
    }

    if (wantsMarkdown(request) && isPageRequest(url.pathname)) {
      return new Response(pageMarkdown(url.origin), {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          link: discoveryLinkHeader(),
          vary: "accept",
        },
      });
    }

    const response = await env.ASSETS.fetch(request);
    if (response.headers.get("content-type")?.includes("text/html")) {
      const headers = new Headers(response.headers);
      headers.set("vary", appendVary(headers.get("vary"), "accept"));
      let linkHeader: string | null = headers.get("link");
      for (const value of discoveryLinks()) {
        linkHeader = appendLink(linkHeader, value);
      }
      if (linkHeader) {
        headers.set("link", linkHeader);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  },
};

async function proxyRelayRequest(request: Request, url: URL, env: Env): Promise<Response> {
  if (!env.RELAY) {
    return jsonResponse(
      { error: "relay_binding_unavailable", relay: DEFAULT_RELAY },
      { "content-type": "application/json; charset=utf-8" },
      503,
    );
  }

  const target = new URL(DEFAULT_RELAY);
  target.pathname = url.pathname.replace(/^\/api\/relay/, "") || "/";
  target.search = url.search;

  const headers = new Headers(request.headers);
  headers.delete("host");

  return env.RELAY.fetch(
    new Request(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? null : request.body,
      redirect: "manual",
    }),
  );
}

function shouldGateDashboardPage(request: Request, url: URL): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }
  if (!isDashboardPath(url.pathname) || !isPageRequest(url.pathname)) {
    return false;
  }
  return !wantsMarkdown(request);
}

function isDashboardPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

async function isDashboardSessionAuthenticated(request: Request, env: Env): Promise<boolean> {
  if (!env.RELAY) {
    return false;
  }

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  if (cookie) {
    headers.set("cookie", cookie);
  }
  if (authorization) {
    headers.set("authorization", authorization);
  }
  headers.set("accept", "application/json");

  const target = new URL(DEFAULT_RELAY);
  target.pathname = "/v1/me";
  target.search = "";
  try {
    const response = await env.RELAY.fetch(new Request(target, { method: "GET", headers, redirect: "manual" }));
    return response.ok;
  } catch {
    return false;
  }
}

function redirectToLogin(url: URL): Response {
  const target = new URL("/login", url.origin);
  target.searchParams.set("next", `${url.pathname}${url.search}`);
  return new Response(null, {
    status: 302,
    headers: {
      location: `${target.pathname}${target.search}`,
      "cache-control": "private, no-store",
      link: discoveryLinkHeader(),
    },
  });
}

function wantsMarkdown(request: Request): boolean {
  const accept = request.headers.get("accept")?.toLowerCase() ?? "";
  return accept.includes("text/markdown");
}

function isPageRequest(pathname: string): boolean {
  if (pathname === "/" || pathname === "") {
    return true;
  }
  const last = pathname.split("/").pop() ?? "";
  return !last.includes(".");
}

function appendVary(current: string | null, value: string): string {
  if (!current) {
    return value;
  }
  return current.toLowerCase().split(",").map((item) => item.trim()).includes(value)
    ? current
    : `${current}, ${value}`;
}

function appendLink(current: string | null, value: string): string {
  return current ? `${current}, ${value}` : value;
}

function discoveryLinks(): string[] {
  return [
    `</llms.txt>; rel="alternate"; type="text/plain"`,
    `</sitemap.xml>; rel="sitemap"; type="application/xml"`,
    `</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
    `</.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"`,
    `</.well-known/mcp-server>; rel="service-desc"; type="application/json"`,
    `</.well-known/webmcp>; rel="webmcp"; type="application/json"`,
    `</.well-known/webmcp.json>; rel="service-desc"; type="application/json"`,
    `</auth.md>; rel="alternate"; type="text/markdown"`,
    `</.well-known/oauth-protected-resource>; rel="service-desc"; type="application/json"`,
    `</openapi.json>; rel="service-desc"; type="application/openapi+json"`,
    `</.well-known/agent-skills/index.json>; rel="service-desc"; type="application/json"`,
    `</.well-known/skills/index.json>; rel="service-desc"; type="application/json"`,
    `</.well-known/agent-card.json>; rel="service-desc"; type="application/json"`,
  ];
}

function discoveryLinkHeader(): string {
  return discoveryLinks().join(", ");
}

function apiCatalog(origin: string): Record<string, unknown> {
  return {
    linkset: [
      {
        anchor: "https://pathstash-relay.ifbars.workers.dev",
        "service-desc": [
          {
            href: `${origin}/openapi.json`,
            type: "application/openapi+json",
          },
        ],
        "service-doc": [
          {
            href: "https://github.com/ifBars/pathstash/blob/main/docs/api.md",
            type: "text/markdown",
          },
        ],
        status: [
          {
            href: "https://pathstash-relay.ifbars.workers.dev/health",
            type: "application/json",
          },
        ],
        "service-meta": [
          {
            href: `${origin}/.well-known/mcp/server-card.json`,
            type: "application/json",
          },
          {
            href: `${origin}/.well-known/mcp-server`,
            type: "application/json",
          },
          {
            href: `${origin}/.well-known/webmcp`,
            type: "application/json",
          },
          {
            href: `${origin}/.well-known/ai-plugin.json`,
            type: "application/json",
          },
        ],
      },
    ],
  };
}

function oauthProtectedResource(origin: string): JsonObject {
  return {
    resource: origin,
    resource_name: "PathStash Web",
    resource_documentation: `${origin}/auth.md`,
    authorization_servers: [],
    bearer_methods_supported: ["header"],
    scopes_supported: [
      "full_access",
      "account:read",
      "account:write",
      "workspace:read",
      "workspace:write",
      "secret:read",
      "secret:write",
      "device:read",
      "device:write",
      "token:manage",
      "team:read",
      "team:write",
      "audit:read",
      "billing:write",
    ],
    pathstash_auth_model: "first-party bearer tokens; OAuth dynamic client registration is not currently supported",
    pathstash_relay_resource: DEFAULT_RELAY,
  };
}

function mcpServerCard(origin: string): JsonObject {
  const endpoint = `${origin}/mcp`;
  return {
    serverInfo: MCP_SERVER_INFO,
    protocolVersion: MCP_PROTOCOL_VERSION,
    transport: {
      type: "streamable-http",
      endpoint,
    },
    transports: [
      {
        type: "streamable-http",
        endpoint,
      },
    ],
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
    tools: mcpTools().map(({ name, title, description, inputSchema }) => ({
      name,
      title,
      description,
      inputSchema,
    })),
  };
}

function mcpServersIndex(origin: string): JsonObject {
  return {
    version: "1.0",
    servers: [
      {
        name: MCP_SERVER_INFO.name,
        title: MCP_SERVER_INFO.title,
        description:
          "PathStash Streamable HTTP MCP endpoint for public product context and authenticated developer workspace context.",
        endpoint: `${origin}/mcp`,
        serverCard: `${origin}/.well-known/mcp/server-card.json`,
        capabilities: ["tools"],
      },
    ],
  };
}

function a2aAgentCard(origin: string): JsonObject {
  return {
    name: "PathStash",
    version: "0.1.0",
    description:
      "Developer workspace context and sync service for agents, including public product context, relay health, authenticated account summaries, device inventory, and workspace manifests.",
    url: `${origin}/mcp`,
    supportedInterfaces: [
      {
        name: "PathStash MCP",
        protocol: "mcp",
        transport: "streamable-http",
        url: `${origin}/mcp`,
        serviceUrl: `${origin}/mcp`,
        contentTypes: ["application/json", "text/event-stream"],
      },
      {
        name: "Markdown for agents",
        protocol: "https",
        transport: "http",
        url: `${origin}/llms.txt`,
        serviceUrl: `${origin}/llms.txt`,
        contentTypes: ["text/plain", "text/markdown"],
      },
    ],
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: false,
      extensions: ["mcp", "markdown-for-agents", "agent-skills"],
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json", "text/markdown"],
    skills: [
      {
        id: "pathstash-public-context",
        name: "Public PathStash Context",
        description: "Return public PathStash product, dashboard, install, and agent endpoint context.",
      },
      {
        id: "pathstash-relay-health",
        name: "Relay Health",
        description: "Check hosted or custom PathStash relay health.",
      },
      {
        id: "pathstash-auth-discovery",
        name: "Bearer Auth Discovery",
        description: "Fetch protected-resource metadata that describes PathStash bearer-token scopes and header usage.",
      },
      {
        id: "pathstash-account-context",
        name: "Authenticated Account Context",
        description: "Fetch account, subscription, device, workspace, usage, and entitlement context with a bearer token.",
      },
      {
        id: "pathstash-account-export",
        name: "Account Portability Export",
        description: "Fetch a metadata-only account export with profile, plan, usage, workspace, team, token, secret inventory, and audit context.",
      },
      {
        id: "pathstash-workspace-list",
        name: "Authenticated Workspace List",
        description: "List solo and shared workspaces visible to a bearer token before fetching manifests or files.",
      },
      {
        id: "pathstash-team-context",
        name: "Authenticated Team Context",
        description: "Fetch team membership, pending invite, team detail, and shared workspace context with a bearer token.",
      },
      {
        id: "pathstash-workspace-manifest",
        name: "Workspace Manifest Context",
        description: "Fetch authenticated workspace manifests as Markdown or JSON for agent handoff.",
      },
    ],
  };
}

function aiPluginManifest(origin: string): JsonObject {
  return {
    schema_version: "v1",
    name_for_human: "PathStash",
    name_for_model: "pathstash",
    description_for_human:
      "Developer workspace context around Git: sidecar files, manifests, encrypted secret inventory, devices, teams, and billing state.",
    description_for_model:
      "Use PathStash to inspect developer workspace context, account posture, devices, teams, manifests, file inventories, and secret metadata. Plaintext secret values are never returned.",
    auth: {
      type: "user_http",
      authorization_type: "bearer",
    },
    api: {
      type: "openapi",
      url: `${origin}/openapi.json`,
      is_user_authenticated: true,
    },
    logo_url: `${origin}/favicon.svg`,
    contact_email: "hello@ifbars.dev",
    legal_info_url: "https://github.com/ifBars/pathstash/blob/main/LICENSE-MIT",
  };
}

function webMcpManifest(origin: string): JsonObject {
  return {
    name: "PathStash WebMCP",
    description:
      "Browser-exposed PathStash tools for public context, auth guidance, protected-resource metadata, relay health, MCP discovery, and dashboard navigation.",
    url: origin,
    tools: [
      {
        name: "pathstash_get_public_context",
        description: "Fetch PathStash llms.txt public product, dashboard, API, and agent guidance.",
        href: `${origin}/llms.txt`,
      },
      {
        name: "pathstash_get_auth_guidance",
        description: "Fetch PathStash authentication and agent registration guidance.",
        href: `${origin}/auth.md`,
      },
      {
        name: "pathstash_get_protected_resource_metadata",
        description: "Fetch PathStash bearer-token protected-resource metadata for agent clients.",
        href: `${origin}/.well-known/oauth-protected-resource`,
      },
      {
        name: "pathstash_get_mcp_server_card",
        description: "Fetch the remote MCP server card for PathStash's Streamable HTTP endpoint.",
        href: `${origin}/.well-known/mcp/server-card.json`,
      },
      {
        name: "pathstash_check_relay_health",
        description: "Fetch the hosted relay health response and database status.",
        href: "https://pathstash-relay.ifbars.workers.dev/health",
      },
      {
        name: "pathstash_open_dashboard",
        description: "Navigate this tab to a PathStash dashboard section.",
        href: `${origin}/dashboard`,
      },
    ],
    runtime:
      "Tools are registered at runtime with document.modelContext or navigator.modelContext when the browser exposes WebMCP.",
    source: `${origin}/`,
  };
}

async function handleMcp(request: Request, origin: string, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: mcpHeaders() });
  }

  if (request.method === "GET") {
    return jsonResponse(mcpServerCard(origin), mcpHeaders());
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "MCP endpoint accepts POST requests" } },
      mcpHeaders({ allow: "GET, POST, OPTIONS" }),
      405,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(mcpError(null, -32700, "Parse error"), mcpHeaders(), 400);
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses: JsonRpcResponse[] = [];
  for (const message of messages) {
    const response = await handleMcpMessage(message, request, origin, env);
    if (response) {
      responses.push(response);
    }
  }

  if (responses.length === 0) {
    return new Response(null, { status: 202, headers: mcpHeaders() });
  }

  return jsonResponse(Array.isArray(body) ? responses : responses[0], mcpHeaders());
}

async function handleMcpMessage(
  message: unknown,
  request: Request,
  origin: string,
  env: Env,
): Promise<JsonRpcResponse | null> {
  const body = asObject(message);
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return mcpError(null, -32600, "Invalid Request");
  }

  const id = isJsonRpcId(body.id) ? body.id : null;
  if (!("id" in body)) {
    return null;
  }

  switch (body.method) {
    case "initialize":
      return mcpSuccess(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: MCP_SERVER_INFO,
        instructions:
          "Use PathStash tools to fetch public context, relay health, and authenticated account/workspace context. Protected relay tools require a PathStash bearer token.",
      });
    case "tools/list":
      return mcpSuccess(id, { tools: mcpTools() });
    case "tools/call":
      return mcpSuccess(id, await callMcpTool(asObject(body.params), request, origin, env));
    default:
      return mcpError(id, -32601, `Method not found: ${body.method}`);
  }
}

function mcpTools(): ToolDefinition[] {
  const relayProperty = {
    type: "string",
    format: "uri",
    description: "Optional PathStash relay origin. Defaults to the hosted relay.",
  };
  const tokenProperty = {
    type: "string",
    description: "Optional PathStash bearer token. The Authorization header is also accepted.",
  };
  const workspaceIdProperty = {
    type: "string",
    minLength: 1,
    description: "PathStash workspace id.",
  };
  const teamIdProperty = {
    type: "string",
    minLength: 1,
    description: "PathStash team id.",
  };

  return [
    {
      name: "pathstash_public_context",
      title: "PathStash Public Context",
      description: "Return public PathStash product, dashboard, install, and agent endpoint context.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "pathstash_relay_health",
      title: "PathStash Relay Health",
      description: "Fetch hosted or custom relay health status.",
      inputSchema: {
        type: "object",
        properties: {
          relay: relayProperty,
        },
        additionalProperties: false,
      },
    },
    {
      name: "pathstash_protected_resource_metadata",
      title: "PathStash Protected Resource Metadata",
      description: "Fetch protected-resource metadata for the PathStash web or relay origin.",
      inputSchema: {
        type: "object",
        properties: {
          relay: relayProperty,
          origin: {
            type: "string",
            enum: ["web", "relay"],
            description: "Which PathStash origin to inspect. Defaults to web.",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "pathstash_account_markdown",
      title: "PathStash Account Markdown",
      description: "Fetch authenticated account, subscription, workspace, and device context in markdown.",
      inputSchema: {
        type: "object",
        properties: {
          relay: relayProperty,
          token: tokenProperty,
        },
        additionalProperties: false,
      },
    },
    {
      name: "pathstash_account_export",
      title: "PathStash Account Export",
      description:
        "Fetch authenticated profile, plan, usage, device, session, workspace, team, token metadata, secret inventory metadata, and recent audit context as JSON.",
      inputSchema: {
        type: "object",
        properties: {
          relay: relayProperty,
          token: tokenProperty,
        },
        additionalProperties: false,
      },
    },
    {
      name: "pathstash_devices",
      title: "PathStash Devices",
      description: "List devices visible to the authenticated PathStash account.",
      inputSchema: {
        type: "object",
        properties: {
          relay: relayProperty,
          token: tokenProperty,
        },
        additionalProperties: false,
      },
    },
    {
      name: "pathstash_teams",
      title: "PathStash Teams",
      description: "List teams, pending invites, and shared workspace counts visible to the authenticated PathStash account.",
      inputSchema: {
        type: "object",
        properties: {
          relay: relayProperty,
          token: tokenProperty,
        },
        additionalProperties: false,
      },
    },
    {
      name: "pathstash_team_details",
      title: "PathStash Team Details",
      description: "Fetch team members, manager-visible pending invites, and shared workspaces for one authenticated team.",
      inputSchema: {
        type: "object",
        properties: {
          teamId: teamIdProperty,
          relay: relayProperty,
          token: tokenProperty,
        },
        required: ["teamId"],
        additionalProperties: false,
      },
    },
    {
      name: "pathstash_workspaces",
      title: "PathStash Workspaces",
      description: "List active, archived, or all solo and shared team workspaces visible to the authenticated PathStash account.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["active", "archived", "all"],
            description: "Workspace listing status. Defaults to active.",
          },
          relay: relayProperty,
          token: tokenProperty,
        },
        additionalProperties: false,
      },
    },
    {
      name: "pathstash_manifest_markdown",
      title: "PathStash Manifest Markdown",
      description: "Fetch an authenticated workspace manifest summary in markdown.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceId: workspaceIdProperty,
          relay: relayProperty,
          token: tokenProperty,
        },
        required: ["workspaceId"],
        additionalProperties: false,
      },
    },
    {
      name: "pathstash_manifest_json",
      title: "PathStash Manifest JSON",
      description: "Fetch an authenticated workspace manifest as formatted JSON.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceId: workspaceIdProperty,
          relay: relayProperty,
          token: tokenProperty,
        },
        required: ["workspaceId"],
        additionalProperties: false,
      },
    },
    {
      name: "pathstash_workspace_files",
      title: "PathStash Workspace Files",
      description: "Fetch authenticated workspace file inventory, blob availability, and large-file metadata.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceId: workspaceIdProperty,
          maxBlobBytes: {
            type: "integer",
            minimum: 1,
            description: "Optional byte threshold used to classify large files.",
          },
          relay: relayProperty,
          token: tokenProperty,
        },
        required: ["workspaceId"],
        additionalProperties: false,
      },
    },
    {
      name: "pathstash_secret_inventory",
      title: "PathStash Secret Inventory",
      description: "Fetch workspace secret names, key ids, formats, metadata, and timestamps. Plaintext values are never returned.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceId: workspaceIdProperty,
          relay: relayProperty,
          token: tokenProperty,
        },
        required: ["workspaceId"],
        additionalProperties: false,
      },
    },
  ];
}

async function callMcpTool(params: JsonObject | null, request: Request, origin: string, env: Env): Promise<JsonObject> {
  const name = stringValue(params?.name);
  const args = asObject(params?.arguments) ?? {};
  const relay = normalizeRelay(stringValue(args.relay) ?? DEFAULT_RELAY);
  const token = stringValue(args.token) ?? bearerToken(request);

  try {
    switch (name) {
      case "pathstash_public_context":
        return mcpToolText(pageMarkdown(origin));
      case "pathstash_relay_health":
        return mcpToolText(await relayJson(env, relay, "/health"));
      case "pathstash_protected_resource_metadata":
        return mcpToolText(
          stringValue(args.origin) === "relay"
            ? await relayJson(env, relay, "/.well-known/oauth-protected-resource")
            : JSON.stringify(oauthProtectedResource(origin), null, 2),
        );
      case "pathstash_account_markdown":
        return mcpToolText(await relayText(env, relay, "/v1/me.md", token));
      case "pathstash_account_export":
        return mcpToolText(await relayJson(env, relay, "/v1/me/export.json", token));
      case "pathstash_devices":
        return mcpToolText(await relayJson(env, relay, "/v1/devices", token));
      case "pathstash_teams":
        return mcpToolText(await relayJson(env, relay, "/v1/teams", token));
      case "pathstash_team_details": {
        const teamId = stringValue(args.teamId);
        if (!teamId) {
          return mcpToolText("teamId is required.", true);
        }
        return mcpToolText(await relayJson(env, relay, `/v1/teams/${encodeURIComponent(teamId)}`, token));
      }
      case "pathstash_workspaces": {
        const status = stringValue(args.status);
        const query = status === "archived" || status === "all" ? `?status=${encodeURIComponent(status)}` : "";
        return mcpToolText(await relayJson(env, relay, `/v1/workspaces${query}`, token));
      }
      case "pathstash_manifest_markdown": {
        const workspaceId = stringValue(args.workspaceId);
        if (!workspaceId) {
          return mcpToolText("workspaceId is required.", true);
        }
        return mcpToolText(await relayText(env, relay, `/v1/workspaces/${encodeURIComponent(workspaceId)}/manifest.md`, token));
      }
      case "pathstash_manifest_json": {
        const workspaceId = stringValue(args.workspaceId);
        if (!workspaceId) {
          return mcpToolText("workspaceId is required.", true);
        }
        return mcpToolText(await relayJson(env, relay, `/v1/workspaces/${encodeURIComponent(workspaceId)}/manifest`, token));
      }
      case "pathstash_workspace_files": {
        const workspaceId = stringValue(args.workspaceId);
        if (!workspaceId) {
          return mcpToolText("workspaceId is required.", true);
        }
        const maxBlobBytes = positiveIntegerValue(args.maxBlobBytes);
        const query = maxBlobBytes ? `?maxBlobBytes=${maxBlobBytes}` : "";
        return mcpToolText(await relayJson(env, relay, `/v1/workspaces/${encodeURIComponent(workspaceId)}/files${query}`, token));
      }
      case "pathstash_secret_inventory": {
        const workspaceId = stringValue(args.workspaceId);
        if (!workspaceId) {
          return mcpToolText("workspaceId is required.", true);
        }
        return mcpToolText(await relayJson(env, relay, `/v1/workspaces/${encodeURIComponent(workspaceId)}/secrets`, token));
      }
      default:
        return mcpToolText(`Unknown tool: ${name ?? "missing"}`, true);
    }
  } catch (error) {
    return mcpToolText(error instanceof Error ? error.message : "PathStash tool failed", true);
  }
}

async function relayText(env: Env, relay: string, path: string, token?: string | null): Promise<string> {
  const request = new Request(`${relay}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  const response = relay === DEFAULT_RELAY && env.RELAY ? await env.RELAY.fetch(request) : await fetch(request);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PathStash request failed: ${response.status} ${text}`);
  }
  return text;
}

async function relayJson(env: Env, relay: string, path: string, token?: string | null): Promise<string> {
  const text = await relayText(env, relay, path, token);
  return JSON.stringify(JSON.parse(text) as unknown, null, 2);
}

function mcpToolText(text: string, isError = false): JsonObject {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
    isError,
  };
}

function mcpSuccess(id: JsonRpcId, result: JsonObject): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function mcpError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

function jsonResponse(body: unknown, headers: HeadersInit = {}, status = 200): Response {
  const nextHeaders = new Headers(headers);
  if (!nextHeaders.has("content-type")) {
    nextHeaders.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: nextHeaders,
  });
}

function mcpHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "accept, authorization, content-type, mcp-protocol-version");
  headers.set("access-control-expose-headers", "mcp-protocol-version");
  headers.set("mcp-protocol-version", MCP_PROTOCOL_VERSION);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return headers;
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function positiveIntegerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || typeof value === "number" || value === null;
}

function bearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() || null : null;
}

function normalizeRelay(relay: string): string {
  return relay.trim().replace(/\/+$/, "");
}
