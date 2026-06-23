# V1 architecture

PathStash V1 should feel like a workspace layer, not a file-sync clone. It should help a developer, machine, or coding agent answer three questions quickly:

- What code roots exist?
- What should be restored here?
- What should never leave this machine?

## Product shape

The V1 product has four surfaces:

- CLI: the default interface for setup, push, hydrate, status, auth, and automation.
- Local daemon: watches workspace changes, maintains a local journal, and prepares background uploads.
- Relay API: stores workspace metadata, manifests, blob pointers, device grants, and sync events.
- Web console: manages devices, workspaces, access grants, and recovery links.

The CLI should stay useful without the daemon. The daemon makes it comfortable.

## Core objects

### Account

An account owns workspaces and devices. Individual use should stay simple: one account, several devices, many code roots.

Team use adds shared workspaces, scoped grants, and audit trails.

### Device

A device is a laptop, desktop, cloud VM, CI runner, or agent environment. Each device gets a durable id and a revocable credential.

V1 should avoid a single shared bearer token. Login should issue a device grant, store it in the OS credential store, and rotate it when needed.

### Workspace

A workspace is a named collection of roots. The current CLI treats one root as one workspace; V1 should allow multiple roots under one workspace so a developer can sync `C:\Code`, `C:\Tools`, and a scratch area without pretending they are one Git repository.

### Root

A root is a filesystem directory with its own ignore rules, last manifest, and hydration policy.

Roots need stable ids. Paths can change across machines.

### Manifest

A manifest is the signed snapshot of a root. It includes:

- root id and workspace id
- relative path
- kind: file, directory, symlink
- size and modified time
- content hash when captured
- hydration policy
- redaction reason when excluded

Manifests should be content-addressed and immutable. The database stores the latest pointer.

### Blob

A blob is content-addressed file data. V1 should support resumable upload, size classes, and retention policies. Small files can continue to upload eagerly. Large files need explicit policy.

### Journal

The local journal records scan, push, hydrate, conflict, and auth events. It is local-first and useful for debugging without hitting the relay.

## Auth model

V1 should replace shared relay tokens with a device login flow.

Recommended flow:

1. `pathstash login`
2. CLI opens a browser or prints a device code.
3. Relay grants a scoped device credential.
4. CLI stores the credential in the OS credential store.
5. Future commands refresh short-lived access tokens as needed.

CI and agents still need non-interactive auth. Use scoped tokens that can only access selected workspaces and expire by default.

## Sync model

V1 should separate three operations:

- scan: produce a local manifest
- publish: upload blobs and make the manifest current
- hydrate: apply a manifest to a local root

`pathstash push` can remain the friendly scan-plus-publish command. `pathstash hydrate` should keep refusing destructive overwrites unless `--force` or an explicit conflict policy is set.

Conflict handling should be boring and visible:

- identical hash: skip
- local-only file: keep
- remote-only file: write
- different local and remote hash: leave local file, write conflict report

## Ignore and privacy rules

PathStash needs two layers of exclusion:

- ignore rules: never scan or upload
- redaction rules: record that something existed without storing content

Defaults should keep generated folders, secrets, package caches, build outputs, and internal planning folders local. Users should be able to run `pathstash explain <path>` to see why a file was skipped.

## Relay storage

The current Cloudflare stack is still a good V1 base:

- Workers: API and auth boundary
- D1: account, workspace, root, device, manifest pointers, audit rows
- R2: manifests and blobs
- Durable Objects: live workspace sessions and upload coordination
- Queues: audit, indexing, retention, and webhook fanout

V1 should add a schema boundary between public API objects and storage rows. The API should version manifests explicitly.

## Local storage

New local state lives under `.pathstash/`.

The CLI stores local state under `.pathstash/`.

## Public naming

PathStash is the public product name across the CLI, relay, web app, docs, crate, npm package, and repository.

## V1 cut line

V1 is ready when a new user can:

1. Install `pathstash`.
2. Log in without manually handling relay tokens.
3. Add multiple roots.
4. Push from one machine.
5. Hydrate onto another machine.
6. See exactly what was skipped, uploaded, restored, or conflicted.
7. Revoke a device from the web console.

That is the product. Virtual filesystems, editor plugins, team policy engines, and agent-specific dashboards can wait.
