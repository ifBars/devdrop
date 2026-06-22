# devdrop

`devdrop` is the command-line client for Devdrop, a small workspace sync tool for developers who move between machines or agent environments.

It scans a code root, skips generated and private local state, pushes a manifest to a relay, uploads small content-addressed file blobs, and can hydrate that root somewhere else.

## Install

```powershell
cargo install devdrop --locked
```

## Basic flow

```powershell
devdrop init --root C:\Code --name "Workstation"
devdrop login
devdrop push --root C:\Code
devdrop hydrate --root C:\Code-Restored --workspace-id "<workspace-id>"
```

`devdrop login` stores the relay token in the operating system credential store. By default, `push` uploads file blobs up to 1 MiB and `hydrate` refuses to overwrite conflicting files unless `--force` is passed.

The hosted test relay is `https://devdrop-relay.ifbars.workers.dev`, and it is the default relay URL.
