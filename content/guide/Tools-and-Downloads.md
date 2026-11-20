# Tools and downloads

Everything you can open or download, in one place. These links go to this site, so the downloads are made for it.

## Open the tools

| Tool | What it's for | Open it |
|---|---|---|
| Campaigns | Every campaign, its maps and notes together | [Open Campaigns](/campaigns) |
| Maptable | Maps, tokens, fog, lights, initiative and dice | [Open Maptable](/maptable) |
| Wiki | Pages, characters, quests, maps, calendars | [Open the Wiki](/encyclopedia) |
| Account | Sign in, display name, avatar, email and password | [Open Account](/account) |

The Map Creator, dungeon generator and hex map generator open from inside Maptable. World maps, star systems and random tables open from inside the Wiki.

## Downloads for other virtual tabletops

![Connect a table, with the Roll20 and Fantasy Grounds downloads](images/connect-a-table.jpg)

None of these files hold campaign data; your bridge key or your own files carry that. Each one has a setup page with every step.

| Table | Download | Setup |
|---|---|---|
| Foundry VTT | [Manifest URL](/api/bridge/foundry/module.json) (paste into Foundry's Install Module) or [the module as a .zip](/api/bridge/foundry/rpg-tools-bridge.zip) | [Set up Foundry VTT](Foundry-VTT-Setup) |
| Roll20 | [The Roll20 Mod script](/api/bridge/roll20/rpg-tools-roll20.js) (paste into Settings › Mod (API) Scripts) | [Set up Roll20](Roll20-Setup) |
| Roll20 dice link | [The dice link browser extension as a .zip](/api/bridge/roll20/rpg-tools-dice-link.zip) | [Roll between RPG Tools and Roll20](Roll20-Setup#roll-between-rpg-tools-and-roll20) |
| Fantasy Grounds Unity | [The extension, rpg-tools.ext](/api/bridge/fantasygrounds/rpg-tools.ext) (don't unzip it) | [Set up Fantasy Grounds](Fantasy-Grounds-Setup) |

The dice link isn't in the Chrome Web Store yet. Unzip it, open `chrome://extensions` in Chrome or Edge, turn on **Developer mode**, press **Load unpacked** and pick the `rpg-tools-dice-link` folder.

You can also reach all of these in the Wiki under **AI & GitHub › Other tables › Connect a table**, where you make the bridge key Foundry needs.

## For AI apps and coding assistants

These scripts are in the [RPG Tools source on GitHub](https://github.com/dreamsgon/dreams-tools/tree/main/scripts). Run them with Node 22, and give them your site's address and a key privately in your app's settings. See [AI connections](AI-Connections).

| Script | What it does |
|---|---|
| `rpg-tools-mcp.mjs` | Connects a local AI app to one campaign, the same as the hosted connector address |
| `encyclopedia-mcp.mjs` | Read-only Wiki access with a read-only agent key |
| `maptable-mcp.mjs` | Maptable access with a campaign agent key |
| `campaign-sync.mjs` | Exports a campaign's JSON and Markdown to a local Git folder |

## Files the tools make for you

- **Map images and Universal VTT (.dd2vtt)** from the Map Creator's **Use in Maptable** dialog. See [Map Creator](Map-Creator).
- **Character sheets (.json)** from a character's sheet section. See [Sheet import, export and Google Sheets](Sheet-Import-Export-and-Google-Sheets).
- **Backups (.json)** from Maptable's export dialog and the Wiki's Settings.
