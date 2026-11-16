# Set up Roll20

Move characters and monsters between Roll20 and RPG Tools as JSON files. A small **Mod script** in your Roll20 game does the work. It runs only when you type a command in chat.

- **Import into Roll20:** RPG Tools sheets, and monster or character JSON from places like **Open5e**, the **D&D 5e SRD API** and **5etools** bestiary files. One file can hold one creature or a whole list.
- **Export from Roll20:** any character, as an RPG Tools sheet that RPG Tools' **Import a sheet** reads.

Roll20 doesn't need a bridge key, and it never talks to RPG Tools directly. You carry the files across.

## What you need

- A Roll20 game where you are the **GM**.
- A **Roll20 Pro** subscription on the account that created the game. Roll20 only runs Mod scripts for Pro games.

## 1. Get the script

1. In RPG Tools, open the **Encyclopedia** and go to **AI & GitHub › Other tables › Connect a table**.
2. Under **Roll20**, press **Copy the Roll20 script**. You can also press **Open the script** to see it in a new window.

The script is at `/api/bridge/roll20/rpg-tools-roll20.js` on your RPG Tools site.

## 2. Add it to your game

1. On your game's page in Roll20, open **Settings › Mod (API) Scripts**.
2. Press **New Script** and name it `rpg-tools-roll20.js`.
3. Paste the script and press **Save Script**.

The **Mod Output Console** below it should say *RPG Tools for Roll20 … ready*. To update the script later, paste the newer version over it and save again.

## 3. Import a file into Roll20

1. Launch your game. In chat, type `!rpgtools import`.
2. The first time, the script makes a handout named **RPG Tools import** in your Journal. Open it, press **Edit**, and paste the whole JSON file into its **GM Notes**. Then save.
3. Type `!rpgtools import` again.

Each creature in the file becomes a character in your Journal, and a message in chat lists them. Importing a character with the same name again updates it instead of making a copy.

> **Link a token at the same time.** Drop a token on the map and select it before you type `!rpgtools import`. If the file holds one creature, the token is linked to it and becomes its default token. A monster's tokens each keep their own HP, while a player character's tokens share one.

### What you get

| From the file | In Roll20 |
| --- | --- |
| HP and AC | `hp` (with its maximum) and `ac` attributes, shown on the token's first two bars |
| Stats and fields | One attribute each, named after the field, such as `strength` or `spell_slots_1st` |
| Trackers | Attributes with a current value and a maximum |
| Rolls, attacks, saves, initiative | **Token actions** that roll in chat. Initiative adds the token to the turn order. |
| Features, actions, traits, inventory | The character's **Bio** |
| Anything the file couldn't place | The character's **GM Notes** |

Dice carry over: `>=8` in RPG Tools is `>8` in Roll20, and both count successes the same way.

The script fills plain attributes. On a game sheet such as *D&D 5E by Roll20*, attributes with the same names (like `strength`) show the imported values, but the sheet doesn't fill in its own NPC section.

## 4. Export from Roll20 to RPG Tools

1. Select the tokens of the characters you want to move.
2. Type `!rpgtools export`.
3. Each character goes into a handout named **RPG Tools export:** followed by its name. Open it and copy all its text.
4. Save the text as a `.json` file, or keep it on your clipboard.
5. In RPG Tools, open the character (or **Characters › Import sheet** for a new one) and choose **Import a sheet**. Upload the file or paste the text.

A character that came from RPG Tools goes back with the same fields, trackers and rolls. A character made in Roll20 brings its HP, AC, speed and readable rolls. On a small sheet it brings every attribute, and on a big game sheet only the ability scores and a few details. Rolls RPG Tools can't read, such as ones that ask a question (`?{…}`), are listed for you in the check step.

See [Sheet import, export, Google Sheets](Sheet-Import-Export-and-Google-Sheets) for the check step.

## Moving between RPG Tools and Roll20

- **RPG Tools → Roll20:** on a character's sheet, choose **⋯ › Export as .json**. Paste the file into the *RPG Tools import* handout and run `!rpgtools import`.
- **Roll20 → RPG Tools:** run `!rpgtools export` and import the handout's text with **Import a sheet**.
- **Monsters from the web:** paste a monster's JSON from Open5e, the 5e SRD API or a 5etools bestiary file straight into the import handout.

## If something isn't right

| What you see | What to do |
| --- | --- |
| Nothing happens when you type `!rpgtools` | Check the script is saved under **Mod (API) Scripts** and the console says it's ready. Mod scripts only run in Pro games. |
| "Only the GM can use !rpgtools" | Log in as the game's GM. |
| "There is no JSON in the handout" | Paste the file into the handout's **GM Notes** (or its notes) and save the handout. |
| "The JSON in the handout can't be read" | Paste it again as plain text. A missing bracket at the start or end is the usual cause. |
| "Nothing in that JSON looks like a character or monster" | The file isn't one of the shapes the script knows. Import it into RPG Tools with an AI first (see [Sheet import, export, Google Sheets](Sheet-Import-Export-and-Google-Sheets)), then export it from there. |
| A roll button says something odd in chat | Open the character's **Abilities** and edit the token action. Re-importing replaces only the abilities the script made, never your own. |

Type `!rpgtools` on its own to see the commands in chat.

## Good to know

- **Up to 50 creatures** come in per import. Split bigger files.
- **Your own abilities stay.** Importing again replaces only the token actions the script made.
- **Nothing syncs on its own.** Roll20 can't reach RPG Tools, so each move is an import or an export.
- **Status:** the script is tested against a stand-in Roll20. It hasn't been tried in many real games yet. Tell us what breaks.
