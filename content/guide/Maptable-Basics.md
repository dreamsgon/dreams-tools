# Maptable basics

Maptable is the table-running tool: scenes with a map image or a drawn map, tokens, fog, measuring, initiative and dice. It also supports square and hex grids, conditions, auras, saved crops, player exports and JSON backups.

## Campaigns and scenes

![A Maptable scene with tokens and the Tokens panel](images/maptable-board.jpg)

- Maptable opens on the **Scene Picker** for the campaign you were last in: its **scenes as a picture grid** grouped by folder, with a **Continue** card at the top, under the campaign's banner picture when it has one. Switch campaigns with the campaign switcher at the top. Maps not in a campaign have a picker of their own, linked at the bottom.
- Each campaign's home page is its **dashboard** on the Campaigns page (`/campaigns/<campaign>`). The **Dashboard** link at the start of Maptable's header goes there; Maptable has no list of every campaign of its own. Make and organize campaigns on the **Campaigns** page.
- **All scenes** in the left rail (and **Scenes** at the top on a phone) goes back to the Scene Picker from a map.
- The **Scenes** panel has one **New** menu: upload a map, blank scene, area, world, split, copy from another campaign, or new folder. Each scene has a settings button (General, Map image and Size tabs, saved as you go).
- The scene name in the header opens a **quick switcher**, with previous and next arrows.
- **Map kinds**: Encounter, Area or World. The **Exploration** panel sets the kind, lists linked maps, and edits **markers** (target map, single or double click, colour, folder, notes, hidden).
- **Saved crops** sit in the bar above the map. Phones keep a Crops button on the map. An empty map offers *Upload a map* and *Add token*.
- **Drag-and-drop**: tokens can be dragged with Select no matter which panel is open (except while editing fog).

## Tokens

The **Tokens** panel (top to bottom): Make token, a Quick token, the token gallery link, the selected token strip with Edit, the token list (search appears from six tokens), then Initiative. Posting to Discord is folded under *Post to Discord*; campaign token defaults are at the bottom.

The **token gallery** is a compact tile grid: search, Party / Allies / Neutral / Enemies chips, *This campaign / All campaigns*, collapsible folders and a ⋯ menu to move, duplicate or delete. Its **From the Wiki** tab lists characters of the paired Wiki campaign and its world's shared lore, with their pictures (framed token circle and ring colour) copied into Maptable.

**Right-click a token** for its menu: Status (Active, Unconscious, Dead), conditions, show/hide, delete and more. A token linked to a Wiki character also offers *Roll from <name>'s sheet*, and its Statblock tab shows the character's pasted statblock.

![Right-click menu on a token](images/token-right-click.jpg)

## Token controls

### Moving and measuring (the drag ruler)

- With movement measuring on, dragging a token shows the distance beside it and each waypoint's leg. The Measure tool does the same.
- Give a token a **speed** in *Edit token › Movement*. Squares or hexes within its speed turn **green**, a dash (twice the speed) turns **amber**, and anything beyond turns **red**, across the whole footprint of a large token.
- Hold **Alt** while dragging to skip the grid and measure that leg as a straight line.

### Selecting, copying and grouping

| Do this | Result |
|---|---|
| Shift-click | Add or remove tokens from the selection |
| Shift-drag | Draw a selection box |
| Drag any selected token | Moves them all |
| Ctrl/Cmd+C, Ctrl/Cmd+V | Copy tokens (and their attached auras) and paste at the pointer, in this or another scene or campaign; names count up (Bandit 3, Bandit 4) |
| Ctrl/Cmd+D | Duplicate one square away |
| Ctrl/Cmd+G | Group the selection so clicking one selects all and they move together |
| Ctrl/Cmd+Shift+G | Ungroup |

### Turning, resizing and flipping

A selected token shows a dashed footprint box, a gold **turn knob** (15° steps, Alt for free turning) and a corner handle that resizes in whole squares (½ and ¼ below one; Alt for free). A small bar above it turns 90°, flips across or up and down, steps the size (Tiny ½ up to Gargantuan 20×20) and resets.

| Key | Action |
|---|---|
| `[` `]` | Turn 90° |
| `{` `}` | Turn 15° |
| H / V | Flip across / up and down |
| `-` `=` | Resize |

These apply to every selected token. **Shift + scroll** over a selected or hovered token, area, aura, object or text label steps its size. Facing shows as a small notch.

> **Tutorial: stage an ambush in two minutes**
> 1. Open an Encounter scene and place a Bandit token from the gallery.
> 2. Press **Ctrl+C**, then **Ctrl+V** three times. You now have Bandit 2, 3 and 4.
> 3. **Shift-drag** a box around all four and press **Ctrl+G** to group them.
> 4. Drag the group into the trees, press **]** to turn them toward the road.
> 5. Set one Bandit's speed to 30 ft in *Edit token › Movement* and drag it to see green, amber and red squares.

## Fog, areas and notes

- **Fog** can be edited manually and revealed by area. On a hex scene the Fog panel also has **Reveal around party tokens**, which clears the hexes around party tokens as they move (see [Hex map generator](Hex-Map-Generator)). Player previews and exports use opaque fog and hide hidden tokens.
- **Areas** on area and combat maps can open a section of a Wiki page. In the Exploration panel use *Draw an area* with a box or a click inside a drawn room.
- **Markers** hold read-aloud text and up to 20 linked Wiki pages. Selecting one opens a note card with a *Players see this note* switch. Drag a page from the Exploration list onto the map to pin it.
- **Links from the Wiki**: write `[[maptable:<scene>|Label]]` in a page for an *Open in Maptable* card; the Write mode has a scene picker.

## Lights and darkness

A map drawn in the Map Creator can have lights (see [Map Creator](Map-Creator)). In Maptable, lights glow on the map, and places no light reaches can be shaded.

Open the scene's settings and choose the **Lights** tab (it appears for drawn maps):

- **Where no light reaches**: **Daylight** (everything can be seen, lights only add glow), **Dim** (unlit places are shaded for players) or **Dark** (unlit places are dark for players). You see them lighter than players do, so you can still run the map.
- **Lights on this map** lists every light with a switch to light or put it out during play, plus **Light all** and **Put all out**. The shading follows straight away.

![Player view of a dark map with two lit rooms](images/maptable-player-dark.jpg)

A light stamp that is a movable piece shines from where the piece is. Flicker shows only in the Map Creator. The same *Where no light reaches* setting is in the Map Creator's Map tab.

Universal VTT exports carry the lit lights and the ambient light.

## Initiative and combat

The Tokens panel's **Initiative** tracker has a turn bar and can be posted to Discord and kept up to date there. The AI connection can also start combat, advance turns and end combat (see [AI connections](AI-Connections)).

## Exports and backups

Export dialog: player-safe images and **JSON backups** (with embedded images if you want them portable). Keep backups private; they contain your campaigns.

## Other conveniences

- **Undo/Redo** icons live in the header.
- **Save chip** as described in [Getting started](Getting-Started).
- **Faster loading**: heavy tools such as the Map Creator, help and import dialogs load separately and are fetched while the browser is idle.
