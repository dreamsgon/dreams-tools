# Dungeon generator

The generator makes a whole map from a **seed**: rooms and passages, doors, floors, furniture, lights and a room key. Find it in **Start a new map › Generate** in the Map Creator. Everything it makes is ordinary shapes, so you can move, restyle or delete any of it afterwards.

![The generator dialog with lighting controls and a preview](images/dungeon-generator-dialog.jpg)

## Pick a layout

Generate shows a row of cards:

| Card | What it makes |
|---|---|
| **Branching passages** | Rooms off a main route, with side branches |
| **Classic halls** | A great hall, wide halls, rooms along them |
| **Caverns** | Natural caves, chambers and pools |
| **Building** | One building split into rooms |
| **Village** | Roads, houses and a square |
| **Wilderness** | Clearings, paths, a river |
| **Hex map** | A region of hexes; see [Hex map generator](Hex-Map-Generator) |

A live preview sits beside the settings. The same seed and settings always make the same map.

## Layout settings

The **Layout** section changes with the card you picked. Choose a **Map size** (Small 24×18, Medium 32×24 or Large 44×32 squares) and the number of **Rooms** (**Chambers** for caverns, **Houses** for a village). Then:

- **Branching passages**: Room size, **Branching** (low follows one main route, high grows side passages), **Loops**, and passages 1 or 2 squares wide.
- **Classic halls**: Room size, **Cross halls** and passage width.
- **Caverns**: **Openness**, **Rough walls** and **Pools**.
- **Building**: Building size, **Extra doors**, a **Shape** (Rectangle or L-shape) and **Windows**.
- **Village**: **Roads** (Main street, Crossroads or Ring road), a **Palisade** with gates on the roads, and **Fields**.
- **Symmetry** (Off, Left-right or Top-bottom), for passages, halls and caverns. A mirrored map is entered on its mirror line, so the entrance may move.
- **Curved rooms** for passages and halls.
- **Entrance**: Any, N, S, E or W.

## Look

The **Look** section sets the **Style** (the suggested one is marked), then, for every layout but Wilderness:

- **Floor**: Plain, Flagstones, Boards, Tiles, Cobbles or Earth.
- **Walls**: Thin, Medium or Thick, and for dungeons and caverns the **Outside**: Hatched or Solid.
- **Doors**: Wood, Iron, Open arch or Mixed. An open arch lets light and sight through.
- **Secret doors**: how many. A secret door looks like wall, and the Map Creator marks it with an **S**. Universal VTT exports treat it as wall.
- **Grid on the floor**.

You can change a room's floor and a door's kind later in the **Selected** tab.

## Dressing

**Furnish rooms** fills the rooms. Pick a **Theme**:

- Dungeons and caverns: Crypt, Bandit hideout, Sunken temple, Old mine.
- Buildings: Manor, Tavern, Temple.
- Villages: Farming village, Market town.

The **Room mix** gives each kind of room in the theme a share from 0 to 9. The entrance and the last room of a dungeon have their own purposes. Every room gets the thing its name promises first (a forge in a Forge, a bed in a Bedroom), and a room too small for it takes another purpose whose thing fits. **Clutter** adds smaller things. **Columns** and **Column density** are for passages, halls and buildings.

## Lighting

Tick **Add lights** and set **How many**, which **Kinds** (Torches, Braziers, Candles, Magic) and **Rooms left dark**. Dark rooms keep their lamps, unlit. Lights have their own seed, so changing them leaves the furniture alone. See [Map Creator](Map-Creator) for what lights do.

## Seed, rerolls and presets

- **Reroll layout** gives a new seed: new rooms and new dressing.
- **Reroll dressing** keeps the rooms and puts new things in them.
- **Your presets** save the layout, settings, style, floor and theme on this device. **Save these settings** adds one, the **X** removes it. *Crypt, 9 rooms* and *Tavern* come ready made.

## The room key

With **Number the rooms** on, each room carries a number. The **Room key** under the preview (GM only) lists each room's name, what is in it, and whether it is dark or has a secret door. The numbers keep that text: select a number label and edit **Room name (GM only)** and **GM note** in the Selected tab. In **Use in Maptable**, *Numbered rooms become markers* makes them GM-only markers named and noted from the key.

> **Tutorial: a haunted crypt with a key**
> 1. Start a new map › Generate › **Branching passages**, size Medium, 9 rooms.
> 2. Look: Floor *Flagstones*, Doors *Mixed*, move **Secret doors** up a little.
> 3. Dressing: Theme *Crypt*, **Number the rooms** on.
> 4. Lighting: **Add lights**, **Rooms left dark** 20%. Press **Reroll dressing** until the rooms please you, then **Save these settings** as a preset.
> 5. **Use this map**, then **Use in Maptable** with *Numbered rooms become markers*. In Maptable's scene settings, **Lights** tab, set *Where no light reaches* to *Dark*.
