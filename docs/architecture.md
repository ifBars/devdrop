# Architecture

## Local client

The local client scans a code root and builds a manifest. It respects Git ignore files and PathStash-specific ignore rules, hashes files up to 1 MiB, and can upload those files as content-addressed blobs.

Hydration runs in the opposite direction. It fetches the latest manifest for a workspace, creates directories, downloads available blobs, and refuses to overwrite conflicting files unless `--force` is passed.

The CLI writes local state under `.pathstash/` and reads project ignore rules from `.pathstashignore`.

## Relay

The relay stores workspace metadata and content-addressed blobs.

- D1: workspace metadata and current manifest rows
- R2: content-addressed manifest/blob storage
- Queue: async event/audit path
- Durable Objects: per-workspace live session coordination

The hosted relay uses the `pathstash-relay` worker name. Auth is account scoped: users create an account, receive an initial token once, and can create or revoke additional tokens.

## Why the filesystem is not virtual yet

Lazy file hydration is part of the long-term product, but a virtual filesystem is a hard first dependency. The current release uses normal files, explicit manifest uploads, and blob endpoints. That gives us a live product path before taking on Windows, macOS, and Linux filesystem integration.

## Current sync model

- Manifest entries describe paths, kind, size, and SHA-256 when a small file was hashed.
- Blob keys are the SHA-256 of the file body.
- `push` uploads blobs before publishing the manifest, so a newly fetched manifest should point to available content.
- Large files are visible in the manifest but skipped as blobs unless the user raises `--max-blob-bytes`.
- `.pathstash/`, generated folders, and private internal folders stay local by default.

## Public API

- `GET /health`
- `GET /v1/auth/check`
- `POST /v1/workspaces`
- `GET /v1/workspaces/:workspaceId`
- `PUT /v1/workspaces/:workspaceId/manifest`
- `GET /v1/workspaces/:workspaceId/manifest`
- `PUT /v1/blobs/:sha256`
- `GET /v1/blobs/:sha256`
- `GET /v1/workspaces/:workspaceId/connect` for WebSocket session testing
