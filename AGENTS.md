# Shared instructions for coding assistants

Applies to Codex, Claude, T3Code, DeepSeek, Grok, and any other assistant working in this repository. Read this file explicitly if your client does not auto-load AGENTS.md. CLAUDE.md points here; this file is the canonical instruction set.

## Scope

Work on RPG Tools: Maptable and the RPG Encyclopedia. Keep map features and the imported worlds/campaigns/lore, characters-as-articles, calendars, weather/travel, player sharing, backups and scoped MCP tools. Do not reintroduce unrelated character-sheet applications, rulebook libraries, or study tools. The encyclopedia character directory/stat-form builder is in scope.

## Workflow

1. Read README.md, DEPLOY_VERCEL.md, TODO.md, and docs/ARCHITECTURE.md. Check git status and preserve other contributors' changes.
2. Select one requested task. Use a separate branch/checkout for each concurrent assistant; do not let multiple clients modify the same working files. Use your client's normal branch convention, e.g. codex/map-fix, claude/map-fix, or deepseek/map-fix.
3. Make a focused change and add/update meaningful regression tests when behavior changes. Preserve save compatibility; migrations must retain existing scenes/assets.
4. Run npm run typecheck, relevant tests (npm test for the full included suite), and npm run build plus npm run test:http for runtime changes. Report failures and unrun checks accurately.
5. Update TODO.md with what changed and remaining work. Hand off the branch/commit, files changed, verification, and blockers. Do not mark browser or live-service checks complete based only on unit tests.

## Invariants

- Preserve Supabase-verified identity and per-user S3 storage boundaries. There is no mock/header-based sign-in. Never reintroduce one.
- Preserve S3 If-Match/If-None-Match revision protection and backups; never silently overwrite a newer workspace.
- Preserve signed transfers for large payloads, account/purpose isolation, and the 3 MB inline threshold. Never forward cookies or campaign bearer tokens to S3.
- Use MAPTABLE_AWS_* server settings; never put AWS secrets in NEXT_PUBLIC variables.
- Player exports must omit hidden tokens/editor UI and keep concealed areas opaque.
- Keep touch, desktop, square grids, both hex orientations, movement measurement, and undo/redo working.
- Agent reads/writes must stay campaign-scoped, respect read/edit permissions, and validate revisions. Encyclopedia MCP keys are read-only and separate from Maptable agent keys.
- Encyclopedia player shares must filter GM content on the server, including masked map images, private tabs, other campaigns and calendar/weather visibility. Never return the original image when fog requires a masked image.
- Keep both tool styles in their route-group layouts; do not merge their global CSS. Use full-page anchor navigation between tools.
- Do not commit secrets, MCP keys, webhooks, account data, .env files, .dev.vars, runtime storage, node_modules, build output, or campaign backups.
- Retain third-party license notices. Do not copy rulebook content into the project.

## Publishing

Follow GITHUB_SETUP.md when the user asks to put the project on GitHub. GitHub publication is separate from deploying the app. Use an explicitly selected repository and visibility; do not overwrite an existing repository or force-push. This preparation request alone does not authorize a deployment or connecting live accounts. Continue normal local development without repeatedly asking permission for routine reversible edits.

## Provider independence

No OpenAI, Anthropic, DeepSeek, or xAI API key is needed to edit this code. T3Code is a coding client; load this folder in it and provide these same instructions. Do not add model SDKs merely to let an assistant contribute. Client-specific configuration must point back to this document rather than duplicate rules.
