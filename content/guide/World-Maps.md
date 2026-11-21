# World maps

World maps live in the **Wiki** (a map page in a campaign or a world's shared lore). They can be painted by hand, generated, drawn from a sketch, zoomed into closer maps, used for hex crawls, and sent to Maptable.

## The map editor

On a map page choose **Open map editor** for the full-screen editor: tools on a rail, the map in the middle and an inspector on the right.

| Key | Tool |
|---|---|
| V | Select |
| B | Terrain (round brush; `[` and `]` resize; *Only paint on land*) |
| P | Place |
| I / O / K | River / Road / Border (freehand lines) |
| T | Label |
| S | Stamp (landmarks) |
| L | Shape land |
| Z | Zoom in |
| F | Fog |

- Terrain is painted onto a finer raster than the map cells. Maps draw as smooth shapes with mountains, hills, trees and marsh symbols.
- **Places** have a kind (City, Town, Village, Castle, Dungeon, Ruin, Landmark, Camp) with its own symbol or a numbered pin, can link an **area map** that opens from the inspector, and can link a campaign page. In a place's notes, **Roll a hook** adds a lure, some trouble and someone to meet (who they are, what they want and what they hide), suited to its kind.
- **Rivers, roads and borders** are smooth curves with names written along them, either GM only or shared. Select a line or name to rename, restyle or delete it. Undo takes it back.
- **Labels** write names across the map in three sizes.
- A **compass** and **scale bar** are optional.
- Clicking a place, a named line or a label opens a card with its linked page's opening lines and info box, GM secrets and the pages inside it, plus *Open page*, *Area map* and *Change page*.

### Icons and stamps

38 built-in icons in Settlements, Strongholds, Sci-fi, Nature, Wonders and Strange. The Place tool picks a settlement icon before you click; the **Stamp tool (S)** puts a landmark straight onto the map, named after its icon. A selected place can change icon or go back to a pin. **Your own icons**: PNG, JPEG or WebP up to 1 MB, up to 40 per map. Players see only the uploaded icons used by places they can see.

### Styles

Map settings › **Style**: **Painted**, **Old atlas** (parchment, brown ink, wave lines, double frame) or **Ink** (black and white for printing). Pick Serif, Plain or Hand place names at three sizes, add a legend built from what the map uses, and an optional title cartouche.

## Generate a world

Press **Generate** in the editor (or *Generate a new landscape* on a map page). A live preview updates as you change things; the same seed gives the same world.

- **Continent, Coast, Archipelago, Inland**: choose how far it spans (Region 200 mi, Kingdom 600 mi, Continent 2,000 mi), sea level, mountains, climate (Cold, Temperate, Warm, Mixed) and a seed. Named rivers run mountains to sea, towns can be added near the coast, roads join them. Regenerating keeps anything you drew or added notes to.
- **Whole planet**: a 2:1 map that wraps east to west, built from 14 tectonic plates, wind and rain with rain shadows, and biomes from warmth and rain.

![The Whole planet panel](images/planet-panel.jpg)

### The planet panel

Folding sections **Planet**, **Land**, **Biomes** and **Places**:

- **Planet**: nine kinds shown as small previews (Earth-like, Supercontinent, Many islands, Ocean, Desert, Ice, Jungle, Tidally locked, Volcanic), plus water, temperature, rain, day and night, tilt, life and size.
- **Land**: continents, one supercontinent, mountains, volcanoes, coastline and islands.
- **Biomes**: turn each land biome on or off and see its share of the land.
- **Places**: towns, rivers, roads and landmarks.

The preview switches between a **flat map** and a draggable **Globe**. It shows land, ice and livable land shares by true surface area and **built-in checks** for settings that don't hang together.

### Draw by hand and Shape land

**Draw by hand** starts a planet of empty sea. **Start drawing** opens the **Shape land (L)** tool with Draw land, Draw sea, Raise, Lower and Flatten, a brush size and a strength. Raising turns lowland into hills, then mountains, then snowy peaks. With *Climate follows the land* on, newly shaped land takes the biome its warmth and rain give it. **Redo rivers and towns** remakes them for the land as it is now, keeping places you edited.

### From a picture

**From a picture** reads a sketch, a photo of a hand-drawn map or a map from another tool (or the built-in sample sketch). It is read in your browser and never uploaded; only the map made from it is kept. Choose how land is told apart (Auto, Dark on light, Not blue, Light on dark), the ink threshold, how closely coasts follow the picture, and whether darker land is higher. Pick how much it is: Whole planet, Continent, Kingdom or Region.

![A map made from a sketch](images/from-a-sketch.jpg)

## Zoom in to closer maps

The **Zoom in (Z)** tool frames a spot on a painted map and makes a closer **Continent**, **Kingdom**, **Region** or **Hex area map** (20 × 14 six-mile hexes). The closer map keeps the same seas and biomes, adds detail, and brings along the places, rivers, roads and names inside the frame. After that each map keeps its own changes (places are copies, not shared). The bigger map shows closer maps as framed, clickable outlines (*Show › Closer maps* hides them).

## Hex crawls on area maps

On a map with a hex or square grid:

- Select a cell to **name it, write notes** (GM only, or shared once explored; **Roll a hook** adds what is there and a twist, by terrain) and pick an **encounter table** from your Random tables library (or a default for the map) with a **Roll** button.
- **Put the party on the map.** Select another cell to see distance, travel time at a **slow, normal or fast** pace (18, 24, 30 miles a day) and extra time for forest, hills, marsh, mountains and snow. Roads ignore terrain; open water blocks the way.
- **Move party here** walks the hex line, explores the cells passed and around the destination, stamps when noted hexes were explored, advances the **campaign calendar** with weather forecasts, and rolls encounter checks (1 in 8, 6 or 4 per hex). **Make camp** starts the next day.
- A place on a world map has **New area map**, which makes a 20 × 14 crawl of 6-mile hexes named after it and linked back.

## Player view and Maptable

- **Player view** shows the map exactly as players get it: shared places, lines, names and notes in explored cells only, with a soft parchment fog.
- **Use in Maptable** draws the map (without GM-only lines and names) as a 2,400 px picture on a world or area scene. Places become markers (a double-click opens their area map), explored cells become fog reveals, and the grid is laid over the cells. Using it again updates the same scene and keeps its tokens. When the party moves on an area map, its place is revealed on every fogged map that links to it.

## Check with your AI

Under **Built-in checks** in the Generate dialog, choose up to 8 campaign pages to check the world against and optionally a note on what to keep in mind. An API-key connection (see [AI connections](AI-Connections)) sends the settings in words, a summary of the map as made, and the pages. Findings say **Fits**, **A stretch** or **Doesn't fit**, with a quote from a page, and offer an **Apply** button for a setting change. Nothing changes until you press it. Without a key, **Copy prompt for my AI app** copies the same request.

![An AI check of a world](images/ai-check.jpg)

## Develop a charted world

On a [planet page](Star-Systems-and-Space) from the star system generator, **Develop as world map** makes a world map page under the planet, with settings taken from the survey (temperature, water, air, gravity, day locked to its star, life, size, hazards and how settled it is). Gas and ice giants are skipped; chart a moon instead.

> **Tutorial: from a sketch to a hex crawl**
> 1. Create a map page in the Wiki and press **Open map editor**.
> 2. **Generate › From a picture**, try the sample sketch, set *Kingdom* and press Use this map.
> 3. Press **Z** (Zoom in), frame the coast and choose **Hex area map**.
> 4. In the new map, select a hex, add a note and an encounter table, put the party on it and select a far hex to see travel time. Press **Move party here**.
> 5. **Use in Maptable** to run it with fog.
