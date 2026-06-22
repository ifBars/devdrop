import { DurableObject } from "cloudflare:workers";

type Env = {
  DB: D1Database;
  OBJECTS: R2Bucket;
  EVENT_QUEUE: Queue<EventMessage>;
  WORKSPACE_SESSIONS: DurableObjectNamespace<WorkspaceSession>;
  DEV_AUTH_TOKEN?: string;
  ENVIRONMENT: string;
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
      return await route(request, env, ctx);
    } catch (error) {
      console.error(JSON.stringify({ level: "error", message: "unhandled", error: String(error) }));
      return json({ error: "internal_error" }, 500);
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
      service: "devdrop-relay",
      environment: env.ENVIRONMENT,
      database: db?.ok === 1 ? "ok" : "unknown",
      at: new Date().toISOString(),
    });
  }

  const auth = await authorize(request, env);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/v1/auth/check") {
    return json({ ok: true, authenticated: true });
  }

  if (request.method === "POST" && url.pathname === "/v1/workspaces") {
    return createWorkspace(request, env, ctx);
  }

  if (segments[0] === "v1" && segments[1] === "workspaces" && segments[2]) {
    const workspaceId = segments[2];

    if (request.method === "GET" && segments.length === 3) {
      return getWorkspace(env, workspaceId);
    }

    if (segments[3] === "manifest") {
      if (request.method === "PUT") {
        return putManifest(request, env, ctx, workspaceId);
      }
      if (request.method === "GET") {
        return getManifest(env, workspaceId);
      }
    }

    if (segments[3] === "connect" && request.method === "GET") {
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

async function createWorkspace(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await parseJson<CreateWorkspaceRequest>(request);
  if (!body.ok) {
    return json({ error: body.error }, 400);
  }

  const name = cleanText(body.value.name, "Default Workspace");
  const rootPath = cleanText(body.value.rootPath, "~/Code");
  const workspaceId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO workspaces (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(workspaceId, name, rootPath, now, now)
    .run();

  if (body.value.device) {
    await env.DB.prepare(
      "INSERT INTO devices (id, workspace_id, label, public_key, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(
        cleanText(body.value.device.id, crypto.randomUUID()),
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

async function getWorkspace(env: Env, workspaceId: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM workspaces WHERE id = ?")
    .bind(workspaceId)
    .first<WorkspaceRow>();
  if (!row) {
    return json({ error: "workspace_not_found" }, 404);
  }

  return json({
    id: row.id,
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
  workspaceId: string,
): Promise<Response> {
  const body = await parseJson<ManifestDocument>(request);
  if (!body.ok) {
    return json({ error: body.error }, 400);
  }

  const workspace = await env.DB.prepare("SELECT id FROM workspaces WHERE id = ?")
    .bind(workspaceId)
    .first<{ id: string }>();
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

async function getManifest(env: Env, workspaceId: string): Promise<Response> {
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

async function putBlob(request: Request, env: Env, ctx: ExecutionContext, hash: string): Promise<Response> {
  const bytes = await request.arrayBuffer();
  const actual = await sha256Hex(bytes);
  if (actual !== hash) {
    return json({ error: "hash_mismatch", expected: hash, actual }, 400);
  }

  await env.OBJECTS.put(`blobs/${hash}`, bytes, {
    httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" },
    customMetadata: { sha256: hash },
  });
  ctx.waitUntil(recordEvent(env, undefined, "blob.put", { hash, size: bytes.byteLength }));
  return json({ hash, size: bytes.byteLength });
}

async function getBlob(env: Env, hash: string): Promise<Response> {
  const object = await env.OBJECTS.get(`blobs/${hash}`);
  if (!object) {
    return json({ error: "blob_not_found" }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("x-devdrop-sha256", hash);
  return new Response(object.body, { headers });
}

async function authorize(request: Request, env: Env): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!env.DEV_AUTH_TOKEN) {
    return { ok: false, status: 503, error: "auth_not_configured" };
  }

  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const expected = new TextEncoder().encode(env.DEV_AUTH_TOKEN);
  const actual = new TextEncoder().encode(token);

  if (actual.byteLength !== expected.byteLength) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const matches = await crypto.subtle.timingSafeEqual(actual, expected);
  return matches ? { ok: true } : { ok: false, status: 401, error: "unauthorized" };
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
