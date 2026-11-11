# RPG Tools

A tabletop map and encyclopedia workspace, ready to deploy as a **Next.js application on Vercel**. Use this folder as your GitHub repository root.

Includes map creation, square/hex grids, tokens and libraries, campaign folders/roster, conditions, auras, manual fog, movement/measurement, initiative/dice, player exports, JSON backups, Discord sharing, S3 images, and campaign-scoped MCP tools. Also includes RPG Encyclopedia: worlds, campaigns, nested articles, wiki links, character articles, calendars, weather, travel, map atlases and player sharing. Standalone character-sheet applications and rulebook libraries are excluded. See [the encyclopedia guide](docs/ENCYCLOPEDIA.md).

## Deploy

Production is live at **https://dreams-tools-sable.vercel.app**. See [deployment status](docs/DEPLOYMENT_STATUS.md) for configured services and remaining checks. Follow **[DEPLOY_VERCEL.md](DEPLOY_VERCEL.md)** for setup instructions. Credentials are stored privately in Vercel and are not included in this repository or ZIP.

Multiple email/password accounts are supported. Each account has separate map and encyclopedia workspaces, uploads, settings, and agent grants. Shared campaigns and real-time multiplayer are not implemented. Signup/confirmation/reset email for ordinary users requires Supabase custom SMTP.

## Run locally

Use Node.js 22.13+ within Node 22.x. Copy `.env.example` to `.env.local`, configure your own Supabase and S3 development resources, then run:

```sh
npm ci
npm run dev
```

Open http://localhost:5173. Use email registration/login. There is no local authentication bypass or ChatGPT-header login. Local development uses the configured remote S3 bucket; use a dedicated development prefix or bucket.

```sh
npm run typecheck
npm test
npm run build
npm run test:http
npm start
```

`test:http` starts and stops its own production server on an available local port after a build. It checks unauthenticated boundaries without live cloud writes. All commands run from this folder.

## Updating the live app

Follow the [safe update workflow in AGENTS.md](AGENTS.md#safe-updates-to-the-deployed-app). Start from current GitHub main, use a separate branch and pull request, run the required checks, and verify the Vercel deployment after an authorized merge. All assistants share this workflow; old ZIPs are not the source of truth.

## Files for contributors

- [AGENTS.md](AGENTS.md): shared rules for Codex, Claude, T3Code, DeepSeek, and Grok.
- [GITHUB_SETUP.md](GITHUB_SETUP.md): uploading the source and a reusable LLM prompt.
- [TODO.md](TODO.md): completed port work, deployment checks, and future features.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): code layout, storage, and authentication.
- [docs/VALIDATION.md](docs/VALIDATION.md): actual verification and remaining limitations.
- [docs/UX_HANDOFF.md](docs/UX_HANDOFF.md): usability findings and the ordered list of fixes.

The encyclopedia has its own read-only MCP connection, documented in [docs/ENCYCLOPEDIA.md](docs/ENCYCLOPEDIA.md). The optional map stdio MCP server is `scripts/maptable-mcp.mjs`. Supply `MAPTABLE_URL` and `MAPTABLE_AGENT_KEY` privately; generate a campaign key in Connections. No model-provider API key is needed to contribute code.

## Data and hosting

Vercel hosts the app; Supabase verifies identities; S3 stores private workspace JSON, images, and settings. Workspaces retain revision/ETag conflict checks. Large uploads and responses use short-lived S3 transfers to avoid Vercel's function payload limit. Final workspace commits are still validated server-side. Configure the temporary-transfer lifecycle rule in the deployment guide.

To migrate existing maps, export a JSON backup with embedded images from the old app while you can access them, then restore it after signing into the new app. Accounts are not merged by email, and raw Sites/R2 data is not migrated automatically. Never commit your campaign backups.

No project-wide license has been selected. Third-party notices remain in `vendor/`; the owner should select licensing before offering reuse rights.

