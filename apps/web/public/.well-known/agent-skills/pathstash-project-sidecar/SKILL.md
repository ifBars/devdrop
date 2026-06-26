# PathStash Project Sidecar

Use this skill when helping a developer or coding agent decide what belongs in PathStash around a real Git repository, initialize a sidecar workspace, or restore project context on another machine.

## Product Boundary

PathStash is the developer workspace layer around Git. Git and GitHub stay authoritative for source code, tests, workflows, public docs, and app-consumed assets.

PathStash stores the context that should travel with a project but should not be committed to Git:

- encrypted environment-secret records and secret-name inventories
- internal plans, handoff notes, implementation context, and private docs
- concept art, branding references, QA captures, generated reports, and large-file pointers
- workspace manifests, device context, team sidecars, and agent-readable resume state

Do not use PathStash as a generic company file drive. Use it when the project context is repo-adjacent, developer-facing, and useful for resuming work across machines, teams, CI, or agents.

## Starting A Sidecar

1. Inspect the repository boundary first. Keep source files, tests, build config, and public docs in Git.
2. Create a sidecar folder next to or inside the repository:

```sh
npx pathstash sidecar init --root . --name "Project Name"
```

3. Review the generated `.pathstash-context` files and replace placeholders with concise project-specific context.
4. Confirm the sidecar is ignored by Git:

```sh
npx pathstash sidecar doctor --root .
```

5. For CI or stricter handoff checks, use:

```sh
npx pathstash sidecar doctor --root . --strict
```

## What To Store

Prefer durable, reusable context:

- `README.md`: project-sidecar purpose and source-of-truth boundary
- `project-context.md`: current product state, local setup notes, and handoff priorities
- `operations/secrets.md`: secret names, ownership, rotation notes, and where values are expected
- `artifacts/inventory.md`: generated concepts, QA captures, private reports, large artifacts, and links
- `brand/notes.md`: brand direction, visual references, and decisions that are useful to future implementation work

Avoid temporary logs, dependency caches, build outputs, source files, or generated artifacts that are already reproducible from Git.

## Secret Handling

Never paste plaintext secret values into markdown files, issues, prompts, or public docs. Use PathStash encrypted secret commands for values:

```sh
npx pathstash secrets set --root .pathstash-context NAME --value-stdin
npx pathstash secrets list --root .pathstash-context
```

Agents may inspect secret names and metadata, but plaintext secret values should remain local and only be decrypted when the user explicitly asks.

## Sync And Restore

After the sidecar is populated, push it as its own PathStash workspace:

```sh
npx pathstash push --root .pathstash-context
```

For team-owned context, pass the team id:

```sh
npx pathstash push --root .pathstash-context --team-id "<team-id>"
```

On another machine, clone the source repository from Git first, then hydrate or pull the PathStash sidecar context. Treat Git as the code source of truth and PathStash as the private project-context source of truth.

## Agent Rules

- Use `https://pathstash.ifbars.workers.dev/llms.txt` for current public endpoint context.
- Use `https://pathstash.ifbars.workers.dev/auth.md` before calling account-scoped endpoints.
- Prefer markdown endpoints for compact context and JSON endpoints for exact state.
- Keep the sidecar focused on information that helps a future developer or agent resume useful work.
- Do not move runtime assets out of Git unless the user explicitly changes the project boundary.
