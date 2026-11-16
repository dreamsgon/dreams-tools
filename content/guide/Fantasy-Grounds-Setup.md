# Set up Fantasy Grounds

Move characters and monsters between **Fantasy Grounds Unity** and RPG Tools as JSON files. A small **extension** in Fantasy Grounds does the work. It runs only when you type a command in chat.

- **Import into Fantasy Grounds:** RPG Tools sheets, and monster or character JSON from places like **Open5e**, the **D&D 5e SRD API** and **5etools** bestiary files. Each one becomes an **NPC**. One file can hold one creature or a whole list.
- **Export from Fantasy Grounds:** any NPC, or a player character, as an RPG Tools sheet that RPG Tools' **Import a sheet** reads.

Fantasy Grounds doesn't need a bridge key. It can't reach the web, so it never talks to RPG Tools directly. You carry the files across, or copy and paste.

## What you need

- **Fantasy Grounds Unity**, with a campaign that uses the **5E** ruleset. The extension only shows up for 5E campaigns.
- To import, you need to be the **GM** (the host). Players can export their own characters.

## 1. Get the extension

1. In RPG Tools, open the **Encyclopedia** and go to **AI & GitHub › Other tables › Connect a table**.
2. Under **Fantasy Grounds**, press **Download the extension**. You get a file named `rpg-tools.ext`. Don't unzip it.

The file is at `/api/bridge/fantasygrounds/rpg-tools.ext` on your RPG Tools site.

## 2. Add it to Fantasy Grounds

1. Find your Fantasy Grounds data folder. On the Fantasy Grounds launcher, press the **folder** button at the top, or open **Settings** and look at **Data folder**.
2. Put `rpg-tools.ext` in its `extensions` folder.
3. On the launcher, choose your campaign and press **Load**. In the list of extensions on the right, tick **RPG Tools**, then start the campaign.

When the campaign opens, chat says *RPG Tools 0.1.0: type /rpgtools to import or export JSON*. To update the extension later, replace the file and reload the campaign.

## 3. Import a file into Fantasy Grounds

1. In chat, type `/rpgtools import`.
2. Choose the JSON file in the window that opens.

Each creature in the file becomes an NPC in your **NPCs** list, and a message in chat lists them. You can drag them onto the combat tracker like any NPC.

**From the clipboard:** copy the JSON's text, for example from a web page or an RPG Tools export, and type `/rpgtools paste`.

Importing a creature with the same name again updates the NPC the extension made before, instead of making a copy. An NPC you made yourself with the same name is never touched. The extension adds a new one beside it.

### What you get

| From the file | On the NPC |
| --- | --- |
| Size, type and alignment | The NPC's size, type and alignment, read from the summary (like *Small humanoid (goblinoid), neutral evil*) |
| HP, AC and speed | HP, AC (with the armor in brackets) and speed |
| Ability scores | The six scores and their bonuses |
| Saves and skills | *Saving Throws* and *Skills*, like `Dex +4` and `Stealth +6` |
| Challenge rating | CR and XP |
| Senses, languages, resistances, immunities | The fields of the same names |
| Traits, actions, bonus actions, reactions, legendary actions | The NPC's lists. Actions written like the rules (*Melee Weapon Attack: +4 to hit … Hit: 5 (1d6 + 2) slashing damage*) roll in Fantasy Grounds as usual. |
| Attacks that have no action of their own | New actions, written so that Fantasy Grounds can roll them |
| Notes, other fields, trackers, inventory, other rolls | The NPC's **Other** tab |

A player character from RPG Tools comes in as an NPC too, which works for allies and for checking a sheet. Fill in a player's own character sheet in Fantasy Grounds as usual.

## 4. Export from Fantasy Grounds to RPG Tools

1. In chat, type `/rpgtools export` and the NPC's or character's name, like `/rpgtools export Goblin`. The start of a name is enough when only one matches.
2. Choose where to save the file.
3. In RPG Tools, open the character (or **Characters › Import sheet** for a new one) and choose **Import a sheet**. Upload the file.

**To the clipboard:** type `/rpgtools copy Goblin` instead, and paste the text into **Import a sheet**.

An NPC brings its ability scores, HP, AC, speed, CR, saves, skills, senses and other details, its traits and actions (attacks with a to-hit and damage become rolls), and its notes. A player character brings its ability scores, saves, skills, HP, AC, speed, initiative, weapons' to-hit, features, traits, feats, inventory and notes.

See [Sheet import, export, Google Sheets](Sheet-Import-Export-and-Google-Sheets) for the check step.

## Moving between RPG Tools and Fantasy Grounds

- **RPG Tools → Fantasy Grounds:** on a character's sheet, choose **⋯ › Export as .json**. In Fantasy Grounds, type `/rpgtools import` and choose the file.
- **Fantasy Grounds → RPG Tools:** run `/rpgtools export` with the name, and import the file with **Import a sheet**.
- **Monsters from the web:** save a monster's JSON from Open5e, the 5e SRD API or a 5etools bestiary file, and import it straight into Fantasy Grounds.
- **Roll20 and Fantasy Grounds:** export from one as an RPG Tools sheet and import it into the other. See [Set up Roll20](Roll20-Setup).

## If something isn't right

| What you see | What to do |
| --- | --- |
| `/rpgtools` does nothing | Check that **RPG Tools** is ticked in the campaign's extensions, and that the campaign uses the 5E ruleset. |
| "Only the GM can import" | Import on the GM's (host's) Fantasy Grounds. |
| "Its JSON can't be read" | The file is cut short or isn't JSON. Download or copy it again. |
| "… holds no RPG Tools sheets or monsters" | The file isn't one of the shapes the extension knows. Import it into RPG Tools with an AI first (see [Sheet import, export, Google Sheets](Sheet-Import-Export-and-Google-Sheets)), then export it from there. |
| "There's no NPC or character named …" | Check the spelling. Players can only export characters they own. |
| "More than one NPC or character matches" | Type more of the name. |
| An action doesn't roll | Open the NPC and check the action's text reads like the rules, with *+4 to hit* and *Hit: 5 (1d6 + 2) slashing damage*. |

Type `/rpgtools` on its own to see the commands in chat.

## Good to know

- **Up to 1,000 creatures** come in per import, so a whole bestiary file works.
- **Nothing syncs on its own.** Each move is an import or an export, and rolls don't pass between Fantasy Grounds and RPG Tools while you play.
- **5E only, for now.** Other rulesets may come later.
- **Status:** the extension is tested against a stand-in Fantasy Grounds, not yet in many real campaigns. Tell us what breaks.
