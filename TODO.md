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
- [x] Fix Node S3 PUT framing with explicit UTF-8/binary Content-Length; add a real local HTTP transport regression (320 tests pass).
- [x] Pass 319 tests, TypeScript checking, Next.js production build and local production HTTP smoke test.
- [x] Add GitHub Actions for install, typecheck, tests, build and HTTP smoke checks.
- [x] Update GitHub/Vercel instructions, environment example, IAM/CORS/lifecycle templates and architecture notes.

- [x] Import RPG Encyclopedia from TTRPG World Manager, with a shared RPG Tools home and separate module styles.
- [x] Port encyclopedia saves/images/player links to private S3 and verified Supabase accounts.
- [x] Add campaign-scoped, read-only encyclopedia MCP keys and revocation.
- [x] Test encyclopedia account isolation, concurrent saves, player filtering and fog-image access.

- [x] Document the shared GitHub branch/PR, validation, Vercel deployment, data protection and rollback workflow in AGENTS.md.

## Owner setup and deployment

- [x] Publish application source at the root of the owner's public `dreamsgon/dreams-tools` repository on `main`.
- [ ] Select a project license.
- [x] Configure Supabase email Auth, email confirmation and production callback URLs; preserve original Site callbacks.
- [ ] Configure custom SMTP and verify email delivery for ordinary users.
- [x] Create the private S3 bucket and dedicated IAM identity; apply production CORS and one-day temporary-transfer lifecycle configuration.
- [x] Save all seven required variables in Vercel Production only, using sensitive storage.
- [ ] Configure separate resources/prefixes if Development or Preview environments are needed.
- [x] Deploy through Vercel; confirm Ready status, live home and Maptable sign-in redirect at https://dreams-tools-sable.vercel.app.
- [x] Verify the owner's password recovery email and successful sign-in.
- [x] Verify authenticated Maptable and encyclopedia saves persist after full-page reload; deploy the S3 PUT framing fix.
- [ ] Finish image-upload testing (automation was blocked by extension file access before upload).
- [ ] Complete authenticated live acceptance checks below; deployment alone does not prove them.
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

## Usability pass (docs/UX_HANDOFF.md)

- [x] Walk through both tools locally at desktop and phone sizes; record prioritized fixes in docs/UX_HANDOFF.md.
- [ ] Item 3.3 (shared campaigns between the two tools) waits for the owner's decision.
- [x] Part 1, visible bugs (handoff 1.1, 1.2, 1.3, 1.7): dice tray characters fixed, Maptable header and in-dialog links styled, signed-in account page shows a summary instead of the sign-in form, "1 token" pluralization, "Move scene to" wording, Map Creator Width/Height labels, labelled the blank-scene and remove-scene buttons.
- [ ] 1.7 leftover: the handoff saw one unlabelled button inside "Initiative order & settings"; a source scan found none, so recheck in a browser with initiative entries.
- [x] Part 2, dice placement (handoff 1.4): the tray mounts on the Maptable board only, Dice and Roll log are tool bar buttons on desktop and Tools sheet buttons on phones, the tray opens above the tool bar, and the tray, dialogs, notices and drag ghost use the `--z-*` scale in globals.css. Remaining raw z-index values are local to their components.
- [x] Part 3, everything fits (handoff 1.5, 1.6): home/account header wraps on phones (no sideways scroll), the left rail scrolls and compacts on short screens, side-panel button rows wrap, and side panels use one 13px size for labels, checkboxes, helper text and fold-outs.
- [x] Part 4, Campaigns dashboard (handoff 2.2 plus navigation): continue card replaces "Return to <campaign>", campaigns show as cards with scene counts and a "Last opened" mark, New campaign is the primary action, search/folder path/expand-collapse only appear when needed, Undo/Redo moved to header icons, "Unfiled scenes" became a "Maps not in a campaign" card, and the board header has a Campaigns breadcrumb (compact back button at 1000px and below). The rail "Dashboard" is now "Campaigns".
- [x] Polish part 1, tokens and Appearance (handoff 3.2): one theme setting (Light, Dark, System) shared by every page, six accent colours, Inter and Schibsted Grotesk, a light header and rail, and soft fills instead of accent bars. Choices are per device in `rpg-tools:*` localStorage keys; the old `maptable-theme`/`ttrpg-color-theme` values are read once.
- [x] Polish part 2: shared tokens live in `app/appearance.css` (html:root) for both tools, and the Encyclopedia maps its old `--night-*`/light-dark colours onto them. The Appearance menu adds interface, title and reading fonts (Google Fonts, loaded only when chosen), reduce motion and Reset. The home page shows both tools with previews; the dice tray, roll log, roll pop-ups and dialogs use tokens; 3D dice use the accent. `tests/appearance.test.mjs` covers accents, contrast, fonts and the boot script.
- [x] Layout part 3: corner radii come from `--radius-sm/--radius/--radius-lg` (2/4/6px), card shadows are gone (`--shadow-sm: none`), and sections are split by hairline rules. One shared header (`components/tool-switch.tsx`: RPG Tools wordmark, Maptable/Encyclopedia tabs, account link) replaces Maptable's brand and the Encyclopedia's separate bar and sidebar brand; on phones the Encyclopedia shows it in the navigation drawer. Campaigns is a ruled table, the board rail is icon-only on desktop, and the home page uses two ruled columns.
- [x] Encyclopedia part 1: campaign, template and starter cards are ruled rows; recent notes are ruled columns; primary buttons and toasts use `--on-accent` so dark theme text stays readable; the unused `--night-*` tokens are removed. Map terrain and calendar sky colours stay fixed on purpose (they are artwork, not interface).
- [x] Encyclopedia features part 1: GM secrets — lines between `::: secret` and `:::` inside any article or tab are GM-only; `playerCampaign` strips them on the server (an unclosed block hides everything after it), the reader marks them, and Write mode has a GM secret button. Saved data, backups and read-only MCP keep the full text. Tests in `tests/encyclopedia/secrets.test.ts`.
- [x] Encyclopedia features part 1: quick search — Ctrl/Cmd+K opens a palette over the current campaign and world lore to jump to an entry, create one with the typed name, or go to Dashboard, Characters, Maps, Calendar or Maptable.
- [x] Encyclopedia features part 2: Maptable links — `[[maptable:<sceneId>|Label]]` renders an Open in Maptable card; Write mode and the article margin have a scene picker (`GET /api/encyclopedia/maptable-scenes`, read-only); `/maptable?scene=<id>` opens that scene once; players only get the label (`playerText`).
- [x] Encyclopedia features part 2: tokens from the Encyclopedia — Maptable's Token gallery has a From the Encyclopedia tab that reads characters (read-only) and adds a library token plus a placed copy in Maptable's own data, reusing a same-named token in the campaign.
- [x] Encyclopedia features part 2: page history — `users/<owner>/encyclopedia/history/<entryId>.json` keeps the text an entry had before a save (at most one version per 10 minutes, newest 20, 4 MB cap); deleting an entry deletes its history; a restore first keeps the current text (`POST /api/encyclopedia/history`). workspace.json is unchanged. Tests in `tests/encyclopedia-history.test.mjs`.
- [x] Rolls part A: `[[1d20+5]]` / `[[1d20+5|Label]]` roll anywhere in an article or tab (same syntax as Maptable token notes; a formula needs a die so `[[1999]]` stays a link); results show in a card with the last few totals. `{{word|note}}` adds a hover note; links to other entries preview on hover. Players get rolls and notes as plain text and never the note (`playerInline`). Tests in `tests/encyclopedia-inline.test.mjs`.
- [x] Rolls part B: a GM-only Statblock tab on characters takes any pasted statblock as-is and finds dice, "+5 to hit", ability and skill modifiers (switch off per statblock; `[[...]]` always works). Stat form fields can roll when clicked (1d20 + value, the value as a formula, or a custom formula with `{value}`). Rolls can go to Discord through a Maptable campaign's webhook (Connections, then a channel route; "Always" is remembered per browser). Statblocks, roll settings and the Discord choice never reach players. Tests in `tests/encyclopedia-statblock.test.mjs`.
- [x] Rolls part C: Maptable tokens can link to an Encyclopedia character (optional `encyclopediaEntryId`; tokens added from the Encyclopedia link themselves). The token editor's Statblock tab shows that character's pasted statblock read-only, with Open in the Encyclopedia (`/encyclopedia?entry=<id>`), Change and Reload; its rolls go through the dice tray, which can post to Discord. Test in `tests/token-encyclopedia-link.test.mjs`.
- [x] Text size: the Appearance menu has five sizes (85%, 92%, 100%, 110%, 125%), saved per browser and applied before first paint as CSS `zoom` on `<html>` (`data-text-size`). Viewport lengths are written `calc(Nvh / var(--ui-zoom, 1))` so full-height layouts still fit, and code that turns screen coordinates into CSS positions divides by `uiZoom()` from `lib/appearance.ts` (board pointer math, context menu, dice dock, drag ghosts, link previews, sidebar resizing). Tests in `tests/text-size.test.mjs`.
- [x] Random tables part A: one table library per account (`users/<owner>/encyclopedia/tables.json`, `/api/encyclopedia/tables`, its own revision and 1 MB limit) with a Random tables page in the Encyclopedia. Tables are used in every campaign or chosen ones; kinds are dice-and-range tables, weighted lists, word pairs and a yes/no oracle (odds, tension 1–9 per campaign, twists on doubles). Results roll `[[1d4]]` and `[[table:Name]]`. Paste import reads book layouts (ranges, `00` as 100, numbered columns, plain lists); files import as RPG Tools `.json`, `.csv` or `.txt` and export as `.json`/`.csv`; tables from another campaign can be shared or copied. Starter tables are original (`lib/encyclopedia/starter-tables.ts`). Tests in `tests/random-tables.test.mjs`.
- [ ] Random tables part B: NPC generator (tables rolled together, keep/reroll lines, mood reactions, save as a character page or token).
- [ ] Random tables part C: `[[table:Name]]` on pages and embedded tables, Maptable dice tray Tables and Oracle tabs, results to Discord.
- [ ] Then 2.1 single save indicator and the rest of the handoff order.

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

