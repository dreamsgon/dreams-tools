# Wiki basics

The Wiki is your campaign notebook. Open it at `/encyclopedia`. It holds **worlds** (shared lore) and **campaigns**, nested pages, character pages, maps, calendars with moons and seasons, weather and travel, templates and player sharing.

## Pages inside pages

![A place page with its sidebar](images/encyclopedia-page.jpg)

Any page can hold sub-pages in the same campaign or shared lore; folders are not required as parents.

- **Drag** a page in the sidebar onto another to nest it, or onto a row's edge to place it before or after. Rows show how many pages are inside.
- **Arrange** (the arrows beside World Lore and Campaign Notes) shows every page with its name to rename in place and buttons to move it up, down, out of the page it is in, or into the page above. Press **Done** when you finish.
- **Customize sidebar** categories can list pages you pick, every page of some kinds or of one of [your own types](#entry-types), or every page with some of your Wiki tags. New pages join by themselves, and the **+** beside a category makes a new page that shows in it.
- **Add a heading** (in Customize sidebar) puts a heading you name, such as *The World* or *At the table*, above the sections that follow it. Folding the heading folds them all.
- Beside a page: its **sub-pages** (with **+ Sub-page**), **Mentioned in** (pages that link here, with the words around the link) and **Named but not linked** with **Link all**.
- In **Write** mode, type `[[` or `@` to list pages to link, and create a new page inside this one on the spot.
- **Hover** a link to preview the page. `{{word|note}}` adds a hover note to text.

## Writing

![The same page on a phone](images/encyclopedia-phone.jpg)

- A campaign's front page shows its banner picture behind the name. Use **Banner** on it (or drop a picture on it) to add or replace the picture, and **Reposition and zoom** to drag it where you want and zoom in; the Admin CP's **Banner** tab sets the same one. The campaign dashboard, Maptable's scene list and the forum show it too. Below are your sections, what changed lately, active quests and world lore.
- Page text is Markdown with wiki extras: info boxes, read-aloud boxes, columns, pictures, pages shown inside pages, styled words and HTML. The **Text** and **Page** buttons set how a page reads and looks, with a banner and an icon. In Write mode the **Insert** and **Style** menus add them and a preview shows the page beside the text. Everything you can type is in [Writing wiki pages](Writing-Wiki-Pages).
- Wrap GM-only text in a secret block (players never receive it):

  ```
  ::: secret
  Only the GM reads this.
  :::
  ```
- `[[1d20+5|Label]]` is a rolling chip. `[[table:Name]]` rolls a [random table](#random-tables). `[[maptable:<scene>|Label]]` is an *Open in Maptable* card.
- **Page history**: the text a page had before a save is kept (at most one version per ten minutes, the newest 20). Open history to compare and **restore**; a restore keeps the current text first.
- **Ctrl/Cmd+K** quick search, `#tag` for tags.

## Entry types

![New entry with Your types at the top and Deity chosen](images/new-entry-types.jpg)

**New entry** asks for a name and a type. Types are pills in groups, with a line on the right saying what the chosen one is. A type with info box fields shows them under the picker, ready to fill in.

| Group | Types |
|---|---|
| **Your types** | This world's [templates](#page-templates) (Settlement, Tavern, Creature…), the types you made, and **New type** |
| **Writing** | **Page** (a plain article, the default), Note, Lore, **Other** (anything else), Folder, Checklist |
| **People and places** | Character, Place, Organization, Map |
| **At the table** | Session, Quest, Store, Vehicle |
| **Space** | Galaxy, Sector, Star system |

### Your own types

Press **New type** to make one: give it a name (*Deity*, *Spell*, *Ship class*), pick an icon, choose what it **works like** (Page, Note, Other, Character, Place, Organization, Lore, Session or Quest) and who can use it (this campaign, or every campaign in the world). A type is a [template](#page-templates) with an icon, so add its info box fields, tabs and starting text on the **Templates** page. Pages made from it get its icon, and their type pill shows its name.

### Change type

A page's type pill (while writing) and its side column have **Change type**. The page keeps its title, text, tabs, tags, links and place in the Wiki. If the old type had something the new one can't hold, such as a map, an organization profile or info box values, the dialog names it before you change. The icon follows the new type unless you picked one yourself. **Page history** can undo the change.

![Change type, turning an organization into a plain page](images/change-type.jpg)

## Page templates

Each world keeps templates (Settlement, Tavern, Organization, Item and Session to start; the Templates page can add Player character, NPC and Creature) with info box fields, tabs and starting text. **New entry** offers them, any page can be **saved as a template**, and **Use a template** applies one to a page you already have. A template can belong to one campaign or the whole world. A page's info box sits at the top of its sidebar; players see only the fields marked for players.

Info box fields can be:

| Field | Holds |
|---|---|
| Text, Long text, Number | Words or a number |
| **Score + modifier** | A score shown as its modifier, such as **+4** with 19 beside it. The modifier is (score − 10) ÷ 2 rounded down, or one you type in |
| **Current / max** | Two numbers, like hit points 68 / 90 |
| Choice, **Several choices** | One, or any number, of the choices you list |
| **Yes / no** | A tick box |
| Page link | Another page in the world |
| **Web link** | An `https://` address that opens in a new tab, for players too |

![An info box with a score, current / max, yes / no and a web link](images/template-fields.jpg)

## Organizations and character profiles

- The **Organization** page kind (stored as a faction) has a **Profile** tab with its own layout and types (Noble house, House, Family, Clan, Dynasty and more).
- **Character** pages also get a **Profile** tab, with the organizations they belong to, role and standing.
- **Drag a page** from the sidebar onto a profile to link it. A character shown on an organization's profile shows their role (Heir, Abbess).

## Characters and pictures

A character or **Creature** page can hold a **picture**. Press **Frame token** to drag a circle over it and set its map size and ring colour. **Add to Maptable** opens the paired Maptable campaign and adds the token once a scene is open. Players see the picture only when the Overview is player visible. Characters and sheets are covered in [Characters and the rollable sheet](Characters-and-the-Rollable-Sheet).

## Random tables

**Random tables** (a page in the Wiki) holds one library per account.

- Kinds: **dice-and-range** tables, **weighted lists**, **word pairs** and a **yes/no oracle** (odds, tension 1 to 9 per campaign, twists on doubles).
- Use a table in every campaign or only chosen ones; copy or share between campaigns.
- Import by pasting a book layout (ranges, `00` as 100, numbered columns, plain lists) or from `.json`, `.csv` or `.txt`; export as `.json` or `.csv`.
- Roll with `[[1d4]]` and `[[table:Name]]`. On a line of its own, `[[table:Name]]` shows the whole table with a **Roll** button that marks the row that came up.
- Starter tables are original, and can be added from the library page.

### NPC generator

A **Generator** page rolls labelled lines from your tables (a line called *Name* becomes the title), plus extra rolls such as a reaction or a topic. **Lock** lines to keep them, reroll one or all, then **Save as a character page** (in the campaign or world lore) or **Copy**. Starter NPC tables cover demeanour, wants, power, current focus, quirks, reaction and topic.

> **Tutorial: a tavern and its barkeep**
> 1. New entry › template **Tavern**, name it *The Gilded Goose*.
> 2. Add an NPC Generator page, roll, lock the Name and Quirk lines and reroll the rest, then **Save as a character page**.
> 3. In the tavern's text type `@` and pick the new character to link them, then add `[[table:Rumours]]` for a rumour roll.
> 4. Add a secret block with the barkeep's real agenda.

## The Codex

See [Quests and the Codex](Quests-and-Codex).

## Calendars, weather and travel

Calendars support moons and seasons, with weather and travel tied to map regions. The world map [hex crawl](World-Maps) advances the calendar as the party moves and uses the nearest weather region's forecast. A calendar templates reference is in the repository docs.

## Export & import

**Export & import** in the sidebar moves reusable things between worlds and campaigns, in this account or someone else's: random tables, templates (and so your own types), character stats, calendars, quest categories, kinds of tie, vehicle types and items and spells settings.

- **Export**: tick what to take (whole groups or single items) and press **Export**. You get one `.content.json` file. A table that rolls on another table brings that one along.
- **Import**: open the world or campaign it should go into, choose the file, untick anything you don't want and press **Import**. Everything comes in as a copy with new ids, so nothing already there changes (Items and spells settings are the exception: they are replaced). Stats, calendars, quest categories and item settings need a campaign open. You choose whether imported tables are used in this campaign or every campaign, and whether templates are offered in this campaign or the whole world.
- Pages are not included. To move a whole campaign with its pages, use **Download backup** on the Campaigns page.

![Export & import, choosing templates to export](images/export-import.jpg)

## Settings, import and backup

Settings can export all worlds or one campaign as JSON, and import JSON (imports make separate copies). Each campaign, and each world’s shared lore, can hold up to 2 MB, and you can raise that to 5, 10 or 20 MB in Settings, Storage; atlas images allow up to 8 MB each. Backups can contain GM-only material: keep them private.

The floating **AI** and **Dice** buttons sit in the Wiki's footer row, so they never cover the end of a page.
