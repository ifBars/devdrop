# Quickstart

PathStash has two pieces:

- a Rust CLI that scans and hydrates a code root
- a Cloudflare relay that stores workspace metadata, manifests, and content-addressed blobs

## Install the CLI

```powershell
cargo install pathstash --locked
```

Node users can use the TypeScript CLI package:

```powershell
npx pathstash help
bunx pathstash help
```

## Create an account

```powershell
pathstash signup --email you@example.com
```

Signup creates an account, returns an initial token, and stores that token in the operating system credential store.

## Initialize a workspace

```powershell
pathstash init --root C:\Code --name "Desktop"
```

This creates:

- `.pathstash/config.json`
- `.pathstashignore`

## Push a workspace

Sign in once, then push:

```powershell
pathstash login
pathstash push --root C:\Code
```

`pathstash login` stores an existing token in the operating system credential store. `--token` and `PATHSTASH_TOKEN` work for CI and temporary sessions.

`push` sends the manifest and uploads file blobs up to 64 MiB by default. Larger files still appear in the manifest, but their contents are not uploaded unless you raise `--max-blob-bytes`.

## Hydrate on another machine

Use the workspace id printed by `push`:

```powershell
pathstash hydrate --root C:\Code-Restored --workspace-id "<workspace-id>"
```

Hydration creates directories first, then downloads available blobs. Existing files are left alone unless you pass `--force`.

For a structure-only restore:

```powershell
pathstash hydrate --root C:\Code-Restored --workspace-id "<workspace-id>" --directories-only
```

## Check the hosted relay

```powershell
Invoke-RestMethod https://pathstash-relay.ifbars.workers.dev/health
```

The health endpoint does not require authentication.

```text
https://pathstash-relay.ifbars.workers.dev
```

Pass `--relay` only when using a different relay.

## What gets skipped

The default ignore set skips generated and private local state:

- `.git/`
- `.pathstash/`
- `node_modules/`
- `target/`
- `dist/`
- `.next/`
- `.wrangler/`
- `internal/`
- `infra/live-test-token.txt`
- `bin/`
- `obj/`
- `Library/`
