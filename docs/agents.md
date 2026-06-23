# Agent guide

PathStash is meant to be useful to humans and coding agents. Humans should have a CLI and dashboard. Agents should have stable markdown context, an MCP server, and API routes that do not require scraping a web UI.

## What agents can use

- `GET /llms.txt`: product summary and stable agent links.
- `GET /v1/me.md`: authenticated account, workspace, and device summary as markdown.
- `GET /v1/workspaces/:workspaceId/manifest.md`: authenticated workspace manifest summary as markdown.
- `packages/mcp`: stdio MCP server for agent clients.
- `packages/npm-cli`: TypeScript CLI for `npx pathstash` and `bunx pathstash`.

## MCP server

Install from the repo package during development:

```powershell
cd packages\mcp
bun install
bun run build
```

Run it with:

```powershell
$env:PATHSTASH_TOKEN = "<token>"
node dist\index.js
```

The server uses the default relay unless `PATHSTASH_RELAY` is set.

## Safety model

Agents should treat PathStash as workspace context and sync infrastructure, not as a place to exfiltrate private data. Secret values are encrypted by the client before storage. Agents may list secret names and metadata, but should not request plaintext values unless the user explicitly asks and the local client can decrypt them.
