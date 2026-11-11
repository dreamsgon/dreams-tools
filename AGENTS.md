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

## Safe updates to the deployed app

GitHub repository https://github.com/dreamsgon/dreams-tools is the source of truth. Production is https://dreams-tools-sable.vercel.app. Vercel automatically builds and deploys changes that reach `main`; pushing or merging into `main` affects the live app.

1. Start from the latest remote `main`. Check `git status` and the remote URL before editing; preserve uncommitted work. Fetch first and use a fast-forward update for a clean local main branch. Never reset someone else's work or treat an older ZIP as the current source.
2. Read this file, README.md, DEPLOY_VERCEL.md, TODO.md and docs/DEPLOYMENT_STATUS.md. Use a separate branch and checkout/worktree for each assistant or concurrent task. Codex, Claude, DeepSeek, Grok and T3Code must not edit the same working files concurrently.
3. Make only the requested changes. Preserve Supabase identity checks, S3 account isolation, saved-data compatibility and conditional saves. Keep explicit byte lengths on signed server-side S3 PUTs. Do not change production credentials, bucket/prefix, authentication or email settings as an incidental part of a feature update.
4. For runtime changes, use Node 22 and run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, then `npm run test:http`. Add focused regressions for behavior changes. For documentation-only changes, inspect the diff and links; application tests need not be rerun. Report failures and checks not run.
5. Update TODO.md and relevant documentation. Review the final diff for unrelated edits, secrets, generated files and private campaign data. Commit and push the task branch, then open a pull request with the problem, resulting behavior, checks and any migration or rollback considerations.
6. Default to a pull request for review; merge only when the user's instructions authorize that step and required checks pass. Do not infer merge permission solely from a request to implement a feature. If the user already authorized merging/deploying this change, complete it without asking again. Never force-push `main` or bypass required checks.
7. Before merging, account for changes already merged by other assistants. Resolve conflicts deliberately and rerun affected checks after resolution. Review any preview only after confirming that its environment is configured. Production variables are currently Production-only: do not copy production credentials into previews or point preview writes at production data to make a preview work.
8. After an authorized merge, wait for the matching Vercel deployment to report Ready. Verify the production site and the changed user flows; for persistence changes, check an authorized save and reload. A successful Git push or build alone is not proof of a working live feature. Report the commit/PR, production URL, verification results and remaining limits.
9. If the build fails, inspect logs and fix it through the same workflow. If a release breaks production, preserve user data and use a reviewed revert or an authorized Vercel rollback to a known-good deployment. Never delete S3 data or recreate accounts as a deployment repair.

### Data and release safety

App deployments replace code; saved maps, images and encyclopedia data remain in S3, and accounts remain in Supabase. This does not make schema changes automatically safe. Before a storage/schema migration, obtain current private backups, document compatibility and recovery, and verify the migration on isolated data. A code rollback does not undo a data migration. Do not retire old data until the owner has verified the result.

Do not commit `.env` files, credentials, account exports, campaign backups, `node_modules` or build output. Keep secrets in the appropriate service settings. A requested ZIP is a convenience snapshot: rebuild it from the reviewed source, exclude private/generated files, and identify its commit. Do not upload a stale ZIP over the repository.

### Reusable task prompt

> Update dreamsgon/dreams-tools. Read AGENTS.md first and start from the latest main branch. Work on a separate branch, preserve existing data and account isolation, run the required checks, update TODO.md, and open a pull request. Never commit credentials. Report what changed, how it was verified, and any deployment or migration steps still needed.

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
