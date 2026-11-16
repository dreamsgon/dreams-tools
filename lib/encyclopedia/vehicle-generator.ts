/*
 * The new vehicle generator: a name, a model line, stats, wear on the gauges, Right now, cargo and systems, rolled
 * from our own lists for the vehicle's outline (starship, sailing ship, airship, carriage, car, walker). Each outline
 * has a few templates (a freighter, a galleon, a mail coach…) and "any" picks one. Stats and Right now are matched by
 * their names, so a type the GM made with the same outline gets what fits and leaves the rest empty. The same seed
 * always gives the same vehicle, and nothing is saved until the GM uses it (`applyGenerated`).
 */
import { seeded } from "./world-generator.ts";
import { changeType, clampGauge, newVehicle, type Vehicle, type VehicleArt, type VehicleType } from "./vehicles.ts";

type Rng = () => number;
const pick = <T,>(rng: Rng, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
const between = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const someOf = <T,>(rng: Rng, list: readonly T[], n: number): T[] => { const pool = [...list], out: T[] = []; while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]); return out; };

/** One stat or Right now value: a fixed list to pick from, or a number range. */
type Value = readonly string[] | readonly [number, number];
type Template = {
  id: string; name: string;
  /** The model line, picked from. */
  subtitle: readonly string[];
  /** Values by the stat's name, lower case. */
  specs: Record<string, Value>;
  /** Cargo: name, smallest and largest amount, and how many lines to take. */
  cargo: readonly (readonly [string, number, number])[]; cargoLines: readonly [number, number];
  capacity: readonly [number, number];
  /** Systems: name, roll (or none), note. */
  systems: readonly (readonly [string, string, string])[]; systemLines: readonly [number, number];
};
type Outline = {
  names: { first: readonly string[]; second: readonly string[]; whole: readonly string[] };
  /** Right now values by the field's name, lower case, shared by every template of the outline. */
  now: Record<string, readonly string[]>;
  templates: readonly Template[];
};

const outlines: Record<VehicleArt, Outline> = {
  starship: {
    names: {
      first: ["Quiet", "Distant", "Iron", "Last", "Silver", "Wandering", "Cold", "Bright", "Patient", "Hollow", "Restless", "Red"],
      second: ["Mercy", "Horizon", "Promise", "Lantern", "Comet", "Verdict", "Heron", "Meridian", "Ember", "Tide", "Covenant", "Spindle"],
      whole: ["GDN-205", "Kestrel IV", "Unpaid Debt", "Second Chance", "Mother of Pearl", "Saint Ashe", "Nine Lives", "Dust Runner"],
    },
    now: {
      activity: ["Patrol", "Escort", "Hauling", "Docked for repairs", "Running dark", "Survey", "Pursuit"],
      situation: ["Jurisdiction dispute", "Low on fuel", "Hull breach patched", "Customs inspection", "Outrunning a storm", "Contract overdue"],
      objective: ["Deliver the cargo unopened", "Find the missing survey team", "Pay off the station debt", "Shake the bounty hunters", "Reach the jump point first"],
    },
    templates: [
      { id: "freighter", name: "Freighter", subtitle: ["Bulk freighter", "Light freighter", "Container hauler"],
        specs: { model: ["Mule-class", "Atlas 7", "Ganymede Heavy", "Packhorse"], class: ["Freighter"], role: ["Cargo hauling", "Long-haul trade", "Smuggling, quietly"], drive: ["Fusion torch", "Ion cascade", "Jump drive, rated 2"], registry: ["Free Traders' Guild", "Vesh Port Authority", "Forged papers"] },
        cargo: [["Machine parts", 4, 20], ["Ration packs", 2, 10], ["Refined ore", 10, 40], ["Medical supplies", 1, 5], ["Sealed crates", 2, 12], ["Water ice", 10, 30], ["Luxury goods", 1, 4]], cargoLines: [3, 5], capacity: [40, 120],
        systems: [["Point defence", "1d20+2", ""], ["Cargo lifter", "", "Rated for 10 t"], ["Jump drive", "", "Needs a full tank"], ["Sensor suite", "1d20+1", "Civilian grade"], ["Hidden compartment", "", "Fits 2 t"]], systemLines: [2, 4] },
      { id: "frigate", name: "Frigate", subtitle: ["System frigate", "Patrol frigate", "Escort frigate"],
        specs: { model: ["Liberator", "Lance-class", "Warden Mk II"], class: ["Frigate"], role: ["Station defence", "Escort", "Customs patrol"], drive: ["Ion cascade", "Military fusion drive"], registry: ["Navy", "System Guard", "Decommissioned"] },
        cargo: [["Munitions", 2, 8], ["Ration packs", 2, 6], ["Spare parts", 1, 4], ["Impounded goods", 1, 6]], cargoLines: [2, 4], capacity: [15, 30],
        systems: [["Laser battery", "2d6+1", "Short range"], ["Torpedo bay", "3d8", "4 torpedoes"], ["Point defence", "1d20+3", ""], ["Shield projector", "", "3 layers"], ["Boarding clamps", "", ""], ["Military sensors", "1d20+4", ""]], systemLines: [3, 5] },
      { id: "courier", name: "Courier", subtitle: ["Fast courier", "Mail runner", "Diplomatic courier"],
        specs: { model: ["Swift", "Hermes 3", "Needle"], class: ["Courier"], role: ["Messages and small cargo", "Diplomatic pouch", "Rich passenger transport"], drive: ["Overtuned jump drive", "Fusion torch"], registry: ["Postal Service", "Private", "Embassy"] },
        cargo: [["Sealed mail", 0.5, 2], ["Diplomatic pouch", 0.1, 0.5], ["Passenger luggage", 0.5, 2]], cargoLines: [1, 3], capacity: [3, 8],
        systems: [["Afterburners", "2d6", "Burns fuel fast"], ["Encrypted comms", "", ""], ["Escape pod", "", "Seats 2"], ["Stealth coating", "1d20", "Worn thin"]], systemLines: [2, 3] },
      { id: "salvager", name: "Salvager", subtitle: ["Salvage tug", "Scrapper", "Wreck diver"],
        specs: { model: ["Magpie", "Hookjaw", "Old Faithful"], class: ["Salvage tug"], role: ["Salvage", "Towing", "Scrapping wrecks"], drive: ["Patched fusion drive", "Ion cascade"], registry: ["Salvage licence, expired", "Free Traders' Guild"] },
        cargo: [["Scrap metal", 5, 30], ["Salvaged electronics", 1, 5], ["Unknown artefact", 0.1, 1], ["Hull plating", 2, 10]], cargoLines: [2, 4], capacity: [30, 80],
        systems: [["Grapple arms", "2d6", "Two arms"], ["Cutting laser", "2d8", "Not a weapon, officially"], ["Tow cable", "", "Rated for 500 t"], ["Sensor suite", "1d20", ""]], systemLines: [2, 4] },
    ],
  },
  sail: {
    names: {
      first: ["Gull's", "Widow's", "Saint", "Grey", "Lucky", "Salt", "Black", "Merry", "Queen's", "Drowned"],
      second: ["Wager", "Revenge", "Margaret", "Lantern", "Fortune", "Kiss", "Gale", "Promise", "Pearl", "Hound"],
      whole: ["The Gull's Wager", "Sea Wren", "Brinehart", "The Unbroken Oath", "Lady of Tarrow", "Hesk's Folly"],
    },
    now: {
      heading: ["North by northeast", "Home port", "The Drowned Isles", "Along the coast", "Out to open sea"],
      weather: ["Fair winds", "Becalmed", "Squalls ahead", "Thick fog", "Storm brewing"],
      orders: ["Take the merchant, spare the crew", "Reach port before the tide", "Hunt the pirate sloop", "Land the cargo by night", "Find the lost chart"],
    },
    templates: [
      { id: "sloop", name: "Sloop", subtitle: ["Fast sloop", "Coastal sloop", "Smuggler's sloop"],
        specs: { class: ["Sloop"], masts: [1, 1], guns: [2, 8], "home port": ["Port Gallow", "Tarrow", "Saltmere", "Nowhere, officially"], flag: ["Merchant colours", "No flag", "False colours"] },
        cargo: [["Rum", 2, 10], ["Fresh water", 4, 12], ["Contraband", 1, 6], ["Salt fish", 2, 8]], cargoLines: [2, 4], capacity: [20, 40],
        systems: [["Swivel guns", "1d8", ""], ["Light cannons", "2d6", "Port and starboard"], ["Jib sail", "", ""], ["Hidden hold", "", "Fits 4 casks"]], systemLines: [2, 3] },
      { id: "brigantine", name: "Brigantine", subtitle: ["Merchant brigantine", "Merchant raider", "Navy brigantine"],
        specs: { class: ["Brigantine"], masts: [2, 2], guns: [10, 16], "home port": ["Port Gallow", "Greyhaven", "Saltmere"], flag: ["Merchant colours", "Navy ensign", "Black flag"] },
        cargo: [["Rum", 4, 16], ["Gunpowder", 2, 8], ["Fresh water", 8, 20], ["Spices", 2, 10], ["Cloth bales", 4, 12], ["Ship's biscuit", 4, 12]], cargoLines: [3, 5], capacity: [60, 120],
        systems: [["Broadside cannons", "2d10", "Port and starboard"], ["Chase guns", "2d6", "Bow"], ["Boarding nets", "", ""], ["Mainsail", "", ""], ["Ship's boat", "", "Seats 8"]], systemLines: [3, 5] },
      { id: "galleon", name: "Galleon", subtitle: ["Treasure galleon", "War galleon", "Merchant galleon"],
        specs: { class: ["Galleon"], masts: [3, 4], guns: [24, 40], "home port": ["The capital", "Greyhaven", "Port Gallow"], flag: ["Royal ensign", "Merchant company colours"] },
        cargo: [["Silver bars", 2, 10], ["Spices", 6, 20], ["Gunpowder", 4, 12], ["Fresh water", 20, 40], ["Passengers' trunks", 4, 10], ["Fine wine", 4, 12]], cargoLines: [4, 6], capacity: [150, 300],
        systems: [["Broadside cannons", "3d10", "Two gun decks"], ["Stern chasers", "2d8", ""], ["Marines' muskets", "2d6", ""], ["Mainsail", "", ""], ["Strongroom", "", "Locked; the captain has the key"]], systemLines: [3, 5] },
    ],
  },
  airship: {
    names: {
      first: ["Cloud", "Sky", "Gilded", "Morning", "High", "Silent", "Brass", "Thunder", "Drifting", "Paper"],
      second: ["Whale", "Lark", "Queen", "Dancer", "Spire", "Kite", "Moth", "Regent", "Swan", "Gambit"],
      whole: ["Aurelia", "The Long Sigh", "Highwater", "Dandelion", "The Brass Duchess", "Updraft"],
    },
    now: {
      heading: ["Over the mountains", "The floating markets", "Home dock", "Following the river", "Into the storm wall"],
      weather: ["Clear skies", "Updrafts", "Ice on the lines", "Thunderheads", "Low cloud"],
      orders: ["Stay above the clouds", "Drop the cargo at the beacon", "Find the lost balloonists", "Outclimb the pirates", "Land before the gas runs low"],
    },
    templates: [
      { id: "scout", name: "Scout", subtitle: ["Scout skiff", "Courier balloon", "Observation airship"],
        specs: { class: ["Skiff"], "lift gas": ["Hot air", "Hydrogen", "Lift crystals"], ceiling: ["2,000 ft", "5,000 ft", "8,000 ft"], "home dock": ["Spire Dock", "Highwater", "The aerodrome"] },
        cargo: [["Signal flares", 1, 4], ["Maps and charts", 1, 2], ["Rations", 1, 4]], cargoLines: [1, 3], capacity: [5, 12],
        systems: [["Spyglass mount", "1d20+2", ""], ["Light engine", "", "Prop and rudder"], ["Ballast drop", "", ""], ["Swivel gun", "1d10", ""]], systemLines: [2, 3] },
      { id: "hauler", name: "Cargo hauler", subtitle: ["Cargo hauler", "Bulk zeppelin", "Freight barge"],
        specs: { class: ["Hauler"], "lift gas": ["Hydrogen", "Helium", "Lift crystals"], ceiling: ["3,000 ft", "6,000 ft"], "home dock": ["The aerodrome", "Spire Dock", "Copperton"] },
        cargo: [["Coal", 4, 20], ["Mail sacks", 1, 6], ["Machine parts", 2, 10], ["Fresh produce", 2, 8], ["Livestock", 1, 4]], cargoLines: [3, 5], capacity: [30, 60],
        systems: [["Twin engines", "", ""], ["Cargo winch", "", "Rated for 2 crates"], ["Deck gun", "2d8", ""], ["Envelope patch kit", "", "3 patches left"]], systemLines: [2, 4] },
      { id: "pleasure", name: "Pleasure barge", subtitle: ["Pleasure barge", "Sky yacht", "Floating salon"],
        specs: { class: ["Yacht"], "lift gas": ["Helium", "Lift crystals"], ceiling: ["4,000 ft"], "home dock": ["The capital", "Highwater"] },
        cargo: [["Fine wine", 1, 6], ["Guests' trunks", 2, 8], ["Fireworks", 1, 3], ["Ice", 1, 4]], cargoLines: [2, 4], capacity: [12, 25],
        systems: [["Ballroom", "", ""], ["Hidden gun ports", "2d6", "Two guns"], ["Parachute rig", "", "Seats 6"], ["Gilded engines", "", "Quiet"]], systemLines: [2, 4] },
    ],
  },
  carriage: {
    names: {
      first: ["Lady", "Old", "Black", "Swift", "Golden", "Rattling", "Velvet"],
      second: ["Margery", "Bessie", "Rook", "Hart", "Rose", "Lantern", "Mare"],
      whole: ["The Night Mail", "The Duchess", "The Greyhaven Flyer", "Old Bess", "The Coach of Saint Ashe"],
    },
    now: {
      "bound for": ["Greyhaven", "The capital", "Tarrow crossroads", "The border fort", "Home"],
      passengers: ["A nervous clerk", "Two nuns and a parrot", "A noble and her guard", "Nobody, officially", "A family fleeing the city"],
      hurry: ["Before the gates close", "Before the snow", "Before the bandits notice", "No hurry at all"],
    },
    templates: [
      { id: "mail", name: "Mail coach", subtitle: ["Royal mail coach", "Stagecoach", "Night mail"],
        specs: { make: ["Hollis & Sons", "Royal Post works", "Greyhaven coachworks"], team: ["Four bays", "Six greys", "Four mules"], seats: [4, 8], livery: ["Royal red", "Post green", "Mud brown"] },
        cargo: [["Mail sacks", 2, 6], ["Strongbox", 1, 1], ["Passengers' trunks", 1, 4]], cargoLines: [2, 3], capacity: [6, 10],
        systems: [["Guard's blunderbuss", "2d6", "Loaded with nails"], ["Strongbox", "", "Bolted to the floor"], ["Coach horn", "", ""], ["Spare wheel", "", ""]], systemLines: [2, 4] },
      { id: "noble", name: "Noble's carriage", subtitle: ["Noble's carriage", "Gilded coach", "State coach"],
        specs: { make: ["Valerian coachworks", "A master from the capital"], team: ["Four white horses", "Six blacks", "Two greys"], seats: [2, 6], livery: ["House colours", "Gold and blue", "Black and silver"] },
        cargo: [["Silk gowns", 1, 3], ["Jewel case", 1, 1], ["Fine wine", 1, 2], ["Gifts", 1, 3]], cargoLines: [2, 3], capacity: [4, 8],
        systems: [["Hidden compartment", "", "Under the seat"], ["Coat of arms", "", "Gilded"], ["Footmen's step", "", ""], ["Curtains", "", "Velvet, drawn"]], systemLines: [2, 3] },
      { id: "wagon", name: "Wagon", subtitle: ["Covered wagon", "Merchant wagon", "Travelling show wagon"],
        specs: { make: ["Farm built", "Merchant guild", "Patched together"], team: ["Two oxen", "Two draught horses", "A mule"], seats: [2, 4], livery: ["Painted bright", "Plain canvas", "Faded signs"] },
        cargo: [["Grain sacks", 2, 8], ["Tools", 1, 3], ["Trade goods", 2, 6], ["Barrels of ale", 1, 4], ["Costumes", 1, 3]], cargoLines: [2, 4], capacity: [8, 16],
        systems: [["Canvas cover", "", ""], ["Crossbow under the seat", "1d10", ""], ["Water barrel", "", ""], ["Spare axle", "", ""]], systemLines: [2, 3] },
    ],
  },
  car: {
    names: {
      first: ["Midnight", "Rusty", "Lucky", "Big", "Blue", "Silver", "Desert"],
      second: ["Betty", "Ghost", "Bullet", "Mule", "Lightning", "Shark", "Dog"],
      whole: ["The Interceptor", "Old Faithful", "Bessie", "Number 9", "The Getaway"],
    },
    now: {
      heading: ["South on the highway", "Into the city", "Off-road", "The state line", "Back to the garage"],
      "on our tail": ["Police cruiser", "Nobody, yet", "A black van", "Raiders on bikes", "The rival crew"],
      plan: ["Lose them in the tunnels", "Make the drop by midnight", "Fill up and keep driving", "Get the mechanic to the job"],
    },
    templates: [
      { id: "muscle", name: "Muscle car", subtitle: ["Muscle car", "Street racer", "Interceptor"],
        specs: { make: ["Fordham", "Dodson", "Chevrell"], model: ["Charger", "Stallion", "Vandal"], year: [1968, 1979], plate: ["RKT 404", "GHO 557", "LCK 777", "No plates"], engine: ["V8", "Supercharged V8", "Big block V8"] },
        cargo: [["Duffel bags", 10, 30], ["Spare tyre", 10, 15], ["Jerry can", 15, 20]], cargoLines: [1, 3], capacity: [60, 120],
        systems: [["Nitrous", "2d6", "One shot"], ["Roll cage", "", ""], ["Police scanner", "", ""], ["Armoured doors", "", ""]], systemLines: [2, 3] },
      { id: "van", name: "Van", subtitle: ["Delivery van", "Camper van", "Surveillance van"],
        specs: { make: ["Volksmann", "Fordham", "Toyota"], model: ["Transit", "Hauler", "Wanderer"], year: [1975, 2005], plate: ["VAN 123", "FLW 802", "Fake plates"], engine: ["Diesel", "Inline four", "V6"] },
        cargo: [["Tools", 20, 60], ["Camping gear", 20, 50], ["Surveillance kit", 10, 30], ["Boxes", 50, 200]], cargoLines: [2, 4], capacity: [500, 1200],
        systems: [["Sliding door", "", ""], ["Roof rack", "", ""], ["Radio kit", "1d20", ""], ["Hidden floor panel", "", ""]], systemLines: [2, 3] },
      { id: "wasteland", name: "Wasteland rig", subtitle: ["Armoured buggy", "War rig", "Scrap racer"],
        specs: { make: ["Scrapyard built", "Salvaged military"], model: ["Bonebreaker", "Dust Devil", "Buzzard"], year: [1980, 2020], plate: ["None"], engine: ["Blown V8", "Twin diesels", "Something that runs"] },
        cargo: [["Water", 20, 80], ["Fuel drums", 40, 160], ["Scrap", 20, 100], ["Ammunition", 10, 30]], cargoLines: [2, 4], capacity: [200, 600],
        systems: [["Mounted machine gun", "2d8", ""], ["Ram plate", "2d6", ""], ["Harpoon", "1d10", "On a winch"], ["Spiked wheels", "1d6", ""], ["Armour plating", "", "Welded on"]], systemLines: [3, 4] },
    ],
  },
  mech: {
    names: {
      first: ["Iron", "Steel", "Red", "Black", "Grey", "Thunder"],
      second: ["Giant", "Warden", "Knight", "Bastion", "Hammer", "Titan"],
      whole: ["Unit 7", "Atlas", "Big Iron", "The Walking Wall", "Goliath"],
    },
    now: {},
    templates: [
      { id: "walker", name: "Walker", subtitle: ["Light walker", "Heavy walker", "Siege walker"],
        specs: { model: ["Strider Mk I", "Bastion", "Ironclad"], class: ["Walker"], role: ["Assault", "Scouting", "Siege"] },
        cargo: [["Ammunition", 1, 4], ["Repair kit", 1, 2], ["Spare actuators", 1, 3]], cargoLines: [1, 3], capacity: [4, 10],
        systems: [["Autocannon", "2d8", ""], ["Missile pod", "3d6", "6 missiles"], ["Armour plating", "", ""], ["Jump jets", "1d20", "Hot after 2 jumps"], ["Targeting computer", "1d20+3", ""]], systemLines: [3, 4] },
    ],
  },
};

export type VehicleTemplateChoice = { id: string; name: string };
/** The templates a type can roll from, by its outline. */
export const vehicleTemplates = (type: Pick<VehicleType, "art">): VehicleTemplateChoice[] => outlines[type.art].templates.map(t => ({ id: t.id, name: t.name }));

export type GeneratedVehicle = { title: string; templateId: string; vehicle: Vehicle };

const value = (rng: Rng, v: Value) => typeof v[0] === "number" ? String(between(rng, v[0] as number, v[1] as number)) : pick(rng, v as readonly string[]);
const amount = (rng: Rng, lo: number, hi: number) => lo === hi ? lo : Math.round((lo + rng() * (hi - lo)) * (hi - lo < 5 ? 10 : 1)) / (hi - lo < 5 ? 10 : 1);

/** A vehicle of this type, rolled from `seed` (with a template id or "any"). */
export function generateVehicle(type: VehicleType, seed: string, templateId = "any"): GeneratedVehicle {
  const outline = outlines[type.art], rng = seeded(`${seed}|${type.id}|${templateId}`);
  const tpl = outline.templates.find(t => t.id === templateId) ?? pick(rng, outline.templates);
  const n = outline.names, title = rng() < 0.3 ? pick(rng, n.whole) : `${pick(rng, n.first)} ${pick(rng, n.second)}`;
  const v = newVehicle(type);
  v.subtitle = `${pick(rng, tpl.subtitle)}`;
  v.specs = v.specs.map(s => { const f = type.specs.find(x => x.id === s.id)!, src = tpl.specs[f.label.toLowerCase()]; return src ? { ...s, value: value(rng, src) } : s; });
  // Some wear: most gauges a little down, one sometimes badly.
  v.gauges = v.gauges.map(g => { const max = type.gauges.find(x => x.id === g.id)!.max, worn = rng() < 0.15 ? 0.2 + rng() * 0.3 : 0.6 + rng() * 0.4; return { ...g, value: clampGauge(Math.max(1, Math.round(max * worn)), max) }; });
  v.now = v.now.map(s => { const f = type.now.find(x => x.id === s.id)!, src = outline.now[f.label.toLowerCase()]; return src ? { ...s, value: pick(rng, src) } : s; });
  v.capacity = between(rng, tpl.capacity[0], tpl.capacity[1]);
  const id = (k: string, i: number) => `gen-${k}${i}-${Math.floor(rng() * 1e9).toString(36)}`;
  const cargo = someOf(rng, tpl.cargo, between(rng, tpl.cargoLines[0], tpl.cargoLines[1])).map(([name, lo, hi], i) => ({ id: id("c", i), name, qty: amount(rng, lo, hi) }));
  // Never more aboard than fits: trim the largest lines down to the capacity.
  let over = cargo.reduce((s, c) => s + c.qty, 0) - v.capacity;
  for (const c of [...cargo].sort((a, b) => b.qty - a.qty)) { if (over <= 0) break; const cut = Math.min(over, c.qty - Math.min(c.qty, 1)); c.qty = Math.round((c.qty - cut) * 10) / 10; over -= cut; }
  if (cargo.length) v.cargo = cargo;
  const systems = someOf(rng, tpl.systems, between(rng, tpl.systemLines[0], tpl.systemLines[1])).map(([name, roll, note], i) => ({ id: id("s", i), name, state: rng() < 0.2 ? "damaged" as const : "ok" as const, ...(roll ? { roll } : {}), ...(note ? { note } : {}) }));
  if (systems.length) v.systems = systems;
  return { title, templateId: tpl.id, vehicle: v };
}

/**
 * A rolled vehicle put onto an existing one: everything the generator rolls replaces what was there, while the
 * people, links, picture, location and every tab's visibility stay as they were.
 */
export function applyGenerated(current: Vehicle, from: VehicleType, to: VehicleType, generated: Vehicle): Vehicle {
  // A different type moves the people to the new type's seats first, as changing the type by hand does.
  const base = from.id === to.id ? current : changeType(current, from, to);
  const keep: (keyof Vehicle)[] = ["visibility", "crewVisibility", "holdVisibility", "systemsVisibility", "ownerId", "ownerGm", "commanderId", "commanderGm", "locationId", "locationGm", "locationText", "stations", "crew", "hands"];
  const out: Vehicle = { ...generated };
  for (const k of keep) { if (base[k] !== undefined) (out as Record<string, unknown>)[k] = base[k]; else delete (out as Record<string, unknown>)[k]; }
  return out;
}
