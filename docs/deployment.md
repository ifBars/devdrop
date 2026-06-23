# Deployment

## Cloudflare resources

The hosted relay uses these Cloudflare resources:

- Worker: `pathstash-relay`
- D1 database: `pathstash-meta`
- R2 bucket: `pathstash-objects`
- Queue: `pathstash-events`
- Durable Object: `WorkspaceSession`

## Commands

```powershell
cd apps\relay
bun install
bun run cf:types
bunx wrangler secret put RELAY_ADMIN_TOKEN
bunx wrangler deploy --minify
```

The checked-in `wrangler.jsonc` points at the current D1 database, R2 bucket, Queue, and Durable Object binding. To deploy your own relay, create those resources first, then update the ids in `wrangler.jsonc`.

Keep local tokens and deployment scratch notes out of Git.
