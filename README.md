# PathStash

PathStash keeps a developer's workspace recognizable across machines.

It handles the layer around Git: where code roots live, which local folders should stay local, and what a new machine or coding agent needs before work starts. The CLI scans a code root, pushes a manifest to a small relay, uploads bounded file blobs, and can hydrate the same root somewhere else.

Git still owns source history. PathStash owns the workspace map.

## Install

```powershell
cargo install pathstash --locked
```

## Use it

```powershell
pathstash signup --email you@example.com
pathstash init --root C:\Code --name "Desktop"
pathstash push --root C:\Code
pathstash hydrate --root C:\Code-Restored --workspace-id "<workspace-id>"
```

The hosted relay currently runs at:

```text
https://pathstash-relay.ifbars.workers.dev
```

By default, `push` uploads files up to 64 MiB with streamed blob uploads and skips generated or private local state such as `.git/`, `.pathstash/`, `node_modules/`, `target/`, `internal/`, and local deployment token files. `hydrate` recreates directories and downloads available blobs without overwriting conflicting files unless `--force` is passed.

PathStash also includes account-scoped tokens, device listing, and encrypted secret storage. Secret values are encrypted by the CLI before they reach the relay.

## Repository layout

- `apps/cli`: Rust command-line client published as the `pathstash` crate.
- `apps/relay`: Cloudflare Worker relay backed by D1, R2, Queue, and Durable Objects.
- `apps/web`: React marketing site and dashboard.
- `packages/npm-cli`: TypeScript CLI package for `npx pathstash` and `bunx pathstash`.
- `docs`: public developer documentation.

Private research notes, captured source material, and planning files are kept out of Git. PathStash is meant to become the place for that kind of workspace state.

## Local checks

```powershell
cargo test --workspace
cd apps\relay
bun run typecheck
```

## Docs

- [Quickstart](docs/quickstart.md)
- [Relay API](docs/api.md)
- [Architecture](docs/architecture.md)
- [V1 architecture](docs/v1-architecture.md)
- [Agent guide](docs/agents.md)
- [Product brief](docs/product-brief.md)
- [Release](docs/release.md)
