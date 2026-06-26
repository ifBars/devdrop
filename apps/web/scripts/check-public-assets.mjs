import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const webRoot = join(root, "..");
const publicRoot = join(webRoot, "public");
const workerSource = readFileSync(join(webRoot, "src", "worker.ts"), "utf8");

const requiredFiles = [
  "auth.md",
  "favicon.svg",
  "llms.txt",
  "openapi.json",
  "robots.txt",
  "sitemap.xml",
  ".well-known/auth.md",
  ".well-known/agent-skills/index.json",
  ".well-known/agent-skills/pathstash-quickstart/SKILL.md",
  ".well-known/agent-skills/pathstash-project-sidecar/SKILL.md",
  ".well-known/skills/index.json",
];

for (const file of requiredFiles) {
  assert(existsSync(join(publicRoot, file)), `missing public asset: ${file}`);
}

const openapi = JSON.parse(readFileSync(join(publicRoot, "openapi.json"), "utf8"));
for (const path of [
  "/health",
  "/v1/auth/signup",
  "/v1/auth/login",
  "/v1/me",
  "/v1/me.md",
  "/v1/me/export.json",
  "/v1/workspaces",
  "/v1/workspaces/{workspaceId}/manifest",
  "/v1/workspaces/{workspaceId}/files",
  "/v1/workspaces/{workspaceId}/secrets",
  "/v1/billing/checkout",
  "/v1/billing/portal",
]) {
  assert(openapi.paths?.[path], `openapi missing path: ${path}`);
}
for (const schema of ["AccountEnvelope", "AccountExport", "PlanEntitlements", "AccountUsage", "TeamSummary", "AuditEvent"]) {
  assert(openapi.components?.schemas?.[schema], `openapi missing schema: ${schema}`);
}
assert(
  openapi.components?.schemas?.ConfigurationStatus?.properties?.setupActions,
  "openapi ConfigurationStatus missing setupActions",
);

const llms = readFileSync(join(publicRoot, "llms.txt"), "utf8");
for (const text of [
  "https://pathstash.ifbars.workers.dev/.well-known/mcp-server",
  "https://pathstash.ifbars.workers.dev/.well-known/mcp/server-card.json",
  "https://pathstash.ifbars.workers.dev/.well-known/agent-skills/pathstash-project-sidecar/SKILL.md",
  "https://pathstash.ifbars.workers.dev/.well-known/webmcp.json",
  "https://pathstash.ifbars.workers.dev/.well-known/oauth-protected-resource",
  "https://pathstash-relay.ifbars.workers.dev/v1/me/export.json",
  "no plaintext secrets or token values",
]) {
  assert(llms.includes(text), `llms.txt missing: ${text}`);
}

const robots = readFileSync(join(publicRoot, "robots.txt"), "utf8");
for (const text of ["User-agent: GPTBot", "User-agent: ClaudeBot", "Content-Signal: search=yes, ai-input=yes, ai-train=no", "Sitemap:"]) {
  assert(robots.includes(text), `robots.txt missing: ${text}`);
}

const sitemap = readFileSync(join(publicRoot, "sitemap.xml"), "utf8");
for (const text of [
  "/signup",
  "/login",
  "/llms.txt",
  "/auth.md",
  "/openapi.json",
  "/.well-known/agent-skills/index.json",
  "/.well-known/agent-skills/pathstash-project-sidecar/SKILL.md",
  "/.well-known/skills/index.json",
]) {
  assert(sitemap.includes(text), `sitemap missing: ${text}`);
}
assert(!sitemap.includes("/dashboard"), "sitemap must not list session-gated dashboard routes");

const agentSkills = readFileSync(join(publicRoot, ".well-known", "agent-skills", "index.json"), "utf8");
for (const text of [
  "pathstash-quickstart",
  "pathstash-project-sidecar",
  "sha256:2c88fad2dc3e588ede0c9fbd0002d451e744c043dc79e99ae483106c36bfd9bd",
]) {
  assert(agentSkills.includes(text), `agent skills index missing: ${text}`);
  const skillsAlias = readFileSync(join(publicRoot, ".well-known", "skills", "index.json"), "utf8");
  assert(skillsAlias.includes(text), `skills alias index missing: ${text}`);
}

for (const text of [
  'url.pathname === "/.well-known/mcp/server-card.json"',
  'url.pathname === "/.well-known/mcp.json"',
  'url.pathname === "/.well-known/mcp-server"',
  'url.pathname === "/.well-known/mcp-server.json"',
  'url.pathname === "/.well-known/mcp/servers.json"',
  'url.pathname === "/.well-known/agent-card.json"',
  'url.pathname === "/.well-known/webmcp" || url.pathname === "/.well-known/webmcp.json"',
  'url.pathname === "/.well-known/ai-plugin.json"',
  'url.pathname === "/.well-known/api-catalog"',
  'url.pathname === "/.well-known/oauth-protected-resource"',
  'rel="api-catalog"',
  'rel="webmcp"',
  "</.well-known/skills/index.json>",
  "oauthProtectedResource",
  "mcpServerCard",
  "a2aAgentCard",
  "apiCatalog",
  "pathstash_account_export",
]) {
  assert(workerSource.includes(text), `worker discovery surface missing: ${text}`);
}

console.log("public asset checks passed");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
