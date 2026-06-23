# Relay API

Base URL:

```text
https://pathstash-relay.ifbars.workers.dev
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

Returns `200 OK` when the bearer token is valid. The CLI uses this during `pathstash login` before storing a relay token locally.

## Accounts

```http
POST /v1/accounts
```

Creates an account and returns an initial token once. Clients should store that token locally and treat it like a password.

```json
{
  "email": "you@example.com",
  "name": "Alex Developer",
  "deviceLabel": "MacBook Pro"
}
```

## Devices and tokens

```http
GET /v1/devices
POST /v1/devices
DELETE /v1/devices/:deviceId
GET /v1/tokens
POST /v1/tokens
DELETE /v1/tokens/:tokenId
```

Devices and tokens are account scoped.

## Workspaces

```http
POST /v1/workspaces
```

Creates a workspace.

```json
{
  "name": "PathStash",
  "rootPath": "C:\\Users\\ghost\\Desktop\\Coding\\PathStash"
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

Uploads a content-addressed blob. The relay streams the request body into R2 and stores the SHA-256 from the URL as metadata. Clients verify downloaded bytes against the manifest hash.

```http
GET /v1/blobs/:sha256
```

Downloads a blob.

The CLI uses these routes for files that have a SHA-256 in the manifest. Files larger than the configured blob limit remain in the manifest but are not uploaded.

## Secrets

```http
GET /v1/workspaces/:workspaceId/secrets
GET /v1/workspaces/:workspaceId/secrets/:name
PUT /v1/workspaces/:workspaceId/secrets/:name
DELETE /v1/workspaces/:workspaceId/secrets/:name
```

Secrets are stored as ciphertext. The relay requires `ciphertext`, `nonce`, and `keyId`; plaintext secret values should never be sent to the API.

## Workspace sessions

```http
GET /v1/workspaces/:workspaceId/connect
```

Opens a WebSocket connection to the workspace Durable Object. The current release uses this as a live coordination proof point; richer sync fanout can build on the same route.
