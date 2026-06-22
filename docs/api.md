# Relay API

Base URL:

```text
https://devdrop-relay.ifbars.workers.dev
```

Authenticated endpoints expect:

```text
Authorization: Bearer <token>
```

## Health

```http
GET /health
```

Returns service status and D1 connectivity.

## Auth check

```http
GET /v1/auth/check
```

Returns `200 OK` when the bearer token is valid. The CLI uses this during `devdrop login` before storing a relay token locally.

## Workspaces

```http
POST /v1/workspaces
```

Creates a workspace.

```json
{
  "name": "Devdrop",
  "rootPath": "C:\\Users\\ghost\\Desktop\\Coding\\Devdrop"
}
```

```http
GET /v1/workspaces/:workspaceId
```

Returns workspace metadata.

## Manifests

```http
PUT /v1/workspaces/:workspaceId/manifest
```

Stores the latest manifest and writes a content-addressed copy to R2.

```http
GET /v1/workspaces/:workspaceId/manifest
```

Returns the current manifest.

## Blobs

```http
PUT /v1/blobs/:sha256
```

Uploads a blob. The relay verifies that the request body matches the SHA-256 path before storing it.

```http
GET /v1/blobs/:sha256
```

Downloads a blob.

The CLI uses these routes for files that have a SHA-256 in the manifest. Files without a hash were intentionally skipped by the client, usually because they were larger than the configured blob limit.

## Workspace sessions

```http
GET /v1/workspaces/:workspaceId/connect
```

Opens a WebSocket connection to the workspace Durable Object. V0 uses this as a live coordination proof point; richer sync fanout can build on the same route.
