# RPG Tools to-do list

Updated 2026-11-11. Keep work scoped to Maptable and RPG Encyclopedia. Work on one feature at a time; deployment and live-service work happen only when requested.

## Completed source preparation

- [x] Extract map tools without character sheets, rulebooks, original Git history, secrets or campaign data.
- [x] Add common instructions for Codex, Claude, T3Code, DeepSeek and Grok, plus CLAUDE.md.
- [x] Replace Sites/Vinext/Workers with standard Next.js scripts/configuration for Vercel.
- [x] Use verified Supabase email accounts; remove trusted-header/mock ChatGPT authentication.
- [x] Add private S3 persistence with atomic conditional workspace commits and per-account isolation.
- [x] Preserve the optional S3 image connection; scope it by account and add the S3 console link.
- [x] Stage large images, Discord renders and workspace payloads directly through S3 to avoid function payload limits.
- [x] Adapt MCP and browser clients for large signed downloads without forwarding credentials.
- [x] Add storage/transfer regression tests and a production HTTP smoke check.
- [x] Pass 319 tests, TypeScript checking, Next.js production build and local production HTTP smoke test.
- [x] Add GitHub Actions for install, typecheck, tests, build and HTTP smoke checks.
- [x] Update GitHub/Vercel instructions, environment example, IAM/CORS/lifecycle templates and architecture notes.

- [x] Import RPG Encyclopedia from TTRPG World Manager, with a shared RPG Tools home and separate module styles.
- [x] Port encyclopedia saves/images/player links to private S3 and verified Supabase accounts.
- [x] Add campaign-scoped, read-only encyclopedia MCP keys and revocation.
- [x] Test encyclopedia account isolation, concurrent saves, player filtering and fog-image access.

## Owner setup and deployment

- [x] Publish application source at the root of the owner's public `dreamsgon/dreams-tools` repository on `main`.
- [ ] Select a project license.
- [ ] Create/configure Supabase Auth, email confirmation, custom SMTP and allowed callback URLs.
- [ ] Create the private S3 bucket and dedicated IAM identity; apply CORS and temporary-transfer lifecycle configuration.
- [ ] Set required Vercel variables from .env.example; use separate data prefixes for development/preview.
- [ ] Deploy through Vercel and complete the checks in DEPLOY_VERCEL.md.
- [ ] Verify two real accounts cannot read each other's workspaces, images, settings, transfers or campaign grants.
- [ ] Verify real signup/login/logout/reset/Remember me with email delivery.
- [ ] Verify real S3 signing, CORS, 20 MiB image boundary, large workspace transfers, save conflicts and reload persistence.
- [ ] Test optional additional S3 imports and authorized Discord image/initiative sharing.
- [ ] Verify campaign agent read/edit restrictions, revocation and hosted MCP connectivity.
- [ ] Restore embedded-image backups from the original app; compare scenes/assets before retiring old storage.

## Encyclopedia acceptance and migration

- [ ] Export worlds/campaign JSON and each uploaded map package from the original GPT Site; import and compare on the new deployment.
- [ ] Verify two real accounts have separate encyclopedia data and image access.
- [ ] Desktop/phone acceptance: articles, wiki links, search, custom tabs, calendars, weather, travel, atlas and fog.
- [ ] Test public player links, hidden GM content, key replacement/revocation, and fresh fog previews. Previously issued image URLs expire within five minutes.
- [ ] Verify hosted encyclopedia MCP access and wrong-campaign rejection with a real campaign key.
- [ ] Review the 2 MB encyclopedia workspace limit and plan larger storage if needed.

## Map acceptance and maintenance

- [ ] Desktop and phone acceptance: map uploads/crop, grid alignment, map maker rooms/curves/freehand/merging/openings, multiselection, layers, undo/redo.
- [ ] Libraries/folders/campaign transfers, token names/HP/conditions/borders, auras/AoEs, movement, initiative and dice.
- [ ] Player previews/exports conceal hidden tokens and use opaque fog.
- [ ] Large-library performance and storage costs; design safe collection of unreferenced immutable segments without breaking recovery.
- [ ] Review the remaining starter dependencies/styles and trim unused ones with visual regression checks.

## Optional future work

- [ ] Shared campaigns and live multiplayer.
- [ ] Automatic wall-based vision.
- [ ] Offline mode.
- [ ] Additional hosting/storage adapters beyond the current Vercel + Supabase Auth + Amazon S3 setup.

See docs/VALIDATION.md for exact completed checks and limits. Live-service checks above stay unchecked until actually exercised with the owner's configuration.
