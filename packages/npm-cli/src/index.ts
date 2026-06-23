#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const DEFAULT_RELAY = "https://pathstash-relay.ifbars.workers.dev";
const DEFAULT_MAX_BLOB_BYTES = 64 * 1024 * 1024;
const STATE_DIR = ".pathstash";
const IGNORE_FILE = ".pathstashignore";

type ManifestEntry = {
  path: string;
  kind: "file" | "directory";
  size?: number;
  sha256?: string;
};

type Manifest = {
  schemaVersion: number;
  name: string;
  rootPath: string;
  generatedAt: string;
  ignores: string[];
  entries: ManifestEntry[];
};

type Config = {
  name: string;
  rootPath: string;
  ignore: string[];
};

type State = {
  workspaceId: string;
  relay: string;
  lastManifestHash?: string;
  lastPushedAt?: string;
};

type Flags = Record<string, string | boolean>;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const [command, subcommand, ...rest] = process.argv.slice(2);
  const args = command === "auth" || command === "devices" ? rest : [subcommand, ...rest].filter(Boolean);
  const flags = parseFlags(args);

  switch (command) {
    case "signup":
      await signup(flags);
      break;
    case "login":
      await login(flags);
      break;
    case "auth":
      if (subcommand === "status") {
        await authStatus(flags);
        break;
      }
      usage();
      break;
    case "devices":
      if (subcommand === "list") {
        await devicesList(flags);
        break;
      }
      usage();
      break;
    case "init":
      init(flags);
      break;
    case "scan":
      console.log(JSON.stringify(await buildManifest(flagString(flags, "root") ?? "."), null, 2));
      break;
    case "push":
      await push(flags);
      break;
    case "help":
    case undefined:
      usage();
      break;
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

async function signup(flags: Flags) {
  const email = requireFlag(flags, "email");
  const relay = normalizeRelay(flagString(flags, "relay") ?? DEFAULT_RELAY);
  const response = await fetch(`${relay}/v1/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      name: flagString(flags, "name"),
      deviceLabel: flagString(flags, "device-label") ?? hostname(),
    }),
  });
  const body = await response.json() as { token?: { value: string }; account?: { email: string }; error?: string };
  if (!response.ok || !body.token) {
    throw new Error(`signup failed: ${body.error ?? response.statusText}`);
  }
  writeAuth(relay, body.token.value);
  console.log(`created account ${body.account?.email ?? email} and stored token for ${relay}`);
}

async function login(flags: Flags) {
  const relay = normalizeRelay(flagString(flags, "relay") ?? DEFAULT_RELAY);
  const token = requireFlag(flags, "token");
  await checkToken(relay, token);
  writeAuth(relay, token);
  console.log(`stored token for ${relay}`);
}

async function authStatus(flags: Flags) {
  const relay = normalizeRelay(flagString(flags, "relay") ?? DEFAULT_RELAY);
  const token = flagString(flags, "token") ?? readAuth(relay);
  console.log(`relay: ${relay}`);
  console.log(`stored token: ${token ? "present" : "missing"}`);
  if (token) {
    await checkToken(relay, token);
    console.log("remote check: ok");
  }
}

async function devicesList(flags: Flags) {
  const relay = normalizeRelay(flagString(flags, "relay") ?? DEFAULT_RELAY);
  const token = resolveToken(flags, relay);
  const response = await fetch(`${relay}/v1/devices`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.json() as { devices?: Array<{ id: string; label: string; last_seen_at?: string }>; error?: string };
  if (!response.ok) {
    throw new Error(`device list failed: ${body.error ?? response.statusText}`);
  }
  for (const device of body.devices ?? []) {
    console.log(`${device.id}\t${device.label}\t${device.last_seen_at ?? "unknown"}`);
  }
}

function init(flags: Flags) {
  const root = resolve(flagString(flags, "root") ?? ".");
  const stateDir = join(root, STATE_DIR);
  mkdirSync(stateDir, { recursive: true });
  const config: Config = {
    name: flagString(flags, "name") ?? (basename(root) || "code-root"),
    rootPath: root,
    ignore: defaultIgnores(),
  };
  writeJson(join(stateDir, "config.json"), config);
  if (!existsSync(join(root, IGNORE_FILE))) {
    writeFileSync(join(root, IGNORE_FILE), `${config.ignore.join("\n")}\n`);
  }
  console.log(`initialized ${stateDir}`);
}

async function push(flags: Flags) {
  const root = resolve(flagString(flags, "root") ?? ".");
  const relay = normalizeRelay(flagString(flags, "relay") ?? readState(root)?.relay ?? DEFAULT_RELAY);
  const token = resolveToken(flags, relay);
  const config = readConfig(root) ?? createDefaultConfig(root);
  let state = readState(root);

  if (!state) {
    const response = await fetch(`${relay}/v1/workspaces`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: config.name,
        rootPath: config.rootPath,
        device: { label: hostname() },
      }),
    });
    const body = await response.json() as { id?: string; error?: string };
    if (!response.ok || !body.id) {
      throw new Error(`workspace create failed: ${body.error ?? response.statusText}`);
    }
    state = { workspaceId: body.id, relay };
    writeJson(join(root, STATE_DIR, "state.json"), state);
  }

  const manifest = await buildManifest(root);
  const maxBlobBytes = Number(flagString(flags, "max-blob-bytes") ?? DEFAULT_MAX_BLOB_BYTES);
  let uploaded = 0;
  let skipped = 0;

  for (const entry of manifest.entries) {
    if (entry.kind !== "file" || !entry.sha256 || !entry.size || entry.size > maxBlobBytes) {
      if (entry.kind === "file") skipped += 1;
      continue;
    }
    const path = join(root, entry.path.split("/").join(sep));
    const response = await fetch(`${relay}/v1/blobs/${entry.sha256}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/octet-stream",
        "content-length": String(entry.size),
      },
      body: createReadStream(path) as unknown as BodyInit,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`blob upload failed for ${entry.path}: ${response.status} ${text}`);
    }
    uploaded += 1;
  }

  const response = await fetch(`${relay}/v1/workspaces/${state.workspaceId}/manifest`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(manifest),
  });
  const body = await response.json() as { hash?: string; error?: string };
  if (!response.ok || !body.hash) {
    throw new Error(`manifest push failed: ${body.error ?? response.statusText}`);
  }

  writeJson(join(root, STATE_DIR, "state.json"), {
    ...state,
    lastManifestHash: body.hash,
    lastPushedAt: new Date().toISOString(),
  } satisfies State);
  console.log(`pushed ${body.hash} for workspace ${state.workspaceId} (${uploaded} blobs uploaded, ${skipped} skipped)`);
}

async function buildManifest(rootInput: string): Promise<Manifest> {
  const root = resolve(rootInput);
  const config = readConfig(root) ?? createDefaultConfig(root);
  const entries: ManifestEntry[] = [];
  await walk(root, root, config.ignore, entries);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return {
    schemaVersion: 1,
    name: config.name,
    rootPath: root,
    generatedAt: new Date().toISOString(),
    ignores: config.ignore,
    entries,
  };
}

async function walk(root: string, dir: string, ignores: string[], entries: ManifestEntry[]) {
  for (const dirent of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, dirent.name);
    const rel = relative(root, path).split(sep).join("/");
    if (shouldSkip(rel, ignores)) continue;

    if (dirent.isDirectory()) {
      entries.push({ path: rel, kind: "directory" });
      await walk(root, path, ignores, entries);
      continue;
    }

    if (dirent.isFile()) {
      const stat = statSync(path);
      entries.push({ path: rel, kind: "file", size: stat.size, sha256: hashFile(path) });
    }
  }
}

function hashFile(path: string) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

async function checkToken(relay: string, token: string) {
  const response = await fetch(`${relay}/v1/auth/check`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`token check failed: ${response.status} ${await response.text()}`);
  }
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) continue;
    const name = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[name] = true;
    } else {
      flags[name] = next;
      index += 1;
    }
  }
  return flags;
}

function resolveToken(flags: Flags, relay: string) {
  return flagString(flags, "token") ?? process.env.PATHSTASH_TOKEN ?? readAuth(relay) ?? fail("no token found; run pathstash signup or pathstash login --token <token>");
}

function readConfig(root: string): Config | null {
  return readJson(join(root, STATE_DIR, "config.json"));
}

function readState(root: string): State | null {
  return readJson(join(root, STATE_DIR, "state.json"));
}

function createDefaultConfig(root: string): Config {
  init({ root });
  const config = readConfig(root);
  if (!config) throw new Error("failed to create config");
  return config;
}

function readAuth(relay: string): string | null {
  const auth = readJson<Record<string, string>>(authPath()) ?? {};
  return auth[normalizeRelay(relay)] ?? null;
}

function writeAuth(relay: string, token: string) {
  const auth = readJson<Record<string, string>>(authPath()) ?? {};
  auth[normalizeRelay(relay)] = token.trim();
  mkdirSync(dirname(authPath()), { recursive: true });
  writeJson(authPath(), auth);
}

function authPath() {
  return join(homedir(), STATE_DIR, "auth.json");
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function defaultIgnores() {
  return [".git/", ".pathstash/", "node_modules/", "target/", "dist/", ".next/", ".wrangler/", "internal/"];
}

function shouldSkip(relativePath: string, ignores: string[]) {
  return ignores.some((pattern) => {
    const clean = pattern.trim().replace(/\/$/, "");
    return clean.length > 0 && (relativePath === clean || relativePath.startsWith(`${clean}/`));
  });
}

function flagString(flags: Flags, name: string) {
  const value = flags[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireFlag(flags: Flags, name: string) {
  return flagString(flags, name) ?? fail(`missing --${name}`);
}

function fail(message: string): never {
  throw new Error(message);
}

function normalizeRelay(relay: string) {
  return relay.trim().replace(/\/+$/, "");
}

function usage() {
  console.log(`PathStash

Usage:
  pathstash signup --email you@example.com [--name "Your Name"]
  pathstash login --token ps_live_...
  pathstash auth status
  pathstash init --root .
  pathstash scan --root .
  pathstash push --root .
  pathstash devices list
`);
}
