type Env = {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
};

const PAGE_MARKDOWN = `# PathStash

PathStash is Dropbox for modern software developers. It keeps the layer around Git available across machines and agents: workspace roots, selected files, devices, encrypted secrets, manifests, and large file pointers.

## Product

PathStash keeps your development workspace recognizable everywhere. Git remains the source of code history. PathStash stores the workspace map around it: where roots live, which devices are connected, which selected files are available, and which encrypted secrets belong to a workspace.

## Install

\`\`\`sh
cargo install pathstash --locked
npx pathstash help
bunx pathstash help
\`\`\`

## First run

\`\`\`sh
pathstash signup --email you@example.com
pathstash init --root .
pathstash push --root .
pathstash hydrate --root ./restored --workspace-id <workspace-id>
\`\`\`

## Plans

- Free: solo workspace sync for a few devices.
- Pro: more devices, storage, large files, and encrypted secrets.
- Team: shared workspaces, policy, audit logs, and team-scale storage.

## Agent support

- \`/llms.txt\`: stable agent-facing project summary.
- Relay \`/v1/me.md\`: authenticated account and workspace markdown.
- Relay \`/v1/workspaces/{workspaceId}/manifest.md\`: authenticated manifest markdown.
- MCP server: \`@pathstash/mcp\`.

## Relay

Default relay: https://pathstash-relay.ifbars.workers.dev

## Repository

https://github.com/ifBars/pathstash
`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (wantsMarkdown(request) && isPageRequest(url.pathname)) {
      return new Response(PAGE_MARKDOWN, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          vary: "accept",
        },
      });
    }

    const response = await env.ASSETS.fetch(request);
    if (response.headers.get("content-type")?.includes("text/html")) {
      const headers = new Headers(response.headers);
      headers.set("vary", appendVary(headers.get("vary"), "accept"));
      headers.set("link", appendLink(headers.get("link"), `</llms.txt>; rel="alternate"; type="text/plain"`));
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  },
};

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
