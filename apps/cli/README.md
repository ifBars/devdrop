# devdrop

`devdrop` is the command-line client for Devdrop, a small workspace sync tool for developers who move between machines or agent environments.

It scans a code root, skips generated and private local state, pushes a manifest to a relay, uploads small content-addressed file blobs, and can hydrate that root somewhere else.

## Install

```powershell
cargo install --git https://github.com/ifBars/devdrop devdrop
```

## Basic flow

```powershell
devdrop init --root C:\Code --name "Workstation"
$env:DEVDROP_TOKEN = "<relay-token>"
devdrop push --root C:\Code
devdrop hydrate --root C:\Code-Restored --workspace-id "<workspace-id>"
```

By default, `push` uploads file blobs up to 1 MiB and `hydrate` refuses to overwrite conflicting files unless `--force` is passed.

The hosted test relay is `https://devdrop-relay.ifbars.workers.dev`.
