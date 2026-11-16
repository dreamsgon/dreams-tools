# Map Creator

The Map Creator draws battle maps (dungeons, caves, villages, wilderness) and sends them to Maptable. Open it from Maptable (*New › …* or *Add scenes*) or from the Maptable header.

![Use in Maptable dialog](images/map-creator-pieces.jpg)

## The layout

- **Left rail**: drawing tools with one-key shortcuts. **V** Select, **R** Room, **P** Shaped room, **C** Round room, **O** Oval room, **W** Wall, **A** Curved wall, **F** Freehand, **D** Door, **N** Window, **S** Stamps, **T** Label.
- **Right inspector**: **Selected**, **Layers**, **Style** and **Map** tabs.
- Sizes are in feet with a live size label. Rooms **snap to the Maptable grid squares** (70 px by default); hold **Alt** to draw freely.
- **Ctrl+scroll** zooms, **Space-drag** pans, **Ctrl+D** duplicates, Undo/Redo are in the header.

## Drawing

- **Rooms join.** A room drawn touching another merges into one shape. Press Ctrl+Z, or hold Alt, to keep them apart.
- **Doors and windows** snap into the nearest visible wall and take its thickness: click for a one-square opening or drag for a span.
- The **Shape** tool draws rooms corner by corner. Drag a rectangle's corners to resize it, or use **Add corner** to turn a rectangle into a shaped room.
- **Map size**: type the width and length (Enter or leaving the box applies), use − and +, and pick which side stays put in a 3×3 picker. Handles on the map's edges also resize it; shrinking warns how much will be cut off.

## Styles

The **Style** tab has Plain plus five presets: **Dungeon stone**, **Old parchment**, **Cave**, **Ink on white** and **Timber hall**, plus saved custom styles (kept in this browser). Fine-tune walls (solid, double line, rough stone), the outside (hatched, solid, see-through), floor grid lines, shadow and colours. Switching style recolours rooms that used the old style's colours and leaves rooms with their own floor alone. Maptable draws the same result.

## Stamps

Press **S** for the Stamps tool: a searchable library in groups (Dungeon, Furniture, Outdoors, plus four space groups: Stars, Worlds, Space, Stations and ships). Click to place or drag one from the library. Stamps fill whole squares and snap to the grid (Alt places freely). Turn a selected stamp a quarter at a time with **R** / **Shift+R**, or by any angle with the slider; flip and resize in squares.

**Your own stamps**: upload a picture in the Stamps tool, say how many squares it covers, then place, turn and flip it like any stamp. Uploaded stamps become Maptable assets of kind *stamp* (Assets › Map stamps).

## Start a new map

**Start a new map** (header, Map tab, or the empty Selected tab) offers:

- **Generate**: a dungeon, cave, village or wilderness from a **seed**. Choose size, how many rooms and a style, then **Reroll**. The same seed always gives the same map, as ordinary editable shapes with numbered rooms, doors and stamps.
- **Hex map**: see [Hex map generator](Hex-Map-Generator).
- **Trace an image**: place a picture over the drawing at half strength to trace. It stays on your device and is never saved.
- **Blank map**: pick a size and style.

The **Label** tool (T) places text, optionally in a circle for room numbers.

## Use in Maptable and export

**Use in Maptable** shows the map and size and lets you:

- put the new scene in a campaign or folder;
- line the scene grid up with the drawing;
- start with **fog** over the whole map;
- turn **numbered rooms** into GM-only markers (re-running replaces the old ones);
- turn stamps into **movable pieces** you can drag and turn mid-fight.

**Export image** downloads a PNG drawn by the same code as Maptable. **Export Universal VTT** downloads a `.dd2vtt` with the image, grid, walls for line of sight, and doors and windows as portals; Maptable's *Upload a map* importer reads it back.

> **Tutorial: a numbered dungeon in 5 minutes**
> 1. Start a new map › Generate › Dungeon, size Medium, style *Dungeon stone*, press Reroll until you like it.
> 2. Press **S** and drag a few crates from the Furniture group into a room.
> 3. Click **Use in Maptable**, choose your campaign, tick *Start with fog* and *Numbered rooms become markers*.
> 4. In Maptable, click room marker 3 and add read-aloud text.
