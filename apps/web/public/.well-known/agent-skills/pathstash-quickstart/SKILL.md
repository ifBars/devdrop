# PathStash Quickstart

Use this skill when an agent needs to understand, inspect, or operate a PathStash workspace without scraping the web UI.

## Discovery

- Read `https://pathstash.ifbars.workers.dev/llms.txt` for public product and endpoint context.
- Read `https://pathstash.ifbars.workers.dev/auth.md` for authentication rules before calling account-scoped endpoints.
- Read `https://pathstash.ifbars.workers.dev/.well-known/oauth-protected-resource` for bearer-token protected-resource metadata.
- Use the OpenAPI catalog at `https://pathstash.ifbars.workers.dev/openapi.json` for relay endpoint shapes.
- Use `https://pathstash.ifbars.workers.dev/.well-known/mcp/server-card.json` to discover the remote MCP server.
- Call `https://pathstash.ifbars.workers.dev/mcp` as the Streamable HTTP MCP endpoint.

## Authentication

PathStash account, workspace, device, token, secret, blob, and manifest APIs use bearer tokens.

```http
Authorization: Bearer <pathstash-token>
```

Never request or expose plaintext secret values. The relay stores encrypted secret metadata and ciphertext only.

## Useful Endpoints

- `GET /v1/me.md`: authenticated account, subscription, workspace, and device context.
- `GET /v1/workspaces/{workspaceId}/manifest.md`: authenticated workspace manifest summary.
- `GET /v1/workspaces/{workspaceId}/files`: manifest-derived file inventory and large-file pointers.
- `GET /v1/audit/events`: account activity history for handoff and operational review.
- `GET /v1/devices`: devices connected to the account.
- `POST https://pathstash.ifbars.workers.dev/mcp`: remote MCP endpoint with public context, relay health, account markdown, device, and manifest tools.

Use `https://pathstash-relay.ifbars.workers.dev` as the default relay unless the user configured a different relay.
