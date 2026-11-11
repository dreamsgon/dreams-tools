# RPG Encyclopedia

Open `/encyclopedia` from the RPG Tools home and sign in with the same account used for Maptable. Each account has its own encyclopedia. It includes worlds and campaigns, nested articles, wiki links/backlinks, search, tasks, character articles and custom tabs, calendars/moons/seasons, weather/travel, map atlases, fog, templates and player sharing.

## Source and migration

Imported from the owner's [TTRPG World Manager GPT Site](https://ttrpg-world-manager.dreamsleever.chatgpt.site), version 11, source commit `a310ac6e0e5f737437209be5fbaca5e10fb82157`, on 2026-11-10. The original site was not modified. This package contains its application source, synthetic demo content and templates, not your live private worlds or a rules encyclopedia database.

1. While signed into the old site, open Settings and export all worlds (or export a selected campaign).
2. For every uploaded atlas map, download its **Map package** too. Workspace JSON references image IDs; it does not embed the uploaded image bytes.
3. Sign into the new deployment, open the encyclopedia's Settings, and import the JSON. Imports create separate copies instead of silently replacing existing worlds.
4. Import the map packages into the appropriate campaigns/maps and check images, fog, article references and calendar content. Keep the original exports until everything is verified.
5. Create new player links and agent keys in the new deployment. Old Sites links and credentials do not migrate.

The encyclopedia workspace limit remains 2 MB; PNG/JPEG/WebP atlas images allow up to 8 MB each. Maptable and encyclopedia retain separate data formats; a map does not automatically synchronize between them. Data stays in the same configured private S3 bucket under separate per-account paths. Existing `MAPTABLE_` environment names serve both modules.

## Players and AI access

Player links show only material explicitly shared with players, with private notes and unrevealed map areas filtered. Anyone holding a player link can read its shared content. Replace or revoke the link to stop subsequent access. Already issued signed image URLs can remain valid for up to five minutes; downloaded copies cannot be recalled.

In encyclopedia Connections, select a campaign and create a read-only agent key. It includes private GM material for that campaign and shared world lore, so do not give it to players. It cannot read other campaigns or edit the workspace. Keys are independent of Maptable keys and can be replaced/revoked.

For an MCP-capable coding assistant, run Node 22 with `scripts/encyclopedia-mcp.mjs` and supply these environment variables privately through the client's configuration:

```text
RPG_TOOLS_URL=https://YOUR-DEPLOYMENT.vercel.app
ENCYCLOPEDIA_AGENT_KEY=enc_YOUR_GENERATED_CAMPAIGN_KEY
```

Available tools: `list_worlds`, `read_campaign`, `search_campaign`, `read_article`. Client support varies; a model name alone does not provide MCP or repository access. Codex, Claude, T3Code, DeepSeek and Grok can work on the source using AGENTS.md and the prompt in GITHUB_SETUP.md.

The optional `scripts/campaign-sync.mjs` exports campaign JSON and Markdown to a local Git checkout. Run with `node --experimental-strip-types`; consult its `--help` and the encyclopedia Connections panel. Saving in the browser does not push to GitHub. Campaign exports may contain private GM notes: keep them separate from this application's source repository.

## Remaining acceptance checks

Source/model tests and production build checks are documented in VALIDATION.md. Real account/email/S3 setup, authenticated desktop/mobile interactions, deployed MCP access, and migration of your live content remain owner setup tasks in TODO.md. No external service was deployed by this integration.
