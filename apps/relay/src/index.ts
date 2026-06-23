import { DurableObject } from "cloudflare:workers";

type Env = {
  DB: D1Database;
  OBJECTS: R2Bucket;
  EVENT_QUEUE: Queue<EventMessage>;
  WORKSPACE_SESSIONS: DurableObjectNamespace<WorkspaceSession>;
  RELAY_ADMIN_TOKEN?: string;
  ENVIRONMENT: string;
  WEB_ORIGIN?: string;
};

type EventMessage = {
  id: string;
  workspaceId?: string;
  kind: string;
  payload: unknown;
  createdAt: string;
};

type CreateWorkspaceRequest = {
  name?: string;
  rootPath?: string;
  device?: {
    id?: string;
    label?: string;
    publicKey?: string;
  };
};

type CreateAccountRequest = {
  email?: string;
  name?: string;
  deviceLabel?: string;
};

type CreateTokenRequest = {
  name?: string;
};

type CreateDeviceRequest = {
  label?: string;
  publicKey?: string;
};

type PutSecretRequest = {
  ciphertext?: string;
  nonce?: string;
  keyId?: string;
  format?: string;
  metadata?: Record<string, unknown>;
};

type AuthContext =
  | { kind: "admin" }
  | { kind: "account"; accountId: string; email: string; tokenId: string };

type ManifestDocument = {
  workspaceId?: string;
  version?: number;
  rootPath?: string;
  generatedAt?: string;
  entries?: unknown[];
  ignores?: string[];
  [key: string]: unknown;
};

type WorkspaceRow = {
  id: string;
  account_id: string | null;
  name: string;
  root_path: string;
  created_at: string;
  updated_at: string;
};

type ManifestRow = {
  workspace_id: string;
  version: number;
  manifest_hash: string;
  manifest_json: string;
  updated_at: string;
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

export class WorkspaceSession extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS session_events (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
    });
  }

  async record(kind: string, payload: unknown): Promise<void> {
    this.ctx.storage.sql.exec(
      "INSERT INTO session_events (id, kind, payload_json, created_at) VALUES (?, ?, ?, ?)",
      crypto.randomUUID(),
      kind,
      JSON.stringify(payload),
      new Date().toISOString(),
    );
    this.broadcast({ type: "event", kind, payload });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ ok: true, connected: this.ctx.getWebSockets().length });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "hello", connected: this.ctx.getWebSockets().length }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    ws.send(JSON.stringify({ type: "ack", received: text, at: new Date().toISOString() }));
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, "workspace session error");
  }

  private broadcast(payload: unknown): void {
    const text = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(text);
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      if (request.method === "OPTIONS") {
        return withCors(request, env, new Response(null, { status: 204 }));
      }
      return withCors(request, env, await route(request, env, ctx));
    } catch (error) {
      console.error(JSON.stringify({ level: "error", message: "unhandled", error: String(error) }));
      return withCors(request, env, json({ error: "internal_error" }, 500));
    }
  },

  async queue(batch: MessageBatch<EventMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO events (id, workspace_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(
          message.body.id,
          message.body.workspaceId ?? null,
          message.body.kind,
          JSON.stringify(message.body.payload),
          message.body.createdAt,
        )
        .run();
      message.ack();
    }
  },
};

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    const db = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return json({
      ok: true,
      service: "pathstash-relay",
      environment: env.ENVIRONMENT,
      database: db?.ok === 1 ? "ok" : "unknown",
      at: new Date().toISOString(),
    });
  }

  if (request.method === "GET" && url.pathname === "/llms.txt") {
    return markdown(llmsText(new URL(request.url).origin));
  }

  if (request.method === "POST" && url.pathname === "/v1/accounts") {
    return createAccount(request, env);
  }

  const segments = url.pathname.split("/").filter(Boolean);

  const auth = await authorize(request, env);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  if (request.method === "GET" && url.pathname === "/v1/auth/check") {
    return json({ ok: true, authenticated: true, principal: auth.context.kind });
  }

  if (request.method === "GET" && url.pathname === "/v1/me") {
    return getMe(env, auth.context);
  }

  if (request.method === "GET" && url.pathname === "/v1/me.md") {
    return getMeMarkdown(env, auth.context);
  }

  if (segments[0] === "v1" && segments[1] === "tokens") {
    if (request.method === "GET" && segments.length === 2) {
      return listTokens(env, auth.context);
    }
    if (request.method === "POST" && segments.length === 2) {
      return createToken(request, env, auth.context);
    }
    if (request.method === "DELETE" && segments[2]) {
      return revokeToken(env, auth.context, segments[2]);
    }
  }

  if (segments[0] === "v1" && segments[1] === "devices") {
    if (request.method === "GET" && segments.length === 2) {
      return listDevices(env, auth.context);
    }
    if (request.method === "POST" && segments.length === 2) {
      return createDevice(request, env, auth.context);
    }
    if (request.method === "DELETE" && segments[2]) {
      return revokeDevice(env, auth.context, segments[2]);
    }
  }

  if (request.method === "POST" && url.pathname === "/v1/workspaces") {
    return createWorkspace(request, env, ctx, auth.context);
  }

  if (segments[0] === "v1" && segments[1] === "workspaces" && segments[2]) {
    const workspaceId = segments[2];

    if (request.method === "GET" && segments.length === 3) {
      return getWorkspace(env, auth.context, workspaceId);
    }

    if (segments[3] === "manifest") {
      if (request.method === "PUT") {
        return putManifest(request, env, ctx, auth.context, workspaceId);
      }
      if (request.method === "GET") {
        return getManifest(env, auth.context, workspaceId);
      }
    }

    if (segments[3] === "manifest.md" && request.method === "GET") {
      return getManifestMarkdown(env, auth.context, workspaceId);
    }

    if (segments[3] === "secrets") {
      if (request.method === "GET" && segments.length === 4) {
        return listSecrets(env, auth.context, workspaceId);
      }
      if (request.method === "GET" && segments[4]) {
        return getSecret(env, auth.context, workspaceId, decodeURIComponent(segments[4]));
      }
      if (request.method === "PUT" && segments[4]) {
        return putSecret(request, env, auth.context, workspaceId, decodeURIComponent(segments[4]));
      }
      if (request.method === "DELETE" && segments[4]) {
        return deleteSecret(env, auth.context, workspaceId, decodeURIComponent(segments[4]));
      }
    }

    if (segments[3] === "connect" && request.method === "GET") {
      const access = await canAccessWorkspace(env, auth.context, workspaceId);
      if (!access) {
        return json({ error: "workspace_not_found" }, 404);
      }
      const stub = env.WORKSPACE_SESSIONS.getByName(workspaceId);
      return stub.fetch(request);
    }
  }

  if (segments[0] === "v1" && segments[1] === "blobs" && segments[2]) {
    const hash = segments[2];
    if (!isSha256(hash)) {
      return json({ error: "invalid_sha256" }, 400);
    }
    if (request.method === "PUT") {
      return putBlob(request, env, ctx, hash);
    }
    if (request.method === "GET") {
      return getBlob(env, hash);
    }
  }

  return json({ error: "not_found" }, 404);
}

async function createAccount(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<CreateAccountRequest>(request);
  if (!body.ok) {
    return json({ error: body.error }, 400);
  }

  const email = normalizeEmail(body.value.email);
  if (!email) {
    return json({ error: "invalid_email" }, 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM accounts WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (existing) {
    return json({ error: "account_exists" }, 409);
  }

  const accountId = crypto.randomUUID();
  const tokenId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const name = cleanText(body.value.name, email.split("@")[0] ?? "PathStash user");
  const deviceLabel = cleanText(body.value.deviceLabel, "first-device");

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(accountId, email, name, now, now),
    env.DB.prepare(
      "INSERT INTO access_tokens (id, account_id, name, token_hash, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(tokenId, accountId, "Initial token", tokenHash, now, now),
    env.DB.prepare(
      "INSERT INTO devices (id, account_id, label, public_key, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(deviceId, accountId, deviceLabel, null, now, now),
  ]);

  return json(
    {
      account: { id: accountId, email, name, createdAt: now },
      device: { id: deviceId, label: deviceLabel, createdAt: now },
      token: { id: tokenId, name: "Initial token", value: token, createdAt: now },
    },
    201,
  );
}

async function getMe(env: Env, auth: AuthContext): Promise<Response> {
  if (auth.kind === "admin") {
    const [accountStats, workspaceStats, deviceStats] = await env.DB.batch([
      env.DB.prepare("SELECT count(*) AS count FROM accounts"),
      env.DB.prepare("SELECT count(*) AS count FROM workspaces"),
      env.DB.prepare("SELECT count(*) AS count FROM devices WHERE revoked_at IS NULL"),
    ]);
    const accountCount = (accountStats?.results as { count: number }[] | undefined)?.[0]?.count ?? 0;
    const workspaceCount = (workspaceStats?.results as { count: number }[] | undefined)?.[0]?.count ?? 0;
    const deviceCount = (deviceStats?.results as { count: number }[] | undefined)?.[0]?.count ?? 0;
    return json({
      principal: "admin",
      accounts: accountCount,
      workspaces: workspaceCount,
      devices: deviceCount,
    });
  }

  const account = await env.DB.prepare("SELECT id, email, name, created_at, updated_at FROM accounts WHERE id = ?")
    .bind(auth.accountId)
    .first();
  const devices = await env.DB.prepare(
    "SELECT id, label, public_key, created_at, last_seen_at FROM devices WHERE account_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC",
  )
    .bind(auth.accountId)
    .all();
  const workspaces = await env.DB.prepare(
    "SELECT id, name, root_path, created_at, updated_at FROM workspaces WHERE account_id = ? ORDER BY updated_at DESC",
  )
    .bind(auth.accountId)
    .all();

  return json({ account, devices: devices.results, workspaces: workspaces.results });
}

async function getMeMarkdown(env: Env, auth: AuthContext): Promise<Response> {
  if (auth.kind === "admin") {
    const response = await getMe(env, auth);
    const data = (await response.json()) as { accounts?: number; workspaces?: number; devices?: number };
    return markdown(`# PathStash admin\n\n- Accounts: ${data.accounts ?? 0}\n- Workspaces: ${data.workspaces ?? 0}\n- Devices: ${data.devices ?? 0}\n`);
  }

  const account = await env.DB.prepare("SELECT email, name FROM accounts WHERE id = ?")
    .bind(auth.accountId)
    .first<{ email: string; name: string }>();
  const devices = await env.DB.prepare(
    "SELECT label, last_seen_at FROM devices WHERE account_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC",
  )
    .bind(auth.accountId)
    .all<{ label: string; last_seen_at: string }>();
  const workspaces = await env.DB.prepare(
    "SELECT id, name, root_path, updated_at FROM workspaces WHERE account_id = ? ORDER BY updated_at DESC",
  )
    .bind(auth.accountId)
    .all<{ id: string; name: string; root_path: string; updated_at: string }>();

  const workspaceLines = (workspaces.results ?? [])
    .map((workspace) => `- ${workspace.name} (${workspace.id}) at \`${workspace.root_path}\`, updated ${workspace.updated_at}`)
    .join("\n");
  const deviceLines = (devices.results ?? [])
    .map((device) => `- ${device.label}, last seen ${device.last_seen_at}`)
    .join("\n");

  return markdown(`# PathStash account\n\n${account?.name ?? "Account"} <${account?.email ?? auth.email}>\n\n## Workspaces\n\n${workspaceLines || "- No workspaces yet"}\n\n## Devices\n\n${deviceLines || "- No devices yet"}\n`);
}

async function listTokens(env: Env, auth: AuthContext): Promise<Response> {
  if (auth.kind === "admin") {
    return json({ error: "account_required" }, 403);
  }

  const rows = await env.DB.prepare(
    "SELECT id, name, created_at, last_used_at, revoked_at FROM access_tokens WHERE account_id = ? ORDER BY created_at DESC",
  )
    .bind(auth.accountId)
    .all();
  return json({ tokens: rows.results });
}

async function createToken(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  if (auth.kind === "admin") {
    return json({ error: "account_required" }, 403);
  }

  const body = await parseJson<CreateTokenRequest>(request);
  if (!body.ok) {
    return json({ error: body.error }, 400);
  }

  const id = crypto.randomUUID();
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const name = cleanText(body.value.name, "CLI token");
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO access_tokens (id, account_id, name, token_hash, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, auth.accountId, name, tokenHash, now, now)
    .run();

  return json({ token: { id, name, value: token, createdAt: now } }, 201);
}

async function revokeToken(env: Env, auth: AuthContext, tokenId: string): Promise<Response> {
  if (auth.kind === "admin") {
    return json({ error: "account_required" }, 403);
  }

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE access_tokens SET revoked_at = ? WHERE id = ? AND account_id = ?")
    .bind(now, tokenId, auth.accountId)
    .run();
  return json({ ok: true, revokedAt: now });
}

async function listDevices(env: Env, auth: AuthContext): Promise<Response> {
  if (auth.kind === "admin") {
    const rows = await env.DB.prepare(
      "SELECT id, account_id, workspace_id, label, public_key, created_at, last_seen_at, revoked_at FROM devices ORDER BY last_seen_at DESC LIMIT 200",
    ).all();
    return json({ devices: rows.results });
  }

  const rows = await env.DB.prepare(
    "SELECT id, workspace_id, label, public_key, created_at, last_seen_at, revoked_at FROM devices WHERE account_id = ? ORDER BY last_seen_at DESC",
  )
    .bind(auth.accountId)
    .all();
  return json({ devices: rows.results });
}

async function createDevice(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  if (auth.kind === "admin") {
    return json({ error: "account_required" }, 403);
  }

  const body = await parseJson<CreateDeviceRequest>(request);
  if (!body.ok) {
    return json({ error: body.error }, 400);
  }

  const id = crypto.randomUUID();
  const label = cleanText(body.value.label, "new-device");
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO devices (id, account_id, label, public_key, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, auth.accountId, label, body.value.publicKey ?? null, now, now)
    .run();
  return json({ device: { id, label, publicKey: body.value.publicKey ?? null, createdAt: now } }, 201);
}

async function revokeDevice(env: Env, auth: AuthContext, deviceId: string): Promise<Response> {
  if (auth.kind === "admin") {
    return json({ error: "account_required" }, 403);
  }

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE devices SET revoked_at = ? WHERE id = ? AND account_id = ?")
    .bind(now, deviceId, auth.accountId)
    .run();
  return json({ ok: true, revokedAt: now });
}

async function createWorkspace(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  auth: AuthContext,
): Promise<Response> {
  const body = await parseJson<CreateWorkspaceRequest>(request);
  if (!body.ok) {
    return json({ error: body.error }, 400);
  }

  const name = cleanText(body.value.name, "Default Workspace");
  const rootPath = cleanText(body.value.rootPath, "~/Code");
  const workspaceId = crypto.randomUUID();
  const now = new Date().toISOString();
  const accountId = auth.kind === "account" ? auth.accountId : null;

  await env.DB.prepare(
    "INSERT INTO workspaces (id, account_id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(workspaceId, accountId, name, rootPath, now, now)
    .run();

  if (body.value.device && auth.kind === "account") {
    await env.DB.prepare(
      "INSERT INTO devices (id, account_id, workspace_id, label, public_key, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        cleanText(body.value.device.id, crypto.randomUUID()),
        auth.accountId,
        workspaceId,
        cleanText(body.value.device.label, "first-device"),
        body.value.device.publicKey ?? null,
        now,
        now,
      )
      .run();
  }

  ctx.waitUntil(recordEvent(env, workspaceId, "workspace.created", { name, rootPath }));
  return json({ id: workspaceId, name, rootPath, createdAt: now }, 201);
}

async function getWorkspace(env: Env, auth: AuthContext, workspaceId: string): Promise<Response> {
  const row = await getWorkspaceRow(env, auth, workspaceId);
  if (!row) {
    return json({ error: "workspace_not_found" }, 404);
  }

  return json({
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    rootPath: row.root_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function putManifest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  auth: AuthContext,
  workspaceId: string,
): Promise<Response> {
  const body = await parseJson<ManifestDocument>(request);
  if (!body.ok) {
    return json({ error: body.error }, 400);
  }

  const workspace = await getWorkspaceRow(env, auth, workspaceId);
  if (!workspace) {
    return json({ error: "workspace_not_found" }, 404);
  }

  const manifest = {
    ...body.value,
    workspaceId,
    updatedAt: new Date().toISOString(),
  };
  const manifestJson = stableJson(manifest);
  const hash = await sha256Hex(manifestJson);
  const version = Number.isFinite(body.value.version) ? Number(body.value.version) : 1;
  const now = new Date().toISOString();

  await env.OBJECTS.put(`manifests/${workspaceId}/${hash}.json`, manifestJson, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  await env.DB.prepare(
    `INSERT INTO workspace_manifests (workspace_id, version, manifest_hash, manifest_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id) DO UPDATE SET
       version = excluded.version,
       manifest_hash = excluded.manifest_hash,
       manifest_json = excluded.manifest_json,
       updated_at = excluded.updated_at`,
  )
    .bind(workspaceId, version, hash, manifestJson, now)
    .run();

  await env.DB.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?")
    .bind(now, workspaceId)
    .run();

  const stub = env.WORKSPACE_SESSIONS.getByName(workspaceId);
  ctx.waitUntil(stub.record("manifest.updated", { workspaceId, hash, version }));
  ctx.waitUntil(recordEvent(env, workspaceId, "manifest.updated", { hash, version }));

  return json({ workspaceId, hash, version, updatedAt: now });
}

async function getManifest(env: Env, auth: AuthContext, workspaceId: string): Promise<Response> {
  const workspace = await getWorkspaceRow(env, auth, workspaceId);
  if (!workspace) {
    return json({ error: "workspace_not_found" }, 404);
  }

  const row = await env.DB.prepare("SELECT * FROM workspace_manifests WHERE workspace_id = ?")
    .bind(workspaceId)
    .first<ManifestRow>();
  if (!row) {
    return json({ error: "manifest_not_found" }, 404);
  }

  return json({
    workspaceId: row.workspace_id,
    version: row.version,
    hash: row.manifest_hash,
    updatedAt: row.updated_at,
    manifest: JSON.parse(row.manifest_json) as unknown,
  });
}

async function getManifestMarkdown(env: Env, auth: AuthContext, workspaceId: string): Promise<Response> {
  const workspace = await getWorkspaceRow(env, auth, workspaceId);
  if (!workspace) {
    return markdown("# Workspace not found\n", 404);
  }

  const row = await env.DB.prepare("SELECT * FROM workspace_manifests WHERE workspace_id = ?")
    .bind(workspaceId)
    .first<ManifestRow>();
  if (!row) {
    return markdown(`# ${workspace.name}\n\nNo manifest has been pushed yet.\n`, 404);
  }

  const manifest = JSON.parse(row.manifest_json) as ManifestDocument;
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const files = entries.filter((entry) => isManifestEntryKind(entry, "file"));
  const directories = entries.filter((entry) => isManifestEntryKind(entry, "directory"));
  const sampleFiles = files
    .slice(0, 40)
    .map((entry) => {
      const item = entry as { path?: string; size?: number; sha256?: string };
      return `- \`${item.path ?? "unknown"}\`${item.size ? ` (${item.size} bytes)` : ""}${item.sha256 ? ` sha256:${item.sha256}` : ""}`;
    })
    .join("\n");

  return markdown(`# ${workspace.name}\n\n- Workspace ID: ${workspace.id}\n- Root: \`${workspace.root_path}\`\n- Manifest version: ${row.version}\n- Manifest hash: ${row.manifest_hash}\n- Updated: ${row.updated_at}\n- Files: ${files.length}\n- Directories: ${directories.length}\n\n## Files\n\n${sampleFiles || "- No files in manifest"}\n`);
}

async function listSecrets(env: Env, auth: AuthContext, workspaceId: string): Promise<Response> {
  const workspace = await getWorkspaceRow(env, auth, workspaceId);
  if (!workspace) {
    return json({ error: "workspace_not_found" }, 404);
  }

  const rows = await env.DB.prepare(
    `SELECT id, workspace_id, name, key_id, format, metadata_json, created_at, updated_at
     FROM secrets
     WHERE workspace_id = ? AND deleted_at IS NULL
     ORDER BY name ASC`,
  )
    .bind(workspaceId)
    .all();

  return json({
    secrets: rows.results?.map((row) => ({
      ...row,
      metadata: parseStoredJson((row as { metadata_json?: string }).metadata_json),
    })),
  });
}

async function getSecret(env: Env, auth: AuthContext, workspaceId: string, name: string): Promise<Response> {
  const workspace = await getWorkspaceRow(env, auth, workspaceId);
  if (!workspace) {
    return json({ error: "workspace_not_found" }, 404);
  }

  const cleanName = cleanSecretName(name);
  if (!cleanName) {
    return json({ error: "invalid_secret_name" }, 400);
  }

  const row = await env.DB.prepare(
    `SELECT id, workspace_id, name, ciphertext, nonce, key_id, format, metadata_json, created_at, updated_at
     FROM secrets
     WHERE workspace_id = ? AND name = ? AND deleted_at IS NULL`,
  )
    .bind(workspaceId, cleanName)
    .first<Record<string, unknown> & { metadata_json?: string }>();

  if (!row) {
    return json({ error: "secret_not_found" }, 404);
  }

  return json({ secret: { ...row, metadata: parseStoredJson(row.metadata_json) } });
}

async function putSecret(
  request: Request,
  env: Env,
  auth: AuthContext,
  workspaceId: string,
  name: string,
): Promise<Response> {
  const workspace = await getWorkspaceRow(env, auth, workspaceId);
  if (!workspace) {
    return json({ error: "workspace_not_found" }, 404);
  }

  const cleanName = cleanSecretName(name);
  if (!cleanName) {
    return json({ error: "invalid_secret_name" }, 400);
  }

  const body = await parseJson<PutSecretRequest>(request);
  if (!body.ok) {
    return json({ error: body.error }, 400);
  }
  if (!body.value.ciphertext || !body.value.nonce || !body.value.keyId) {
    return json({ error: "encrypted_secret_required" }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const metadataJson = stableJson(body.value.metadata ?? {});
  await env.DB.prepare(
    `INSERT INTO secrets (id, account_id, workspace_id, name, ciphertext, nonce, key_id, format, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, name) DO UPDATE SET
       ciphertext = excluded.ciphertext,
       nonce = excluded.nonce,
       key_id = excluded.key_id,
       format = excluded.format,
       metadata_json = excluded.metadata_json,
       deleted_at = NULL,
       updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      workspace.account_id,
      workspaceId,
      cleanName,
      body.value.ciphertext,
      body.value.nonce,
      body.value.keyId,
      body.value.format ?? "age-v1",
      metadataJson,
      now,
      now,
    )
    .run();

  return json({ ok: true, workspaceId, name: cleanName, updatedAt: now });
}

async function deleteSecret(env: Env, auth: AuthContext, workspaceId: string, name: string): Promise<Response> {
  const workspace = await getWorkspaceRow(env, auth, workspaceId);
  if (!workspace) {
    return json({ error: "workspace_not_found" }, 404);
  }

  const cleanName = cleanSecretName(name);
  if (!cleanName) {
    return json({ error: "invalid_secret_name" }, 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE secrets SET deleted_at = ?, updated_at = ? WHERE workspace_id = ? AND name = ?",
  )
    .bind(now, now, workspaceId, cleanName)
    .run();
  return json({ ok: true, deletedAt: now });
}

async function putBlob(request: Request, env: Env, ctx: ExecutionContext, hash: string): Promise<Response> {
  if (!request.body) {
    return json({ error: "empty_body" }, 400);
  }

  await env.OBJECTS.put(`blobs/${hash}`, request.body, {
    httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" },
    customMetadata: { sha256: hash },
  });
  const size = Number(request.headers.get("content-length") ?? 0) || null;
  ctx.waitUntil(recordEvent(env, undefined, "blob.put", { hash, size }));
  return json({ hash, size, streamed: true });
}

async function getBlob(env: Env, hash: string): Promise<Response> {
  const object = await env.OBJECTS.get(`blobs/${hash}`);
  if (!object) {
    return json({ error: "blob_not_found" }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("x-pathstash-sha256", hash);
  return new Response(object.body, { headers });
}

async function authorize(
  request: Request,
  env: Env,
): Promise<{ ok: true; context: AuthContext } | { ok: false; status: number; error: string }> {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!token) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  if (env.RELAY_ADMIN_TOKEN && (await timingSafeTokenEquals(token, env.RELAY_ADMIN_TOKEN))) {
    return { ok: true, context: { kind: "admin" } };
  }

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT access_tokens.id AS token_id, accounts.id AS account_id, accounts.email AS email
     FROM access_tokens
     JOIN accounts ON accounts.id = access_tokens.account_id
     WHERE access_tokens.token_hash = ? AND access_tokens.revoked_at IS NULL`,
  )
    .bind(tokenHash)
    .first<{ token_id: string; account_id: string; email: string }>();

  if (!row) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  await env.DB.prepare("UPDATE access_tokens SET last_used_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), row.token_id)
    .run();

  return {
    ok: true,
    context: { kind: "account", accountId: row.account_id, email: row.email, tokenId: row.token_id },
  };
}

async function enqueue(env: Env, workspaceId: string | undefined, kind: string, payload: unknown): Promise<void> {
  const message: EventMessage = {
    id: crypto.randomUUID(),
    kind,
    payload,
    createdAt: new Date().toISOString(),
  };
  if (workspaceId) {
    message.workspaceId = workspaceId;
  }
  await env.EVENT_QUEUE.send(message);
}

async function recordEvent(
  env: Env,
  workspaceId: string | undefined,
  kind: string,
  payload: unknown,
): Promise<void> {
  const message: EventMessage = {
    id: crypto.randomUUID(),
    kind,
    payload,
    createdAt: new Date().toISOString(),
  };
  if (workspaceId) {
    message.workspaceId = workspaceId;
  }

  await env.DB.prepare(
    "INSERT OR IGNORE INTO events (id, workspace_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(
      message.id,
      message.workspaceId ?? null,
      message.kind,
      JSON.stringify(message.payload),
      message.createdAt,
    )
    .run();
  await env.EVENT_QUEUE.send(message);
}

async function getWorkspaceRow(env: Env, auth: AuthContext, workspaceId: string): Promise<WorkspaceRow | null> {
  if (auth.kind === "admin") {
    return env.DB.prepare("SELECT * FROM workspaces WHERE id = ?").bind(workspaceId).first<WorkspaceRow>();
  }

  return env.DB.prepare("SELECT * FROM workspaces WHERE id = ? AND account_id = ?")
    .bind(workspaceId, auth.accountId)
    .first<WorkspaceRow>();
}

async function canAccessWorkspace(env: Env, auth: AuthContext, workspaceId: string): Promise<boolean> {
  return (await getWorkspaceRow(env, auth, workspaceId)) !== null;
}

function withCors(request: Request, env: Env, response: Response): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin");
  const allowedOrigin = env.WEB_ORIGIN?.trim() || "*";
  headers.set("access-control-allow-origin", allowedOrigin === "*" ? "*" : origin === allowedOrigin ? origin : allowedOrigin);
  headers.set("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  headers.set(
    "access-control-allow-headers",
    "authorization,content-type,x-pathstash-device,x-pathstash-sha256",
  );
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 320) : null;
}

function cleanSecretName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const name = value.trim();
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(name) ? name : null;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return `ps_live_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

async function timingSafeTokenEquals(actual: string, expected: string): Promise<boolean> {
  const actualBytes = new TextEncoder().encode(actual);
  const expectedBytes = new TextEncoder().encode(expected);
  if (actualBytes.byteLength !== expectedBytes.byteLength) {
    return false;
  }
  return crypto.subtle.timingSafeEqual(actualBytes, expectedBytes);
}

function parseStoredJson(value: string | undefined): unknown {
  if (!value) {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function parseJson<T>(request: Request): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: (await request.json()) as T };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, 256) : fallback;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function markdown(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}

function llmsText(origin: string): string {
  return `# PathStash

PathStash is Dropbox for modern software developers. It keeps the layer around Git available across machines and agents: workspace roots, selected files, devices, encrypted secrets, manifests, and large file pointers.

## Core URLs

- Relay health: ${origin}/health
- Account summary markdown: ${origin}/v1/me.md
- Workspace manifest markdown: ${origin}/v1/workspaces/{workspaceId}/manifest.md
- JSON API docs: https://github.com/ifBars/pathstash/blob/main/docs/api.md
- Quickstart: https://github.com/ifBars/pathstash/blob/main/docs/quickstart.md
- Agent guide: https://github.com/ifBars/pathstash/blob/main/docs/agents.md

## Agent guidance

Use PathStash to understand a developer workspace before acting. Prefer markdown endpoints for context, JSON endpoints for exact state, and the MCP server when running inside an agent client. Never request or send plaintext secrets; secret values are encrypted locally before reaching the relay.
`;
}

function isManifestEntryKind(value: unknown, kind: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as { kind?: string }).kind === kind
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }
  return value;
}

async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
