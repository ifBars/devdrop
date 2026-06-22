# Quickstart

Devdrop has two pieces:

- a Rust CLI that scans and hydrates a code root
- a Cloudflare relay that stores workspace metadata, manifests, and content-addressed blobs

## Install the CLI

```powershell
cargo install devdrop --locked
```

## Initialize a workspace

```powershell
devdrop init --root C:\Code --name "Desktop"
```

This creates:

- `.devdrop/config.json`
- `.devdropignore`

Both are local workspace files. `.devdrop/` is ignored by Git.

## Push a workspace

Sign in once, then push:

```powershell
devdrop login
devdrop push --root C:\Code
```

`devdrop login` stores the relay token in the operating system credential store. `--token` and `DEVDROP_TOKEN` still work for CI and temporary sessions.

`push` sends the manifest and uploads file blobs up to 1 MiB. Larger files still appear in the manifest, but their contents are not uploaded by default.

## Hydrate on another machine

Use the workspace id printed by `push`:

```powershell
devdrop hydrate --root C:\Code-Restored --workspace-id "<workspace-id>"
```

Hydration creates directories first, then downloads available blobs. Existing files are left alone unless you pass `--force`.

For a structure-only restore:

```powershell
devdrop hydrate --root C:\Code-Restored --workspace-id "<workspace-id>" --directories-only
```

## Check the hosted relay

```powershell
Invoke-RestMethod https://devdrop-relay.ifbars.workers.dev/health
```

The health endpoint does not require authentication.

The hosted relay URL is the default:

```text
https://devdrop-relay.ifbars.workers.dev
```

Pass `--relay` only when using a different relay.

## What gets skipped

The default ignore set skips generated and private local state:

- `.git/`
- `.devdrop/`
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
