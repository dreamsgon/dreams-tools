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

## Character sheets (Google Sheets)

A character page can link one Google Sheet. Its Profile tab then shows a Character sheet section with chosen cells copied from it: hit points (with a maximum and your own label, such as Stress), AC, Initiative, other stats, and rolls listed with their formulas. The copy is stored on the character (`character.sheet`); rolling, Maptable, Discord and writing back to the sheet are not part of this yet.

- **Published link (no setup).** In Google Sheets choose File, Share, Publish to the web, pick the tab and Comma-separated values (.csv), and paste the link under Link a character sheet. Publishing makes the sheet readable by anyone with the link. The server reads only `docs.google.com`, up to 2 MB.
- **Sign in with Google (needs one-time setup below).** The browser signs in with Google Identity Services, Google's own file picker lets the GM choose one sheet, and the browser reads it with the Sheets API. The scope is `drive.file`, which can open only files picked in the app. No token or sheet is stored on our server.
- **Which cells.** A tab named `RPG Tools` whose first row is Name, Value, Roll is read row by row (a Roll makes a roll; HP, Max HP, AC and Initiative fill their slots). Otherwise the GM clicks label and value cells in a grid. The dialog's Download template link gives an example CSV to import as that tab.
- **Rolling (GM).** The sheet section's Rolls area lists the sheet's roll items by group (Skills, Saves, Attacks, Other); "Longbow attack" and "Longbow damage" become one row with an Attack and a Damage button, and a roll item with only a bonus such as +5 rolls 1d20 plus it. Pick Advantage, Normal or Disadvantage before a roll (it resets to Normal): a single d20 becomes 2d20kh1 or 2d20kl1, and other rolls are rolled twice keeping the higher or lower total. Notation: `1d20+5`, `4d6kh3` / `2d20kl1`, `2d6!` exploding, `5d10>=8` count successes, `4dF` plus/minus dice. Rolls show in the roll card (Send to Discord, or Always) titled Character · Roll, and the latest are kept in a per-browser roll log. In Maptable, a token linked to a character with a sheet has Roll from <name>'s sheet in its menu. Players roll as described under Players.
- **Players.** When the character's Stats tab is player visible, players see the copied title, values and formulas, read only. They never receive the spreadsheet id, the published link, who linked it or the cell references, and a players-only AI connection follows the same rule.
- **Players linking and rolling.** A signed-in member who may edit a character page (Who can edit) sees Link my sheet, Refresh, Open and Unlink there. They link a published link (read by the server with the same limits) or a Google file they pick (read in their own browser). They can change a sheet only when the page has none or they linked it; a sheet the GM linked stays the GM's. Their sheet is visible to them even while the Stats tab is GM only, and the GM page says Linked by <their name>. For a published link the server reads the sheet again when it is linked, so the stored values come from the sheet; a Google file read in the player's own browser is accepted as read, because it is their own sheet. Their rolls are made on the server from the stored formula, posted to the campaign's Discord channel as the character (with that page's own picture, if it has one) when one is set, and shown in the roll card. Anyone else (share-link viewers, other characters) sees the stats and can roll locally, which stays on that device. Only the member who linked a sheet is given its open link.
- **Write HP back (opt in, Google sign-in links only).** On a sheet linked with Google sign-in that has an HP cell, the sheet section shows a **Write HP back to the sheet** switch (off by default; "When HP changes here, update the cell in the sheet"). Published links can't be written to and say so. With it on, the section gets HP controls (lose 5 or 1, gain 1 or 5, or set an exact number). A change lands on the page at once; after 1.5 seconds without another change the browser writes the latest number to the HP cell, and only that cell (never Max HP or anything else), using `spreadsheets.values.update` with `valueInputOption=RAW` so the number is stored exactly as a number and is never parsed as a date or formula. Whole numbers from -9999 to 99999 only. It writes with the signed-in person's own in-memory Google token (nothing is stored on the server, no refresh token, no new scope: `drive.file` already covers sheets they picked). It never opens a Google pop-up by itself: with no live sign-in the page says "Sign in with Google to write HP back" and a button. Before writing it reads the cell; if the sheet's HP changed since it was read it shows "The sheet's HP changed to X since it was read" with **Use the sheet's value** or **Write ours**, and a cell holding a formula is never overwritten. After a write the stored copy's HP and read time are updated. Only the person who linked the sheet can turn it on: a sheet a player linked from their own Google account can't be switched on by the GM, and the player pages don't offer it yet. Players and the AI read-only views never receive the setting (`playerSheet()` is an allowlist). Maptable tokens keep their own HP numbers and are not yet connected to this.

### One-time Google setup (site owner)

1. In the Google Cloud console create a project. Note its **project number** (Project settings).
2. Enable the **Google Sheets API**, **Google Picker API** and **Google Drive API** in this same project. The Sheets API must be on for reading and for writing HP back; no new scope or OAuth setting is needed for write-back.
3. OAuth consent screen: user type **External**, add only the scope `.../auth/drive.file`. While in Testing, add each GM as a test user; publish the app when ready for others.
4. Credentials, Create OAuth client ID, type **Web application**. Add the site's origins as Authorized JavaScript origins (for example `https://dreams-tools-sable.vercel.app` and `http://localhost:5173`). No redirect URI is needed.
5. Credentials, Create API key. Restrict it to the **Google Picker API** and **Google Sheets API**, and to the site's HTTP referrers.
6. Set these in the deployment's environment (they are `NEXT_PUBLIC_`, so they are visible in the browser by design) and redeploy:

```text
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<the OAuth client ID>
NEXT_PUBLIC_GOOGLE_API_KEY=<the restricted API key>
NEXT_PUBLIC_GOOGLE_APP_ID=<the project number>
```

Until all three are set, the dialog shows Sign in with Google disabled with "The site owner hasn't set up Google sign-in yet. Use a published link for now." The app sends no Content-Security-Policy header today, so nothing needs allowing. If one is added later, the Google option loads scripts from `accounts.google.com` and `apis.google.com`, frames the picker from `docs.google.com`, opens a sign-in pop-up on `accounts.google.com`, and calls `sheets.googleapis.com` and `www.googleapis.com`. Check the browser console for refusals after adding a policy, because the picker may also load assets from other Google hosts.

## Remaining acceptance checks

Source/model tests and production build checks are documented in VALIDATION.md. Real account/email/S3 setup, authenticated desktop/mobile interactions, deployed MCP access, and migration of your live content remain owner setup tasks in TODO.md. No external service was deployed by this integration.
