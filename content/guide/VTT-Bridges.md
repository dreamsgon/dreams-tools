# VTT bridges (Foundry VTT)

Keep another virtual tabletop in step with one RPG Tools campaign. **Setting up Foundry? Follow [Set up Foundry VTT](Foundry-VTT-Setup) step by step.**

Today that means **Foundry VTT** (v12 and v13, any game system). The **bridge API** is general, so other tables can use it later.

## Make a bridge key

1. In the Encyclopedia open **AI & GitHub › Other tables › Connect a table**.
2. Choose Foundry VTT, the Unreal Engine VTT or another app, and make a **bridge key**. It looks like `rpgb_…`, is shown once, reaches **one campaign** and can be revoked instantly. A campaign can have at most 5.
3. For each kind of thing choose a **direction**: both ways, RPG Tools → table, table → RPG Tools, or off. Lore defaults to one way.

![Making a bridge key](images/bridge-keys.jpg)

Bridge keys are separate from AI keys. Replies include GM-only things, so only give a key to a table you run.

## Install the Foundry module

The Connect a table dialog shows the module's **manifest URL** for a Foundry key (`/api/bridge/foundry/module.json`). In Foundry: Add-on Modules › Install Module › paste the manifest URL. Enable **RPG Tools Bridge** in your world.

In the module's settings enter your RPG Tools address and the key. Only the active GM's browser holds the key and talks to RPG Tools.

## What syncs

- **Characters** come in as **actors** in an *RPG Tools* folder, and update within about 20 seconds of a change. **Sync with RPG Tools** in the Actors directory syncs now. D&D 5e gets HP, AC and biography; Pathfinder 2e gets HP.
- **HP** changed in Foundry goes back to RPG Tools.
- Linked actors have an **RPG Tools rolls** window whose buttons roll in Foundry (dice are translated: `!` becomes `x`, `>=N` becomes `cs>=N`).
- **Public chat rolls** go to the campaign's Discord. Whispered, blind and unreadable ones don't.
- **Encyclopedia pages, quests and session recaps** come in as **journals** in an *RPG Tools* journal folder. Players see the parts RPG Tools shares with them, and nothing else. They are one way, from RPG Tools.

The module is tested against a stand-in Foundry; it has not yet been tried in a real Foundry world. Scenes, tokens, tables, calendar and the combat tracker are planned.

## The bridge API (for other apps)

Documented in `docs/encyclopedia/bridge-api.md` in the repository. It serves campaign info, characters as `rpgtools-sheet` files (list, read, create, update with a conflict check, HP), pages, quests and session recaps as Markdown with their visibility, and rolls. Writes never change the stat form or shared world pages. 240 requests a minute per key.
