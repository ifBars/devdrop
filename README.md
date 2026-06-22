# Devdrop

Devdrop keeps a developer's code workspace recognizable across machines.

It is for the layer around Git: where repositories live, which folders should never sync, and what a new machine or coding agent needs before work starts. The CLI scans a code root, pushes a manifest to a small Cloudflare relay, uploads bounded file blobs, and can hydrate the same root somewhere else.

Git still owns source history. Devdrop owns the workspace map.

## Install

```powershell
cargo install devdrop
```

To install directly from GitHub:

```powershell
cargo install --git https://github.com/ifBars/devdrop devdrop
```

## Use it

```powershell
devdrop init --root C:\Code --name "Desktop"
$env:DEVDROP_TOKEN = "<relay-token>"
devdrop push --root C:\Code
devdrop hydrate --root C:\Code-Restored --workspace-id "<workspace-id>"
```

The hosted test relay is:

```text
https://devdrop-relay.ifbars.workers.dev
```

By default, `push` uploads files up to 1 MiB and skips generated or private local state such as `.git/`, `.devdrop/`, `node_modules/`, `target/`, `internal/`, and local deployment token files. `hydrate` recreates directories and downloads available blobs without overwriting conflicting files unless `--force` is passed.

## Repository layout

- `apps/cli`: Rust command-line client published as the `devdrop` crate.
- `apps/relay`: Cloudflare Worker relay backed by D1, R2, Queue, and Durable Objects.
- `docs`: public developer documentation.

Private research notes, captured source material, and planning files are kept out of Git. Devdrop is meant to become the place for that kind of workspace state.

## Local checks

```powershell
cd C:\Users\ghost\Desktop\Coding\Devdrop
cargo test --manifest-path apps/cli/Cargo.toml
cd apps\relay
bun run typecheck
```

## Docs

- [Quickstart](docs/quickstart.md)
- [Relay API](docs/api.md)
- [Architecture](docs/architecture.md)
- [Product brief](docs/product-brief.md)
