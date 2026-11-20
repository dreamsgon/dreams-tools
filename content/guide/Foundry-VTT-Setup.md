# Set up Foundry VTT

This page walks you through connecting a Foundry VTT world to one RPG Tools campaign, step by step. When you're done, your player characters appear in Foundry as actors and stay up to date. Your Wiki pages, quests and session recaps appear as journals. HP changes go both ways, and public rolls reach your campaign's Discord.

It takes about five minutes. For what the bridge does in general, see [VTT bridges](VTT-Bridges).

## What you need

- A Foundry VTT world on **version 12 or 13**, opened as the **GM**. Any game system works. D&D 5e and Pathfinder 2e get the most filled in.
- An RPG Tools campaign with its characters in the Wiki.
- To use Discord rolls, a Discord channel already set for the campaign. See [Dice, rolls and Discord](Dice-Rolls-and-Discord).

## 1. Make a bridge key in RPG Tools

1. Open the **Wiki** and choose the campaign you want to connect.
2. Open **AI & GitHub**, scroll to **Other tables (VTT bridge)** and press **Connect a table**.
3. Set **Table** to **Foundry VTT**. You can name the key, for example "Thursday table". Then press **Make bridge key**.
4. The dialog shows three things. Keep it open for the next steps:
   - the **Bridge key**, which starts with `rpgb_`
   - the **Address** of your RPG Tools site's bridge
   - the **manifest URL** for installing the Foundry module

> **Copy the key now.** It is shown only once. If you lose it, revoke it and make a new one.

![Making a bridge key](images/bridge-keys.jpg)

## 2. Install the module in Foundry

1. On Foundry's setup screen, open **Add-on Modules** and press **Install Module**.
2. Paste the **manifest URL** from the dialog into the **Manifest URL** box at the bottom. It ends in `/api/bridge/foundry/module.json`.
3. Press **Install**.

If the module was installed before, Foundry's **Update** button gets the newest version from the same address.

## 3. Turn it on in your world

1. Launch your world and log in as the GM.
2. Open **Game Settings › Manage Modules**, tick **RPG Tools Bridge**, and save.

## 4. Paste the address and key

1. Open **Game Settings › Configure Settings** and choose **RPG Tools Bridge**.
2. Fill in the settings:
   - **RPG Tools address**: paste the **Address** from the dialog. Your site's plain address works too, such as `https://your-site.example`.
   - **Bridge key**: paste the `rpgb_…` key.
   - **Characters to bring in**: leave it on **Player characters and companions**, or choose **Every character** to bring NPCs and creatures in too.
   - **Send rolls to RPG Tools**: leave it on to post public rolls to your Discord.
3. Press **Save Changes**.

The address and key are kept **in this browser only**, so players never receive the key. If you run the game from a different computer or browser, paste them there too.

## 5. Check it worked

Within a few seconds you should see:

- a note at the top saying **RPG Tools: connected to** your campaign's name
- a new **RPG Tools** folder in the **Actors** tab, with your characters inside
- a new **RPG Tools** folder in the **Journal** tab, with folders for Places, Organizations, Lore, Notes, Vehicles, Quests and Sessions

In **D&D 5e**, each actor gets its HP, AC and biography. In **Pathfinder 2e** it gets its HP. Other systems get the actor and its rolls.

Open an actor. The **RPG Tools rolls** button at the top of its sheet lists the character's skills, saves, attacks and other rolls, and each one rolls in Foundry's chat.

## Journals and what players see

Each Wiki page becomes a journal. Its Overview and each tab become the journal's pages. A quest also gets **Goals**, **Log** and **GM prep** pages, and a session's recap gets its timeline, quotes and GM notes.

Players see exactly what RPG Tools shows them:

- A page or tab shared with players in RPG Tools is shared in Foundry. Everything else stays GM only, even inside a shared journal.
- GM secrets in the text, hidden quest goals, a hidden reward and GM-only log entries show to you as Foundry **secret** blocks. Players don't see them.
- Margin notes go in a secret **GM notes** block at the end of the page.
- A draft recap stays with you until you publish it in RPG Tools.

Links between pages become links to the journal or actor that came in, so you can click through in Foundry.

## Keeping in step

- **From RPG Tools to Foundry:** after you change a character, page, quest or recap in RPG Tools, Foundry picks it up within about 20 seconds. Deleting a page removes its journal. To sync at once, press **Sync with RPG Tools** at the top of the Actors tab.
- **HP from Foundry:** changing HP in Foundry, whether on a token's bar, the sheet or with a macro, sends it back to RPG Tools after a moment.
- **Rolls:** public chat rolls post to your campaign's Discord rolls channel. Whispered and blind rolls never go. Rolls RPG Tools can't show, such as rerolls, are skipped.

Sync only runs while the GM has the world open. Players don't need anything set up.

## What syncs, and which way

Each bridge key has a direction for each kind of thing. To change them in RPG Tools, open **Connect a table** and press **What syncs** on the key. Foundry follows these settings:

| In RPG Tools | Choose | Effect in Foundry |
| --- | --- | --- |
| Characters | Both ways | Characters come in, and HP goes back |
| Characters | RPG Tools → table | Characters come in, but HP changes stay in Foundry |
| Places, lore, organizations, notes | RPG Tools → table | Journals come in |
| Quests | Both ways, or RPG Tools → table | Quest journals come in |
| Session recaps | RPG Tools → table | Session journals come in |
| Roll log | Table → RPG Tools | Public rolls go to Discord |
| Any of these | Off | That part stops |

Scenes, tokens, tables, the calendar and the combat tracker are planned but not synced yet.

## If something isn't right

| What you see | What to do |
| --- | --- |
| No "connected" note, and no RPG Tools folder | Check both settings were saved. The key must start with `rpgb_` and be pasted whole. Make sure you are logged in as the GM. |
| "This bridge key was revoked or is wrong" | The key was revoked or mistyped. Make a new key in RPG Tools and paste it again. |
| Connected, but some characters are missing | Only player characters and companions come in by default. Set **Characters to bring in** to **Every character**. Characters from another campaign never come in. |
| No **Sync with RPG Tools** button | Syncing still runs every 20 seconds. Report it with your Foundry version, since the Actors tab looks different between versions. |
| "Characters: this bridge key is set to Off" | In RPG Tools, open **What syncs** on the key and set Characters to **Both ways**. |
| An HP warning that names a Google Sheet | That character's HP comes from a linked Google Sheet. Change it in the sheet or in RPG Tools. |
| A journal players shouldn't see is shared | In RPG Tools, set that page's Overview or tab to GM only. Foundry follows within about 20 seconds. |
| A warning about choosing a Discord channel | Set a Discord channel for the campaign, or turn off **Send rolls to RPG Tools**. |
| Two GMs online, and nothing syncs | Only the active GM's browser syncs. Paste the address and key in that browser too. |

To report a problem, press **F12** in Foundry and open the **Console** tab. Send the red lines that mention RPG Tools, with your Foundry version and game system.

## Good to know

- **Removing access:** revoking a key in RPG Tools stops that Foundry world at once. Actors already brought in stay in Foundry.
- **Journals are one way:** change pages, quests and recaps in RPG Tools. Edits made to their journals in Foundry are replaced the next time the page changes in RPG Tools, and so are sharing changes made there.
- **Edits made in Foundry:** HP is the only change sent back to RPG Tools for now. To change anything else, edit the character in RPG Tools, or export the sheet and import it there. See [Sheet import, export, Google Sheets](Sheet-Import-Export-and-Google-Sheets).
- **What the key can see:** the key reaches one campaign and can read GM-only things. Only give it to a Foundry world you run.
- **Status:** this part of the module is new and hasn't been tried in many real worlds yet. See [Limits and what's coming](Limits-and-Whats-Coming).
