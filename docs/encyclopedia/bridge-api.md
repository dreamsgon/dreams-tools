# Bridge API (version 1)

The bridge API lets another table stay in step with one Encyclopedia campaign. It serves the RPG Tools Bridge module for Foundry VTT, and later the owner's Unreal Engine VTT, so nothing here is Foundry-only.

## Keys

- **Where:** the GM makes a bridge key in the Encyclopedia under **AI & GitHub › Other tables › Connect a table**.
- **Format:** `rpgb_` followed by 64 hex characters.
- **Scope:**
  - A key reaches one campaign: its own pages and the world's shared lore.
  - It never reaches other campaigns or campaign settings.
  - It is separate from AI connection keys (`rpg_…`), which are refused here.
- **Storage:**
  - Only a hash of the key is stored, and the key is shown once.
  - Revoking a key stops it at once.
  - A campaign has at most 5 bridge keys.
- **Sending it:** every request carries `Authorization: Bearer rpgb_…`. Replies allow any origin (CORS `*`) because the key is never a cookie. The Foundry module calls from its own page in the browser.
- **Rate limit:** 240 requests a minute per key. Past that, the reply is `429`.
- **Secrets:** the key acts for the GM, so replies include GM-only things. Each item carries `visibility` (`gm` or `players`), and the table decides what players see.

## Directions

Each kind of thing has its own direction, set per key:

| Direction | Meaning |
| --- | --- |
| `both` | Read and write |
| `to` | RPG Tools → the table (read only) |
| `from` | The table → RPG Tools (write only) |
| `off` | No access |

A call whose direction is not allowed gets `403`. These are the kinds and their default directions:

| Kind | Default | Endpoints |
| --- | --- | --- |
| `characters` | `both` | Ready |
| `pages` | `to` | Ready |
| `quests` | `both` | Come with the Foundry module |
| `recaps` | `to` | Come with the Foundry module |
| `scenes` | `both` | Come with the Foundry module |
| `tokens` | `both` | Come with the Foundry module |
| `markers` | `to` | Come with the Foundry module |
| `tables` | `both` | Come with the Foundry module |
| `calendar` | `to` | Come with the Foundry module |
| `initiative` | `both` | Come with the Foundry module |
| `rolls` | `from` | Ready |

## Endpoints

Every reply includes the workspace `revision`.

### Campaign info

`GET /api/bridge`

Returns:
- the campaign, the world and the key's name
- each kind's direction, and whether its endpoints exist yet (`ready`)
- the formats
- the endpoint list

### Characters

`GET /api/bridge/characters`

- Lists every character the campaign sees.
- Each has `{id, name, role, parentId, shared, updatedAt}`.
- `shared: true` marks world lore that every campaign in the world uses.

`GET /api/bridge/characters/{id}`

- Returns the character as an RPG Tools sheet (`sheet`, format `rpgtools-sheet` version 1), the same file the sheet import and export use.
- `warnings` lists anything cut to fit.

`POST /api/bridge/characters`

- Body: `{sheet}`.
- Makes a character page in this campaign.
- Returns `201` with the character.

`PUT /api/bridge/characters/{id}`

- Body: `{sheet, baseUpdatedAt?}`.
- Updates the character from the sheet.
- When `baseUpdatedAt` is sent and the page changed since then, the reply is `409` with `current` (the character as it is now).
- Shared world characters can't be changed (`403`).

`POST /api/bridge/characters/{id}/hp`

- Body: `{value, max?}`.
- Sets current (and maximum) HP on the character's imported sheet, and makes a small imported sheet if the character has none.
- A character with a linked Google Sheet keeps that sheet's HP (`409`).

**What a write may change.** A write never changes the campaign's stat form. Sheet fields that match a form field by name (ignoring case and punctuation) are kept, and the others are skipped and named in `warnings`. Writes go through the same scope check as AI changes (`lib/mcp/commit.ts`): only this campaign's own pages.

### Pages

`GET /api/bridge/pages?since={ISO time}`

- Returns folders, notes, places, organizations (`faction`), lore and vehicles.
- Each page has:
  - `{id, kind, title, parentId, shared, updatedAt, order}`
  - `overview: {visibility, text}`
  - `tabs: [{id, title, visibility, text}]`
- `since` sends only pages changed after that time.
- `ids` always lists every page, so the table can remove the ones that are gone.
- Text is Markdown:
  - `[[page-id|Label]]` links to another page.
  - `[[2d6+3|Label]]` is an inline roll.

### Rolls

`POST /api/bridge/rolls`

- Body: `{title, formula, total, detail?, who?}`.
- Posts the roll to the campaign's Discord rolls channel, like a roll made in RPG Tools.
- The formula must be dice RPG Tools understands: NdS with `+` and `-`, `kh`/`kl`, `!` for exploding, `>=N` or `<=N` to count, `dF`.
- When the campaign has no Discord channel set up, the reply is `409` with the reason.

### The Foundry module

These two addresses need no key, because they hold only the module's own files:

- `GET /api/bridge/foundry/module.json` is the manifest to paste into Foundry. It points its download at this same site.
- `GET /api/bridge/foundry/rpg-tools-bridge.zip` is the module itself.

The source is in `integrations/foundry/rpg-tools-bridge`, and its README explains how to install and use it.

## Errors

Errors reply with `{error}` in plain words, plus the status:

| Status | Cause |
| --- | --- |
| `400` | Bad request |
| `401` | Missing, wrong or revoked key |
| `403` | Direction not allowed, or shared lore |
| `404` | Not in this campaign |
| `409` | Conflict |
| `413` | Body over 500 KB |
| `429` | Rate limit |

## Code

- Keys: `lib/bridge/keys.ts`, with the sync settings in `lib/bridge/sync.ts`.
- Shapes and writes: `lib/bridge/api.ts`.
- HTTP layer: `lib/bridge/http.ts`.
- Routes: `app/api/bridge/`.
- The GM's key management route: `app/api/encyclopedia/bridge-keys`.
- Tests: `tests/bridge.test.mjs`.
