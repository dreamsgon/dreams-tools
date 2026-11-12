# Usability handoff

Written 2026-11-11 from a hands-on walkthrough at commit `da2793b`. The owner's summary of the current app is "janky". This document says where that comes from and what to fix, in order.

Read AGENTS.md first. Every item here is a normal task under that workflow: one branch and one pull request per numbered item, no merge to `main` without the owner's say.

## How this was checked

- The app was run locally with `npm run dev` and driven with a headless Chromium at 1440x900 and 390x844 (touch).
- Sign-in and S3 were replaced by a temporary, uncommitted local stub so the signed-in screens could be reached. Nothing from that stub is in the repository, and none should be added.
- Covered: home, account, agent page, Maptable campaign list, board, every sidebar panel, token add, dice tray, Share, Connections, Help, Map Creator, and the Encyclopedia dashboard, world and campaign creation, an article, Characters, Maps, Calendar, and the AI & GitHub dialog.
- Not covered: the live site, real Supabase sign-in, image uploads, drag and drop, pinch and touch gestures on a real phone, the player view, Discord posting, fog drawing, and large libraries. Treat those as unknown, not as fine.

Side effect to know about: `next dev` appends a "nextjs-agent-rules" block to AGENTS.md on every run. Either commit that block once in its own pull request or keep discarding it, but do not let it ride along in unrelated diffs.

## The short version

The Encyclopedia feels finished. Maptable does not. Most of the jank is in three places:

1. Maptable and the Encyclopedia behave like two different products that share a login.
2. Maptable shows every control at once, with duplicated save buttons and long helper text, so the next step is never obvious.
3. A handful of plain bugs make the whole thing look broken: garbled characters, an unstyled link, overlapping floating buttons, and a sign-in form shown to a signed-in user.

Fix the bugs first because they are cheap and visible. Then the first-run flow. Then consistency.

## Priority 1: visible bugs

Each of these is small and safe. None touches saved data.

### 1.1 Garbled characters in the dice tray

`components/standard-dice-tray.tsx` contains mis-encoded text on six lines. The user sees `Quick rolls Ã‚Â· saved on this device`, a decrease button labelled `Ã¢Ë†â€™`, and `Rolling diceÃ¢â‚¬Â¦`.

- Replace with the intended characters: a middle dot, a minus sign, and an ellipsis.
- Search the whole source for the same damage: `grep -rnP "Ã|â€|Â[ ·]" app components lib`.
- Done when that search returns nothing and the tray reads correctly in the browser.

### 1.2 Unstyled links

The `Encyclopedia` link in the Maptable header (`components/map-app.tsx`, the `<header>` near line 884) renders as a default blue underlined link on the dark navy bar and is close to unreadable. `Open Agent workspace` and `Open Amazon S3 console` in the Connections dialog have the same problem.

- Give header links the same style as the home page header links. Give in-dialog links a deliberate link style that works in light and dark themes.

### 1.3 Signed-in users still see the sign-in form

`components/account-form.tsx` renders "Signed in as ... Sign out" and then the full Sign in / Register / Forgot password form underneath, under the heading "Welcome back".

- When a user is signed in, show only who they are, Sign out, and links to Maptable and the Encyclopedia. Keep password change reachable if it exists.
- Do not change how sign-in itself works.

### 1.4 Floating Dice tray and Roll log buttons collide with everything

`app/(tools)/layout.tsx` mounts `StandardDiceTray` on every page in the group. As a result:

- They appear on the marketing home page, the account page, and the agent page, where dice make no sense.
- They sit on top of modal dialogs (Help, Connections), because their z-index (80 and 90) is not coordinated with the dialog overlay.
- The open tray covers the board's tool bar on desktop.
- In Map Creator they cover the bottom of the Layers panel and crowd the drawing tool bar.
- On a phone they take a full extra row under the bottom navigation.

Fix:

- Mount the tray only on the Maptable board (and the Encyclopedia only if the owner wants dice there).
- Move the two buttons into the board's own tool bar on desktop and into the phone "Tools" tab, so nothing floats.
- Put overlays on one documented z-index scale. `app/(tools)/globals.css` and the component stylesheets currently use about twenty unrelated values between 2 and 200.

### 1.5 Clipped and overflowing controls

- At 900px window height, the left rail's last item (Dashboard) is cut off. Make the rail scroll, or pin Help / Create map / Dashboard so they always fit.
- In the Auras & AoEs panel, the `Add map label` button runs off the right edge of the sidebar. Let that button row wrap.
- The home page and account page scroll sideways by about 5px at 390px width.

### 1.6 Mixed text sizes inside one panel

In the Tokens panel, the Discord checkbox label, its helper paragraph, and the two `<details>` summaries ("Initiative order & settings", "Discord preview") render in the browser's default size, visibly larger than everything around them. Style checkboxes, helper text, and `<details>` once, globally, for Maptable.

### 1.7 Small text errors

- `components/scene-organizer.tsx` line 191: "use Move scene to to add them".
- "1 tokens · 0 effects" on the board status line. Pluralize.
- Unlabelled icon buttons: the `+` next to "Add scenes" (it has an accessible name but no visible hint), a submit button with no label in Scene details, and one unlabeled button inside "Initiative order & settings". Give each a visible label or a tooltip plus `aria-label`.
- Map Creator field labels "width" and "height" are lower case while every other label is capitalized.

## Priority 2: make the first five minutes obvious

### 2.1 One save model, stated once

Right now the board shows a `Save` button in the header, a `Save changes` button pinned to the bottom of the sidebar, and "Saved to cloud" twice. The campaign list shows `Save` and "Ready". A user cannot tell whether work saves by itself.

- Decide the model and show it once. The board already autosaves about 700ms after a change (the timer in `components/map-app.tsx` near line 414), so the likely answer is a single status indicator in the header ("Saved", "Saving...", "Offline, will retry", "Conflict") with a manual "Save now" only inside a menu or shown when there are unsaved changes.
- Remove the pinned `Save changes` bar from the sidebar. On a phone it permanently takes about 60px.
- Keep the conflict handling exactly as it is. This is a presentation change only. See the invariants in AGENTS.md.

### 2.2 Trim the campaign list

The first screen a new user sees has `Return to map` (there is no map yet), `Map Creator`, `Unfiled scenes`, `Undo`, `Redo`, a search box, an "All campaigns" bar, "Selected folder: All campaigns & scenes", `New campaign`, `New folder`, `Expand all`, and `Collapse all`, all before any campaign exists.

- With no campaigns: show one sentence and one primary button, "Create your first campaign". Hide search, folders, expand/collapse, undo/redo, and "Return to map".
- With campaigns: one click on a campaign should open it. Today the first click selects it and reveals a second "Open campaign" button plus an inline edit form. Move rename, move, and remove behind the pencil button.
- Hide "Selected folder: ..." unless folders exist.

### 2.3 Check that the last place is remembered

`lib/navigation-state.ts` stores the open scene, panel, and dashboard flag in `localStorage`. The walkthrough used a fresh browser profile for each run, so it could not confirm that a returning user lands back on their last scene. Check this in a normal browser for both tools. If Maptable returns to the campaign list, or the Encyclopedia returns to the Dashboard, on every visit, fix it so the last scene or campaign opens directly.

### 2.4 Give each sidebar panel one job

Several panels mix unrelated things and lead with instructions:

- **Scenes** opens with "Scene details" for the current scene, including a field labelled "Move map to" whose options are Encounter Map, World Map, and Area Map. That is a map type, not a destination. Rename it "Map type" and move scene details behind an edit button on the scene row.
- **Tokens** contains the initiative tracker and Discord posting controls ahead of the token list. Give initiative its own rail entry or a clearly separate collapsible section, and move "Post initiative to Discord" and its explanation into that section's menu.
- **Explore** repeats the same "Move map to" control.
- **Auras & AoEs**, **Fog of War**, and **Grid** each carry several paragraphs of always-visible instructions. Replace with a one-line hint and a "?" that reveals the rest.

### 2.5 Make tools behave like tools

The bottom tool bar holds Select, Drag select, Pan, Measure, and Token. The first four are modes. `Token` is an action: it drops a token in the middle of the view immediately. Either make it a mode (click the map to place) or move it out of the mode group and label it "Add token".

After a token is added, the sidebar still says "Select a token on the map or in the list to edit it". Selecting a token should show its editor straight away.

### 2.6 Board chrome

- The "Choose a saved crop" select and `New crop` button float over the top right of the map. Move them into the bar above the board.
- The empty-state card ("Your next encounter starts here") sits over the center of the grid. Give it buttons for the two actions it describes (Upload a map, Add a token) and dismiss it on first interaction.

### 2.7 Phone layout

There is a real phone layout with bottom tabs, which is a good base. The problems:

- The board opens with the Scenes sheet already covering more than half the screen, leaving a strip of map about 80px tall. Open on the Map tab with the sheet closed.
- The fixed `Save changes` bar, the tab bar, and the Dice tray / Roll log row together take about 200px of an 844px screen. Items 1.4 and 2.1 recover most of that.

## Priority 3: make it one product

### 3.1 One shell

Maptable uses a dark navy header, a geometric sans font, and squared teal buttons. The Encyclopedia uses a light header, serif headings, and rounded green buttons. The Maptable header has no Account link, and its brand link says "Maptable" but goes to the RPG Tools home.

- Use one top bar across home, account, Maptable, and the Encyclopedia: RPG Tools on the left, then Maptable, Encyclopedia, Account, and the theme switch.
- Keep each module's working area as it is. The owner has not asked for a visual redesign, so prefer moving Maptable toward the Encyclopedia's calmer look over inventing a third style.
- ARCHITECTURE.md notes that cross-module navigation uses full page loads to avoid global-style leakage. Keep that separation unless the styles are scoped first.

### 3.2 One theme setting

Dark mode is stored twice: `maptable-theme` in `components/theme-toggle.tsx` and `ttrpg-color-theme` in `components/encyclopedia/theme.tsx`. Turning on dark mode in one tool leaves the other light. Use one key and one control, and migrate the old values on first load.

### 3.3 One set of campaigns (needs the owner's decision)

The home page says "One account, two connected tools", but the tools are not connected. A campaign made in Maptable does not exist in the Encyclopedia, and the reverse. Each also has its own separate Maps area. A GM has to create "the same" campaign twice and upload maps in two places.

This is the largest usability problem in the app, and it is a data-model question, not a styling one. Do not start it without the owner choosing a direction. Options, smallest first:

1. Change the home page wording so it does not promise a connection, and add a plain link from each tool to the other.
2. Let a Maptable campaign be linked to an Encyclopedia campaign by id, so each can deep-link to the other.
3. Share one campaign list between the two tools.

Options 2 and 3 change saved data. AGENTS.md requires backups, a compatibility plan, and isolated verification before any such migration.

### 3.4 Replace browser pop-ups

About ten places use the browser's own `confirm()` box. In Maptable: replacing a scene drawing (`map-app.tsx` near line 1079) and flattening fog regions (`fog-regions.tsx`). In the Encyclopedia: deleting an entry (`workspace-app.tsx`), deleting a tab (`article-editor.tsx`), removing a route (`map-routes.tsx`), and four in `map-editor.tsx` (turning off fog, removing a pin, replacing terrain, regenerating terrain). Use the app's existing dialog so destructive actions look and read the same everywhere, and offer Undo where the code already supports it.

## Before large Maptable changes

`components/map-app.tsx` is about 2,070 lines with single lines over 400 characters, `components/dialogs.tsx` is about 1,900, and `app/(tools)/globals.css` is about 1,970. Several components are written in a minified style. That is why small UI changes are risky.

Do not do a big-bang rewrite. When an item above touches one of these files, first extract the piece being changed into its own component with no behavior change, in a separate commit, then make the change. Run the full check list from AGENTS.md each time.

## Suggested order of pull requests

1. 1.1 garbled characters, 1.7 text errors, 1.2 links
2. 1.3 account page
3. 1.4 dice tray placement and z-index scale
4. 1.5 and 1.6 clipping and text sizes
5. 2.1 single save indicator
6. 2.2 campaign list, and 2.3 if the check finds a problem
7. 3.2 single theme setting
8. 2.4 to 2.6 sidebar panels, tools, and board chrome, one panel per pull request
9. 2.7 phone layout
10. 3.1 shared top bar
11. 3.4 dialogs
12. 3.3 only after the owner decides

## Rules that apply to every item

- No change to saved data formats, storage keys in S3, sign-in, or account isolation unless the item says so.
- Local-only preferences in `localStorage` may be renamed if old values are migrated.
- Each pull request states what a user will see differently, with before and after screenshots at desktop and phone widths.
- Unit tests cannot prove a layout fix. Say plainly which screens were looked at in a browser and which were not.
