# pathstash

`pathstash` is the command-line client for PathStash, a small workspace sync tool for developers who move between machines or agent environments.

It scans a code root, skips generated and private local state, pushes a manifest to a relay, uploads streamed content-addressed file blobs, and can hydrate that root somewhere else.

## Install

```powershell
cargo install pathstash --locked
```

## Basic flow

```powershell
pathstash init --root C:\Code --name "Workstation"
pathstash signup --email you@example.com
pathstash push --root C:\Code
pathstash hydrate --root C:\Code-Restored --workspace-id "<workspace-id>"
```

`pathstash signup` creates an account and stores the initial token in the operating system credential store. `pathstash login` can store an existing token. `PATHSTASH_TOKEN` works for CI and temporary sessions.

The hosted relay is `https://pathstash-relay.ifbars.workers.dev`, and it is the default relay URL.
