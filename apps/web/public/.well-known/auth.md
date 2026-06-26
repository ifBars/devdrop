# auth.md for PathStash

PathStash account APIs use bearer tokens:

```http
Authorization: Bearer <pathstash-token>
```

Public agent context is available at `/llms.txt`. Authenticated agent context is available at `/v1/me.md`, `/v1/workspaces/{workspaceId}/manifest.md`, `/v1/workspaces/{workspaceId}/files`, and `/v1/audit/events`.

OAuth Protected Resource Metadata is available at:

```text
https://pathstash.ifbars.workers.dev/.well-known/oauth-protected-resource
https://pathstash-relay.ifbars.workers.dev/.well-known/oauth-protected-resource
```

The metadata advertises PathStash's current bearer-token scopes and header presentation method. It intentionally does not advertise OAuth authorization servers yet because PathStash does not currently support OAuth dynamic client registration.

Agents can be provisioned through the web signup form, `pathstash signup --email <email>`, or a user-provided account token. The current `agent_auth` registration method is user-provisioned `service_auth` with bearer-token credentials.

Plaintext secret values must never be sent to the relay.
