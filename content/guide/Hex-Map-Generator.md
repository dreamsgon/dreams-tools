# Hex map generator

The hex map generator makes regional hex maps for hex crawls and overland travel. Find it in **Start a new map › Hex map** in the Map Creator.

![A generated hex map](images/hexmap-fire-isles.jpg)

## How it works

Settings are folded into **Biomes**, **Land**, **Terrain**, **Size**, **Look** and **Places** sections with a **live preview**, a **seed** and **Reroll**. On a phone the preview sits on top. The same seed and settings always give the same map.

### Land and terrain

- **Kind of land**: Mainland (sea on the sides you pick), Peninsula, Island, Archipelago, Crescent atoll, Strait, Mountain range, Basin, Lake country.
- Water, coastal shallows, mountains, relief, forest, rivers, lakes and wetlands are all sliders. **Rivers** run downhill to water or pool into a lake.
- **Size**: rectangle, hexagon or circle outline, up to 100 × 80 hexes, flat or pointed tops, **1 to 24 miles per hex**.

### Biomes

How biomes are chosen:

1. **One biome**: Temperate, Boreal, Tundra, Glacier, Desert, Savanna, Jungle, Swamp, Badlands, Volcanic, Blighted or Fey wilds.
2. **Climate**: hidden temperature and rainfall maps pick each hex's biome, colder to the north, with high ground colder and the coldest water frozen.
3. **Custom mix**: choose biomes, give each a share (1 to 6), reorder them, and arrange them as **Patches**, **bands** (N to S or W to E), **Rings** from the middle, or **By height**.

For Climate and Custom mix there is **Biome size** (Small to Huge), **Borders** (Sharp, Blended, Wide blend), **Smooth harsh borders** and **Rare wonders** (small volcanic, blighted or fey patches).

**Presets** fill everything except seed and size: Green frontier, Frozen north, Sunken isles, Sand sea, Jungle coast, Blighted marches, Fire isles and Every climate. It shows **Your own** once you change anything.

### Look

Pick **Painted** (colour with trees, peaks and dunes), **Flat colours**, or **Ink** (black and white on paper for printing). Turn hex outlines on or off, show **hex numbers** (column then row, like 0412), and add a **legend** in any corner listing biomes, terrain, water and rivers with the miles per hex. The same Look settings live in the Map Creator's Map tab, so you can change them later.

![Ink look in Maptable](images/hexmap-ink-in-maptable.jpg)

### Places

Add up to **12 settlements** (a city, two towns, then villages) on open land near rivers and coasts, spread apart and kept off the edge, with made-up names that suit the climate or plain *City / Town 1* names. **Roads** join them along the cheapest ground. Add up to **10 ruins, towers, caves, shrines and lairs** in the wilds. **Reroll places** moves them without touching the land. Ruins and lairs show only in the Map Creator and preview, never in the picture players get.

### Settings code

The **Settings code** section copies a `HEX1-…` code holding the seed, every changed setting and the look. Paste one to load it. Share codes with other GMs.

## Use it in Maptable

**Use in Maptable** sets a matching hex grid in miles and makes the scene an area map. You can make every place a GM-only marker on its hex (re-running replaces them). The Universal VTT export is hidden for hex maps.

> **Tutorial: a frontier hex crawl**
> 1. Start a new map › Hex map › Presets › *Green frontier*.
> 2. Set size to 40 × 30, 6 miles per hex, then **Reroll** until you like the coast.
> 3. Look: *Ink*, turn on *Hex numbers* and a *Legend* in the bottom-right.
> 4. Places: 8 settlements, 6 ruins. Copy the **Settings code** into your notes.
> 5. **Use in Maptable** with *Places become GM-only markers*.
