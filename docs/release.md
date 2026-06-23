# Release

PathStash's CLI is published from `apps/cli`.

## Before a release

Run the local checks:

```powershell
cargo fmt --all -- --check
cargo test --workspace
cargo publish --manifest-path apps/cli/Cargo.toml --dry-run

cd apps\relay
bun run typecheck
bun run cf:check
```

The crate needs a crates.io token before it can be published. For GitHub Actions, add a repository secret named `CARGO_REGISTRY_TOKEN`.

## Publish

The `publish crate` workflow can be run manually from GitHub Actions. It also runs when a GitHub Release is published.

For a local publish:

```powershell
$env:CARGO_REGISTRY_TOKEN = "<crates-io-token>"
cargo publish --manifest-path apps/cli/Cargo.toml
```

After crates.io finishes indexing the new version, verify the public install:

```powershell
cargo install pathstash --locked
pathstash --version
```

The TypeScript CLI package is published from `packages/npm-cli` as `pathstash`. Build it before publishing:

```powershell
cd packages\npm-cli
bun install
bun run build
```
