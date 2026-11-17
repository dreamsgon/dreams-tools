# Star systems and space

Run a space setting by drawing a galaxy, a sector, a star system and its planets. Everything is built from the Encyclopedia's **entry types**: Galaxy, Sector, Star system and (for a charted world) a place page. The space tabs are **GM only** for now; players see only tabs you share.

## 1. Galaxy

![A generated galaxy](images/galaxy.jpg)

Choose **Galaxy** as the entry type. The **Galaxy** tab draws it from its shape, arms and seed, with an Invented or Real chip, a short summary and five facts (type, size across, stars, age, distance), each typed in place.

**Real galaxy or generate**: pick the Milky Way, Andromeda, Triangulum, the Large Magellanic Cloud or Messier 87 (rounded published figures), or generate one from shape, arms, size and seed with a live preview and **Reroll** for a new name. The same settings always draw the same galaxy.

## 2. Sector

![A sector hex map](images/sector-hex-map.jpg)

On the galaxy's picture choose **New sector** and tap where it lies. A **Sector** is a hex map of that part of the galaxy, **one hex = 5 light years**.

- **Sector settings**: size (Small 8 × 5, Medium 12 × 7, Large 18 × 8 or Custom up to 30 × 20), number of systems, share that are only **rumours**, lanes, backdrop, colour and seed, with a live preview. **Generate again** keeps systems you changed.
- On a Milky Way page, start from the **Local Bubble**: the Sun and 13 real stars within 25 ly at about their real distances.
- On the **Hex map**, tap a hex to rename its system, change its star class, mark it charted or a rumour, write a note, see distance and light-speed time from another system, join or remove **lanes**, remove it, or add a system or rumour to an empty hex.

## 3. Star system

![A star system survey chart](images/survey-chart.jpg)

On a hex, press **Survey this system** to make a **Star system** page inside the sector (Sol gets real data). Its **Survey chart** tab shows:

- an animated orbit scene (Pause, Zones), with the **green zone** (liquid water) and **frost line**;
- worlds listed out from the star by zone, with travel time between neighbours, plus belts and moons;
- a **world sheet**: the sky from its surface, every field (kind, size, gravity, temperature, air, water, resources, hazard, life, who settled it, and a **Held by** organization), edited fields marked;
- **lock** a world to keep it when you survey again, **reroll** just that world, or **remove** it;
- the system's **hooks** (a lure, a danger and a GM-only secret) and a **travel calculator** (light speed, a 1 g torch ship, transfer orbit, FTL drives).

**Survey settings** picks the star and companions, a premise, how many worlds and of what kinds, the era, **Realistic** or **Pulp** science and which organizations have a foothold, then runs the survey again with a live preview. Science rules: green zone 0.95 to 1.37 × √L AU, frost line 2.7 × √L, complex life needs surface water, air and mild heat, and young O and B stars burn out before life gets far; Pulp bends these.

**FTL drives** (set once per galaxy): faster than light as a multiple of light speed, jumps with a range and a recharge, or lanes only. They add travel times to hex maps and survey charts.

### Start from a setting (AI)

In Survey settings choose **Start from › A setting (AI)**. Name a setting (a book, game, film or your own), optionally a system in it, and a note. Your own AI builds the system: its star, worlds and moons in order, what they are like, and a lure, a danger and a secret. Missing fields are filled in to fit each world's kind and orbit. You see a **preview** before pressing **Use this system**; locked and charted worlds stay. RPG Tools ships no setting's content. Without an API key, copy the prompt into your AI app and paste its JSON back.

### Check with your AI

Beside the Survey chart, **Check with your AI** sends the survey in words (star, zones, every world and moon, belts, the lure and the danger; never the secret) plus up to 8 pages you pick. It says what fits, what is a stretch and what doesn't, quoting your pages, and can offer a fix to one world's temperature, gravity, size, air, water, life, resources or settlement that you apply with a button.

## 4. Planet pages

On a world sheet press **Chart this world** to make a place page inside the system, starting from the survey notes. Its **World** tab shows the sky from its surface and all its survey fields; edits there and on the chart stay in step. It lists its moons (or the planet it orbits), each chartable. Removing a charted world from the chart leaves its page with its last survey. Then **Develop as world map** (see [World maps](World-Maps)).

## Space stamps

The Map Creator's Stamps tool has 63 stamps in four groups: **Stars** (each star class, white dwarf, neutron star, pulsar, black hole…), **Worlds** (rocky, desert, ocean, jungle, gas giants, ringed giant, city world…), **Space** (asteroids, comet, nebula, ion storm, wormhole, orbit ring, green zone band, waypoint…) and **Stations and ships** (stations, jump gate, beacon, derelict, space elevator, starship, shuttle, fleet…). Use them to draw star maps, system maps and stations.

> **Tutorial: from galaxy to a world map**
> 1. New entry › **Galaxy** › Real galaxy › *Milky Way*.
> 2. **New sector** on the picture, press Generate, then open the **Hex map**.
> 3. Tap a charted hex › **Survey this system** › Survey settings › *Pulp*, 6 worlds.
> 4. Pick a rocky world with water and press **Chart this world**.
> 5. On its World tab press **Develop as world map** and Generate.
