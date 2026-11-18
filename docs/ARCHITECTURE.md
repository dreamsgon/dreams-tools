# Architecture

## Runtime and identity

Standard Next.js App Router on Vercel's Node.js runtime. `next.config.ts`, `vercel.json`, package.json and the lockfile define the deployment. The old Vinext/Cloudflare Workers/Sites scaffolding and platform identity-header fallback have been removed. `proxy.ts` refreshes Supabase cookies; `lib/app-user.ts` verifies the user with Supabase Auth and rejects unconfirmed emails.

`/` is the RPG Tools home with Maptable and RPG Encyclopedia links. Both editor pages redirect unauthenticated visitors to `/account`. The token-based `/encyclopedia/player` page is public. API routes use `lib/server.ts` to authenticate and derive an owner prefix from the verified user ID, never an email or a browser-supplied owner ID. Multiple users have separate workspaces, not shared multiplayer campaigns.

## Persistence

`lib/storage.ts` implements the small bucket contract in `storage-types.ts` against private Amazon S3 using AWS Signature V4. Each user owns `MAPTABLE_S3_PREFIX/users/<encoded supabase:UUID>/`. Agent key hashes live separately under the application prefix and resolve only to an owner/campaign grant. Optional extra S3 images also include the owner prefix.

`lib/workspace-storage.ts` retains immutable workspace segments and a manifest at workspace.json as the single atomic commit point. S3 If-None-Match protects initial creation; If-Match protects later revisions. A conditional failure returns a conflict and is never retried unconditionally. No local filesystem storage is used in production.

## Large transfers

`/api/transfers` issues five-minute S3 POST policies for an exact random staging key, MIME type, and byte count. The owner prefix and purpose are server-derived/validated. Browser bytes go directly to S3; `/api/assets` and workspace writes then read the staged content under the authenticated owner's prefix. Workspace content is schema-validated before the manifest commit. Staging cannot write final workspace/settings/agent keys.

Normal JSON uses a 3 MB threshold, below Vercel's function limit. Large responses use `{downloadUrl}` with a signed private S3 GET. `lib/transfer-client.ts`, the polling loop and the MCP client follow these without cookies or bearer credentials. Image routes authenticate then redirect to a signed URL; agent image reads return a URL to avoid forwarding Authorization. Discord renders are staged before the server forwards them to a saved campaign webhook.

All temporary keys are under `MAPTABLE_S3_PREFIX/transfers/` for one-day lifecycle expiry. Failed/abandoned uploads and large-response snapshots may remain until lifecycle cleanup. Completed upload staging is removed best-effort. Immutable workspace segment garbage collection remains separate future work.

## Main code

- `components/map-app.tsx`, `board.tsx`, `map-creator.tsx`: maps, drawing and interaction.
- `lib/model.ts`, `render.ts`: validated scene/workspace types, geometry and player rendering.
- `lib/workspace-*`: saves, synchronization, conflicts and storage.
- `lib/agent-*`, `app/api/agent/*`, `scripts/maptable-mcp.mjs`: campaign-scoped map/roster access.
- `lib/rolls.ts`, `lib/dice-*`, `components/standard-dice-tray.tsx`: shared map dice, excluding character-sheet tools.
- `app/api/settings`, `discord`, `s3`, `assets`: private settings and optional integrations.
- `docs/s3-*.json`: configuration templates; these contain placeholders, not credentials.

Map data schemas are retained from the 2026-11-09 extraction. The original project was not modified. Export/import backups with embedded images to migrate; no account merging or automatic R2 transfer occurs.

## Encyclopedia

`components/encyclopedia/` and `lib/encyclopedia/` contain the imported world manager. `/api/encyclopedia/*` uses verified Supabase identities. `store.ts` stores a separate 2 MB workspace envelope with a numeric revision and S3 ETag conditional writes under each account's `encyclopedia/` prefix. Images live below that prefix and use the existing direct-upload staging service (8 MB image limit). No D1 database or Sites identity headers are required.

Hashed player/agent keys resolve to an owner and campaign, then are checked against the current campaign pointer so replacement and revocation invalidate future reads. Player responses use the original field/calendar/fog filtering. Agent keys include GM content but only the selected campaign and shared world lore. Map and encyclopedia keys are independent. Authenticated image reads redirect to five-minute signed URLs; already issued URLs remain usable until expiry.

`app/(tools)/` holds Maptable/account styles; `app/encyclopedia/` has its own layout/theme/styles. Cross-module navigation uses full page anchors to avoid global-style leakage. The encyclopedia's campaign-sync script is an explicit local export/import workflow, not automatic hosted GitHub sync.

## Campaign forum

`/forum` (`app/forum/`, its own layout and `forum.css`) is a campaign's Jcink-style roleplay forum. The address hash names the campaign: `#c-<campaign id>` for the GM's own campaign, `#m-<ref>` for one the signed-in person is a member of (the same ref as the player pages), then `&board=`, `&topic=` or `&view=`. `lib/forum/` holds it: `model.ts` (schemas, `forumRights` from the member list's forum permissions, and every change as a pure function returning the topic file to write and a change to re-apply to the forum file), `store.ts` (`users/<owner>/encyclopedia/forum/<campaign>/forum.json` plus `topics/<id>.json`, all If-Match/If-None-Match writes; the forum file is re-read and the change re-applied on a conflict, with the topic read again so a summary never goes stale), `view.ts` (what one person sees: names from the member list, character hover cards with only player-shared facts, traits and stats, links only to pages they can open) and `request.ts` (the handlers behind `POST /api/forum` and `GET /api/forum?c=&image=`, with injected deps). Pictures are limited to characters who have posted, location boards' place pages, the campaign banner and the viewer's own characters. Players post in character as characters whose Who can edit includes them; GMs and co-GMs as any character or as narrator; out-of-character boards only as yourself. Every post counts towards the member's own post count. The CSS uses the campaign theme contract's variables and class names (`.board-head`, `.category`, `.forum`, `.location`, `.topic-row`, `.post`, `.mini`…, and a `page` container) so a campaign theme can be layered on later.

Reading (`lib/forum/reader.ts`): each reader's marks live in `reads/<sha-256 of their account, 40 hex>.json` beside the forum (a "read everything up to" time plus the last post time seen per topic; a first visit starts from when they joined, the GM's from that moment). Opening a topic marks it read; Mark all as read resets the marks. `presence.json` holds when each member last opened a page (written at most once a minute per person, best effort) and the most online at once; "online" is the last 15 minutes. Turns: a topic summary's `order` lists who has posted in first-post order (characters, and `*` for the GM's narration); the one after the last poster is up, with no turn when fewer than two take part. A character is the GM's to play when no member may edit its page. The forum file's `recent` keeps three days of posts (account, character, topic, post) for Characters who posted today; the browser gets only character names, pictures and post times.

Writing: posts use the Encyclopedia's page text plus `lib/forum/markup.ts` (underline, speech, `[collapse=Title]` sections). A topic page carries `links`, the `[[page]]` targets in its posts that this reader may open, with a secret-free summary. The full reply page and edit page are hash places (`&topic=<id>&reply=1`, `&topic=<id>&edit=<post>`) that read the topic page.

Moderation: a topic summary may carry `archived`, `trashed` (`{at, by}`) and `private` (account ids besides the starter, at most 30). `canSee` hides trashed topics from everyone and private ones from all but the starter, the people named and GMs; `view.ts` builds every list, count, turn and the recent log from `shownTopics`, and the model refuses changes to topics the person can't see. Archived topics take no replies and sit in the board's archive (`&board=<id>&archive=1`). Trashed topics keep their posts and counts until deleted for good; topics more than 30 days in the Trash are deleted (10 at a time) when a moderator opens the Trash page (`&view=trash`). The browser names members for a private topic by `memberKey`, a 16-hex hash of the owner, campaign and account, which the server maps back. `bulk` applies one change per topic in turn and reports how many changed; `export` (GM only) returns a board's topics with their posts (up to 300) for the browser to turn into .html or .txt (`components/forum/forum-export.ts`); a single topic prints from the topic page it already has (`&topic=<id>&print=1`).
