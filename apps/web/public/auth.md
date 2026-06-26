# auth.md for PathStash

PathStash has public marketing and documentation pages. Account, workspace, token, secret, and manifest APIs require:

```http
Authorization: Bearer <pathstash-token>
```

Users create an account through the web signup form with password login and email verification. The browser dashboard receives an HttpOnly session cookie. CLI, CI, and agent clients use explicit bearer tokens created from the dashboard or token API.

Bearer tokens can be full-access or scoped. Use the narrowest practical preset for machines: CLI sync tokens need workspace, secret, and device read/write access; read-only agents usually need account, workspace, secret, team, and audit read access; CI publish tokens usually need account read plus workspace read/write access. Legacy unscoped tokens are treated as `full_access` for compatibility.

OAuth Protected Resource Metadata is available at:

```text
https://pathstash.ifbars.workers.dev/.well-known/oauth-protected-resource
https://pathstash-relay.ifbars.workers.dev/.well-known/oauth-protected-resource
```

The metadata advertises PathStash's current bearer-token scopes and header presentation method. It intentionally does not advertise OAuth authorization servers yet because PathStash does not currently support OAuth dynamic client registration.

## Agent registration

Agents can be provisioned after a verified user creates a PathStash bearer token for that agent, CLI, or CI job. PathStash currently supports first-party bearer tokens, not OAuth dynamic client registration.

The current `agent_auth` registration method is user-provisioned `service_auth`: a user creates or supplies a PathStash bearer token, and the agent presents that token in the `Authorization` header.

```json
{
  "agent_auth": {
    "skill": "auth.md",
    "register_uri": "https://pathstash.ifbars.workers.dev/signup",
    "identity_types_supported": ["service_auth"],
    "service_auth": {
      "credential_types_supported": ["bearer_token"],
      "claim_uri": "https://pathstash.ifbars.workers.dev/signup"
    },
    "scopes_supported": [
      "full_access",
      "account:read",
      "account:write",
      "workspace:read",
      "workspace:write",
      "secret:read",
      "secret:write",
      "device:read",
      "device:write",
      "token:manage",
      "team:read",
      "team:write",
      "audit:read",
      "billing:write"
    ]
  }
}
```

Agent clients should prefer:

- `GET /llms.txt` for public product and documentation context.
- `GET /v1/me.md` for authenticated account context.
- `GET /v1/workspaces` for authenticated solo and shared workspace discovery. Use `?status=archived` or `?status=all` for archived workspace metadata.
- `GET /v1/workspaces/{workspaceId}/manifest.md` for authenticated workspace manifests.
- `GET /v1/workspaces/{workspaceId}/files` for authenticated manifest-derived file inventory.
- `GET /v1/teams` for authenticated team membership and pending invite discovery.
- `GET /v1/audit/events` for authenticated account activity history.

Git/GitHub remains the source of truth for source code. PathStash stores the surrounding project context, shared sidecars, encrypted secrets, manifests, large file pointers, and non-code assets. Plaintext secret values must never be sent to the relay. Secret values are encrypted locally before storage.
