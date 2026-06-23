# PathStash MCP server

`@pathstash/mcp` exposes PathStash workspace context to MCP-compatible agent clients.

```powershell
$env:PATHSTASH_TOKEN = "<token>"
npx @pathstash/mcp
```

Set `PATHSTASH_RELAY` to use a different relay. The default relay is `https://pathstash-relay.ifbars.workers.dev`.

Tools:

- `pathstash_llms`: fetches `llms.txt`
- `pathstash_account_markdown`: fetches authenticated account context as markdown
- `pathstash_devices`: lists devices as JSON
- `pathstash_manifest_markdown`: fetches a workspace manifest summary as markdown
- `pathstash_manifest_json`: fetches a workspace manifest as JSON
