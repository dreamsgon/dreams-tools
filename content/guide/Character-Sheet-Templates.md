# Character sheet templates

A character sheet template sets up a game's sheet in one go: the stats and skills with their rolls, the trackers (hit points, hit dice), the Profile facts at the top of the page and the tabs a character gets. Import a ready-made one (D&D 5E, Pathfinder 2E, AD&D 2E, D&D 3.5E, Pathfinder 1E, Masks, City of Mist or Daggerheart), a file someone shared with you, or one an AI app makes for any other game.

## What a template brings in

- **Stats** go on the open campaign's stat form (Characters › Stat form), so every character in that campaign can use them. A stat with the same name as one already on the form is reused, not added twice.
- **The template** appears on the Templates page and under **Characters › Add character › Start from**. Characters made from it show only its stats, in its order, and start with its trackers. The form's other stats stay where they were, switched off on this template.
- An existing character can take it too: open the character, choose **Use a template**, and pick it. Its values stay; trackers it doesn't have yet are added.

## Import a ready-made template

1. Open the campaign in the Wiki.
2. Go to **Templates** and choose **Import**.
3. Under **Ready-made**, choose **Use this** beside the game. For a gestalt character, tick **Gestalt** on the card first.
4. Check what it adds, pick whether the template is for this campaign only or every campaign in the world, and choose **Import**.

| Template | What it has |
|---|---|
| D&D 5E character | The six abilities as score boxes with saves, Proficiency bonus, Armor Class, Initiative, Speed and Passive Perception, the 18 skills (tick a skill when proficient and its bonus works itself out), spell save DC and spell attack, and trackers for hit points, temporary HP, hit dice, death saves and Heroic Inspiration. Works for the 2014 and 2024 rules. |
| Pathfinder 2E character | Level, the six attribute modifiers, and Perception, saves, skills (two Lores), strikes and Class DC by proficiency: type the rank's bonus (0, 2, 4, 6 or 8) and your level is added once trained. Spell attack, spell DC and tradition. Trackers for HP, temporary HP, Hero Points, Focus Points, dying and wounded. |
| AD&D 2E character | Abilities that roll 1d20 at or under the score, exceptional strength, THAC0, descending Armor Class, movement and initiative, the five saving throws (roll at or over), the eight thief skills as percentages, weapon and nonweapon proficiencies, and hit points. |
| D&D 3.5E character | Ability scores, Fortitude, Reflex and Will (base save plus the ability), base attack bonus with melee, ranged and grapple, AC, touch and flat-footed AC, all skills by ranks (each Knowledge on its own), caster level, and HP, temporary HP and nonlethal damage. |
| Pathfinder 1E character | The same as 3.5E with Pathfinder's skill list, and CMB and CMD in place of grapple. |
| Masks character | The five Labels rolled with 2d6, the five Conditions as boxes to mark, playbook, hero and real name, Potential, and Influence, Relationships and Moment of Truth on the page. |
| City of Mist character | Four themes, each with its themebook, mystery or identity, power tags and weakness tag, and Attention and Fade or Crack trackers for each. Power rolls 2d6 plus your tags; Build-up and statuses. |
| Daggerheart character | The six traits with a Duality roll (Hope and Fear dice plus the trait), Evasion, Armor score, Major and Severe thresholds, Proficiency, spellcast trait, Experiences, domains and community, and trackers for HP, Stress, Hope and armor slots. |

**Gestalt.** The D&D 5E, Pathfinder 2E, D&D 3.5E and Pathfinder 1E cards have a **Gestalt** box: a character with two classes side by side at every level. That template puts both classes on the Profile (Class side A and side B), keeps spellcasting for each side, and starts the page with a table for what each side takes at each level. Numbers such as base attack bonus and saves take the better of the two sides.

Attacks, spells, items and features go on each character's own tabs. A campaign usually uses one game: stats are matched by name, so importing a second game into the same campaign reuses stats with the same name (like Strength or Perception) as they are.

## Make a template for any game with an AI

1. **Templates › Import**. Under **Make one with an AI**, type the game (for example *Pathfinder 2e* or *Mothership*) and choose **Copy prompt**.
2. Paste the prompt into ChatGPT, Claude or another AI app and send it. Add anything about your table: house rules, which skills you use, what players track.
3. Copy the whole reply and paste it into the box under **Paste the reply, or choose a file**. Chat and code fences around the JSON are ignored. A saved `.json` file works too.
4. Choose **Read it**, check what it adds, and choose **Import**.

If the AI gets something wrong, ask it to fix that and paste the new reply, or import it and change the stats in **Stat form** and the template on the **Templates** page. An AI app that can read web pages can also be pointed at this page for the full format.

## Share a template

**Export & import** (bottom of the Wiki sidebar) saves the template and its stats as a `.content.json` file: tick the template and the stats it uses. Import that file with **Templates › Import** or **Export & import › Import** in another campaign or account.

## The file format (for people and AI apps)

A template file is a content file: one JSON object with `"format": "rpg-tools-content"`, `"version": 1`, a list of `stats` and a list of `templates` (usually one character template). Anything left out is filled in on import: ids, visibility (players), empty lists.

### Stats

Each stat is one line of the sheet. Stats belong to the campaign, so every character in it shares the same list.

| Key | What it is |
|---|---|
| `id` | Short and unique: lowercase letters, digits and `-` (like `str`). Made from the label when left out. |
| `label` | The name on the sheet. Unique. Formulas use it. |
| `section` | The group it shows under, like Abilities or Skills. |
| `type` | `number`, `text`, `checkbox`, `select` (with `options`), `textarea`, or `none` for a stat with only rolls. |
| `visibility` | `players` (the default) or `gm`. |
| `look` | `score` draws a number as an ability score box with its modifier. Use it with `derived`. |
| `derived` | A worked-out number shown beside the value, like `floor(({value}-10)/2)`. For a score box it is the modifier. |
| `save` | `true` on a score box adds a saving throw under it. |
| `quick` | `true` puts the stat in the quick strip at the top of the sheet. |
| `rolls` | Up to 6 named rolls, like `[{"name": "Check", "formula": "1d20+{Athletics mod}"}]`. |
| `note`, `description` | A few words under the name, and a short tooltip. Write them yourself; don't copy rules text. |

**Formulas** use dice (`1d20`, `2d6+3`, `4d6kh3`, `2d20kh1`, `1d10!` exploding, `5d10>=8` successes, `4dF`), arithmetic (`+ - * / ( )`) and `floor`, `ceil`, `round`, `min`, `max`, `abs`. In braces:

- `{value}` is the stat's own value.
- `{Label}` is another stat's value, by its label.
- `{Label mod}` is the worked-out number of a stat that has `derived`, or a score box's modifier.
- A checkbox counts as 1 when ticked and 0 when not, so a proficient skill can be `{Dexterity mod}+{Proficiency bonus}*{value}`.

### The template

| Key | What it is |
|---|---|
| `name` | Like *D&D 5E character*. |
| `kind` | `character`. |
| `fields` | The info box beside the page, up to 30: `label`, `type` (`text`, `number`, `textarea`, `choice` or `multi` with `options`, `check`, `score`, `track` for current / max, `url`) and `visibility`. |
| `layout` | `{"facts": ["Player", "Class", "Level"]}`: the facts at the top of the Profile, up to 12. |
| `trackers` | Up to 8 gauges moved with − and +: `label`, `max`, `shape` (`bar`, or `pips` up to 20), `colour` (green, blue, amber, purple, red) and `value` to start at (full when left out). |
| `hiddenTabs` | Ready-made tabs this kind of character doesn't need: `statblock`, `stats`, `features`, `inventory`, `spells`. |
| `tabs` | Extra page tabs, like `[{"title": "Backstory", "visibility": "players"}]`. |
| `body` | The page's starting text, in Markdown. |
| `stats` | `{"order": [...]}`: the ids (or labels) of the stats this sheet shows, in order. Leave it out to show every stat in the file. |
| `icon` | Optional: the page icon, like `shield`. |

### An example

A small but complete file. A real sheet has more stats.

```json
{
  "format": "rpg-tools-content", "version": 1,
  "stats": [
    { "id": "prof", "label": "Proficiency bonus", "section": "Core", "type": "number", "quick": true },
    { "id": "ac", "label": "Armor Class", "section": "Core", "type": "number", "quick": true },
    { "id": "init", "label": "Initiative", "section": "Core", "type": "none", "quick": true, "derived": "{Dexterity mod}", "rolls": [{ "name": "Roll", "formula": "1d20+{Initiative mod}" }] },
    { "id": "str", "label": "Strength", "section": "Abilities", "type": "number", "look": "score", "derived": "floor(({value}-10)/2)", "save": true },
    { "id": "dex", "label": "Dexterity", "section": "Abilities", "type": "number", "look": "score", "derived": "floor(({value}-10)/2)", "save": true },
    { "id": "athletics", "label": "Athletics", "section": "Skills", "type": "checkbox", "note": "Str", "derived": "{Strength mod}+{Proficiency bonus}*{value}", "rolls": [{ "name": "Check", "formula": "1d20+{Athletics mod}" }] },
    { "id": "stealth", "label": "Stealth", "section": "Skills", "type": "checkbox", "note": "Dex", "derived": "{Dexterity mod}+{Proficiency bonus}*{value}", "rolls": [{ "name": "Check", "formula": "1d20+{Stealth mod}" }] }
  ],
  "templates": [
    {
      "name": "Adventurer", "kind": "character", "icon": "shield",
      "fields": [{ "label": "Alignment", "type": "choice", "options": ["Good", "Neutral", "Evil"] }],
      "layout": { "facts": ["Player", "Class", "Level"] },
      "trackers": [
        { "label": "Hit points", "max": 10, "shape": "bar", "colour": "red" },
        { "label": "Death saves", "max": 3, "shape": "pips", "colour": "green", "value": 0 }
      ],
      "hiddenTabs": ["statblock"],
      "tabs": [{ "title": "Backstory", "visibility": "players" }],
      "body": "## Appearance\n\n## Goals\n"
    }
  ]
}
```

## Good to know

- Stats need a campaign. In a world's shared lore with no campaign open, only the template is imported.
- A campaign holds up to 100 stats and a world up to 60 templates.
- Importing the same template again adds a copy named with (2); stats already on the form are kept as they are.
- A character from another game keeps working: switch stats on or off per template on the Templates page.
- To bring in one character's filled-in sheet rather than a blank template, use [Sheet import](Sheet-Import-Export-and-Google-Sheets).
