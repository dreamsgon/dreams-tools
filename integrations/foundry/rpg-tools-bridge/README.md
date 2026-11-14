# RPG Tools Bridge for Foundry VTT

This module keeps a Foundry world (v12 or v13) in step with one RPG Tools Encyclopedia campaign. It works with any game system. In D&D 5e it also fills in HP, AC and the biography. In Pathfinder 2e it fills in HP.

## Install

1. In Foundry, open **Add-on Modules › Install Module**.
2. Paste this manifest address and install: `https://<your RPG Tools site>/api/bridge/foundry/module.json`
3. Turn the module on in your world.
4. In RPG Tools, open the Encyclopedia and go to **AI & GitHub › Other tables › Connect a table**. Choose Foundry VTT and make a bridge key.
5. In Foundry, open **Configure Settings › RPG Tools Bridge**. Paste the address and the key.
   - Both are kept in this browser only, so players never receive the key.
   - Only the GM's browser talks to RPG Tools.

## What it does

- **Characters:** the campaign's player characters and companions come in as actors in an **RPG Tools** folder. A setting can bring in every character instead.
  - A character changed in RPG Tools is updated here within about 20 seconds.
  - **Sync with RPG Tools** at the top of the Actors directory syncs now.
- **HP:** HP changed here goes back to RPG Tools. This covers a token's bar, the sheet or a macro.
  - A character whose HP comes from a linked Google Sheet keeps that sheet's HP.
- **Rolls window:** a linked actor's sheet has an **RPG Tools rolls** button. It lists the character's skills, saves, attacks and other rolls from RPG Tools, and each one rolls here in Foundry.
- **Rolls to Discord:** public chat rolls go to the campaign's Discord rolls channel, as rolls made in RPG Tools do.
  - Whispered and blind rolls never go.
  - Rolls that use dice RPG Tools can't show (rerolls, for example) are skipped.

What syncs, and which way, is set on the bridge key in RPG Tools.

## Coming next

- Edits to an actor here (other than HP) aren't sent back yet. Change the character in RPG Tools, or export the sheet and import it there.
- Journals, quests, recaps, scenes, tokens and conditions, map notes, rollable tables, the calendar and the combat tracker come in the next parts.

The bridge API is described in `docs/encyclopedia/bridge-api.md` in the RPG Tools repository.
