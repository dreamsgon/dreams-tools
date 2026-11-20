import {scopeMapWeather} from './map-weather.ts';
import { pageLookSchema, pageTextSchema, resolveText, textDiff, textSettingsSchema } from './page-text.ts';
import { statRows } from './stat-rolls.ts';
import { shownStats } from './stat-arrange.ts';
import { playerPins } from './profile-pins.ts';
import {calendarSchema,publicCalendar} from './calendar-model.ts';
import {mapSchema,playerMap,imageIdSchema} from "./map-model.ts";
import { z } from "zod";
import {playerInline} from './inline.ts';
import {infoRows,templateOf} from './templates.ts';
import {frontPageSchema,resolveFrontPage} from './front-page.ts';
import {aiWritingSchema} from './ai-styles.ts';
import {dashboardSchema} from './dashboard.ts';
import {sidebarSchema,remapSidebarPages} from './sidebar.ts';
import {questSchema,playerQuest,newQuest,questCategoriesSchema,questCategories} from './quests.ts';
import {codexSchema,codexCategory,inboxNoteSchema,playerCodex} from './codex.ts';
import {lookSchema,playerLook} from './look.ts';
import {recapSchema,playerRecapTabs} from './recap-schema.ts';
import {orgSchema,orgLayoutSchema,orgTypesSchema,orgRefs,orgMembersOf,orgSearchText,playerOrg,remapOrg,type PlayerOrg} from './org-profile.ts';
import {sheetSchema,playerSheet} from './sheet-link.ts';
import {trackersSchema,playerTrackers,type PlayerTracker} from './trackers.ts';
import {vehicleTypesSchema,vehicleSchema,vehicleRefs,peopleRefs,vehicleSearchText,vehicleTypeOf,playerVehicle,playerVehicleRoles,remapVehicle,type PlayerVehicle} from './vehicles.ts';
import {profileSchema,characterLayoutSchema,profileRefs,profileSearchText,remapProfile,playerProfile,playerOrganizations,type PlayerProfile} from './character-profile.ts';
import {featuresSchema,playerFeatures,type PlayerFeature} from './features.ts';
import {inventorySchema,spellsSchema,itemSettingsSchema,itemSettingsOf,playerInventory,playerSpells,playerItemSettings,type PlayerInventory,type PlayerSpell} from './items.ts';
import {storeSchema,storeRefs,remapStore,storeSearchText,playerStore,type PlayerStore} from './stores.ts';
import {galaxySchema} from './galaxies.ts';
import {sectorSchema} from './sectors.ts';
import {starSystemSchema,systemSearchText,systemRefs,remapSystem} from './star-systems.ts';
import {planetSchema} from './planets.ts';
import {tiesSchema,tieTypesSchema,tieTypesOf,remapTies,tieSearchText} from './ties.ts';
import {playerTies,type PlayerTie} from './tie-connections.ts';
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const name = z.string().trim().min(1).max(160);
export const githubSchema = z.object({
    repository: z.string().max(200).refine(v => !v || /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(v), "Use owner/repository"),
    branch: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_/-]+$/).refine(v => !v.includes("..") && !v.startsWith("-") && !v.endsWith("/")),
});
export const visibilitySchema = z.enum(["gm", "players"]);
export const tabSchema = z.object({id, title:name, body:z.string().max(100000), visibility:visibilitySchema});
export const statFieldSchema = z.object({
  id, label:name, section:z.string().trim().max(100), type:z.enum(["text","number","textarea","checkbox","select","none"]),
  options:z.array(z.string().trim().min(1).max(100)).max(40), visibility:visibilitySchema, archived:z.boolean(),
  // Optional (added later): what clicking the value rolls. d20 = 1d20 + the number; formula = the text itself; custom = rollFormula with {value}.
  roll:z.enum(["none","d20","formula","custom"]).optional(), rollFormula:z.string().trim().max(200).optional(),
  // Optional (added later, the rollable sheet): named rolls, like a spell's Attack and Damage. Formulas may use {value}.
  // When present they replace roll / rollFormula (see stat-rolls.ts). note is a short line under the stat's name.
  rolls:z.array(z.object({name:z.string().trim().min(1).max(40),formula:z.string().trim().min(1).max(200),
    // Optional: a target, so the roll card says Success or Fail (at least 15, at most {value}).
    success:z.object({op:z.enum(["atLeast","atMost"]),against:z.string().trim().min(1).max(100)}).optional()})).max(6).optional(),
  note:z.string().trim().max(120).optional(),
  // Optional (added later): a longer description, like what a feature does; shown as its tooltip and in its details.
  description:z.string().trim().max(2000).optional(),
  // Optional (rollable sheet part 2): a worked-out value shown beside the value and read as {Name mod}, like floor(({value}-10)/2);
  // and a tracker (by name, since each character has its own) that rolling this stat spends from.
  // Optional (added later): "score" shows a number stat as a score box like a D&D ability: the value is the score, with a
  // modifier typed beside it (kept under modKey in the character's values) or worked out from `derived`. Rolls read it as {Name mod}.
  look:z.enum(["score"]).optional(),
  // Optional (added later): save shows a saving throw under a score box (its bonus typed beside it, kept under saveKey, else the
  // modifier); quick shows the stat in the Quick strip at the top of the sheet, like Initiative.
  save:z.boolean().optional(), quick:z.boolean().optional(),
  derived:z.string().trim().max(200).optional(), spend:z.object({tracker:z.string().trim().min(1).max(40),n:z.number().int().min(1).max(1000)}).optional(),
}).superRefine((f,ctx)=>{if(f.type==="select" && !f.options.length)ctx.addIssue({code:"custom",message:"Dropdowns need at least one option"});if(new Set(f.options).size!==f.options.length)ctx.addIssue({code:"custom",message:"Dropdown options must be unique"});});
export const statValueSchema=z.union([z.string().max(10000),z.number().finite(),z.boolean(),z.null()]);
export const characterSchema = z.object({
  role:z.enum(["pc","companion","npc","creature"]), group:z.string().trim().max(300), tags:z.array(z.string().trim().min(1).max(60)).max(30),
  location:z.string().max(160), faction:z.string().max(160), status:z.enum(["active","inactive","missing","deceased"]),
  statsVisibility:visibilitySchema,
  statsByCampaign:z.record(id,z.record(id,statValueSchema)),
  // Optional (added later): a pasted statblock, kept exactly as pasted. GM-only; never sent to players.
  statblock:z.string().max(50000).optional(), statblockRolls:z.boolean().optional(),
  // Optional (added later): one linked Google Sheet and the cells read from it (see sheet-link.ts). GM data; players get playerSheet() only when stats are player visible.
  sheet:sheetSchema.optional(),
  // Optional (added later): small gauges such as Shields or Stress (trackers.ts). Players get the shown ones when stats are shared or the page is theirs to edit.
  trackers:trackersSchema.optional(),
  // Optional (added later): money and items, and spells or powers (items.ts). The character's own player always sees both; others when shared.
  inventory:inventorySchema.optional(), spells:spellsSchema.optional(), spellsVisibility:visibilitySchema.optional(),
  // Optional (added later): class features, feats and traits (features.ts). Like spells: the character's own player always sees them, others when shared; GM-only ones never.
  features:featuresSchema.optional(), featuresVisibility:visibilitySchema.optional(),
  // Optional (added later): this character's own arrangement of the campaign's stats (stat-arrange.ts): their order, and the ones
  // switched off on this sheet. Ids of stats the form no longer has are ignored. Off stats are left out for players too.
  statLayout:z.object({order:z.array(id).max(500).optional(),off:z.array(id).max(500).optional()}).optional(),
});
export type CharacterData=z.infer<typeof characterSchema>;
export type ArticleTab=z.infer<typeof tabSchema>;
export type StatField=z.infer<typeof statFieldSchema>;
export const defaultCharacter=():CharacterData=>({role:"npc",group:"",tags:[],location:"",faction:"",status:"active",statsVisibility:"gm",statsByCampaign:{}});
/**
 * A page template: the info box fields, tabs and starting text a new page gets. Templates belong to a world,
 * so every campaign in it can use them. Pages remember theirs (templateId) and keep their values in `fields`.
 */
export const templateFieldSchema = z.object({
  id, label:z.string().trim().min(1).max(60), type:z.enum(["text","number","choice","page","textarea"]),
  options:z.array(z.string().trim().min(1).max(60)).max(30).optional(), visibility:visibilitySchema,
}).superRefine((f,ctx)=>{if(f.type==="choice"&&!f.options?.length)ctx.addIssue({code:"custom",message:`“${f.label}” needs at least one choice`});});
export const templateKinds = ["note","character","place","faction","lore","session","quest"] as const;
export const pageTemplateSchema = z.object({
  id, name, kind:z.enum(templateKinds), fields:z.array(templateFieldSchema).max(30), tabs:z.array(z.object({title:name, visibility:visibilitySchema})).max(20),
  body:z.string().max(20000), parentId:id.nullable().optional(), overviewVisibility:visibilitySchema.optional(), updatedAt:z.string().datetime(),
});
export type PageTemplate=z.infer<typeof pageTemplateSchema>;
export type TemplateField=z.infer<typeof templateFieldSchema>;
export const worldSchema = z.object({ id, name, description: z.string().max(1000), archived: z.boolean(), isTemplate:z.boolean().optional(),
  // Optional (added later): how text is set on every page of this world's Wiki, unless a page or branch says otherwise (page-text.ts).
  text:textSettingsSchema.optional(),
  // Optional (added later): page templates for this world.
  templates:z.array(pageTemplateSchema).max(60).optional(),
  // Optional (added later): the organization profile layout new organizations start with, and the organization types typed in for this world.
  orgLayout:orgLayoutSchema.optional(), orgTypes:orgTypesSchema.optional(),
  // Optional (added later): the character profile layout new characters start with.
  characterLayout:characterLayoutSchema.optional(),
  // Optional (added later): kinds of tie the GM renamed or made (ties.ts). Built-in kinds that are unchanged are not stored.
  tieTypes:tieTypesSchema.optional(),
  // Optional (added later): this world's own vehicle types (vehicles.ts). Left out, the five ready-made types.
  vehicleTypes:vehicleTypesSchema.optional() });
export const campaignSchema = z.object({ id, worldId: id, name, description: z.string().max(1000), github: githubSchema, statFields:z.array(statFieldSchema).max(100).optional(), calendars:z.array(calendarSchema).max(12).optional(),
  // Optional (added later): rolls from this campaign go to a Maptable campaign's Discord channel.
  discord:z.object({maptableCampaignId:z.string().min(1).max(120), route:z.enum(["combat","exploration","world"]).optional()}).optional(),
  // Optional (added later): the Maptable campaign that holds this campaign's maps, set on the Campaigns page.
  maptableCampaignId:z.string().min(1).max(120).optional(),
  // Optional (added later): the GM set up this campaign's forum (lib/forum). Forums start switched off.
  forum:z.boolean().optional(),
  // Optional (added later): solo play (lib/solo.ts): one person with no other players, who keeps every GM power and plays the player characters.
  solo:z.boolean().optional(),
  // Optional (added later): the Campaigns page folder (a Maptable campaign folder id) this campaign sits in when it has no Maptable campaign of its own.
  folderId:z.string().min(1).max(120).optional(),
  // Optional (added later): the widgets on the campaign front page players see first.
  frontPage:frontPageSchema.optional(),
  // Optional (added later): the codex category order and quick notes from the table waiting to be filed.
  codexCategories:z.array(codexCategory).max(40).optional(), codexInbox:z.array(inboxNoteSchema).max(200).optional(),
  // Optional (added later): the campaign's accent, heading font, page surface and banner.
  look:lookSchema.optional(), dashboard:dashboardSchema.optional(),
  // Optional (added later): the quest categories in their order. Without it a campaign has Main, Side and Personal.
  questCategories:questCategoriesSchema.optional(),
  // Optional (added later): how the AI writes recaps, The story so far and generator text (ai-styles.ts). Never sent to players.
  aiWriting:aiWritingSchema.optional(),
  // Optional (added later): coins, weight, item categories, what spells are called and what players may change (items.ts).
  items:itemSettingsSchema.optional(),
  // Optional (added later): the GM's Encyclopedia sidebar for this campaign: menu order, quick links and their own categories (sidebar.ts).
  sidebar:sidebarSchema.optional(),
  // Optional (added later): other worlds whose shared lore this campaign's Wiki also shows, live (see campaignLoreWorldIds). Nothing is copied.
  linkedWorldIds:z.array(id).max(12).optional() });
/**
 * A page's picture (a portrait for characters and creatures). The whole picture is shown on the page;
 * the circle (centre x, y as fractions of its width and height, diameter as a fraction of its shorter side)
 * is what a Maptable token shows. Players see it when they can see the page's Overview.
 */
export const pictureSchema = z.object({
    imageId: imageIdSchema, width: z.number().int().min(1).max(20000), height: z.number().int().min(1).max(20000),
    x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1), size: z.number().finite().min(0.2).max(1),
    /* Optional separate token image with its own framing; the portrait keeps the main picture. */
    token: z.object({
        imageId: imageIdSchema, width: z.number().int().min(1).max(20000), height: z.number().int().min(1).max(20000),
        x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1), size: z.number().finite().min(0.2).max(1),
    }).optional(),
    ring: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), noRing: z.boolean().optional(), /* true: the token has no ring at all */ squares: z.number().min(0.5).max(6).refine(v => Number.isInteger(v) || v === 0.5 || v === 0.75, "A token is ½, ¾ or a whole number of squares").optional(),
});
export type Picture = z.infer<typeof pictureSchema>;
export const entrySchema = z.object({
    id, worldId: id, campaignId: id.nullable(), parentId: id.nullable(), title: name,
    kind: z.enum(["folder", "note", "character", "place", "faction", "lore", "session", "tasks", "map", "quest", "vehicle", "store", "galaxy", "sector", "system"]),
    order:z.number().finite().optional(), body: z.string().max(100000), overviewVisibility:visibilitySchema.optional(), tabs:z.array(tabSchema).max(30).optional(), character:characterSchema.optional(), mapData:mapSchema.optional(), picture:pictureSchema.optional(), quest:questSchema.optional(), codex:codexSchema.optional(),
    // Optional (added later): on an organization (faction) page, its Profile tab.
    org:orgSchema.optional(),
    // Optional (added later): on a character page, its Profile tab (traits, beliefs, ties and Right now). Organizations are worked out from the organizations' own profiles.
    profile:profileSchema.optional(),
    // Optional (added later): on a vehicle page (ship, airship, carriage, car…), its type, stats, gauges, owner, commander and location.
    vehicle:vehicleSchema.optional(),
    // Optional (added later): on a store page, the shop, container, loot or party stash (stores.ts).
    store:storeSchema.optional(),
    // Optional (added later): on a galaxy page, the galaxy (a real one or a generated one) and its art (galaxies.ts).
    galaxy:galaxySchema.optional(),
    // Optional (added later): on a sector page, its hex map of star systems (sectors.ts). A sector usually sits inside a galaxy page.
    sector:sectorSchema.optional(),
    // Optional (added later): on a star system page, its star, worlds, moons, belts and hooks (star-systems.ts). It usually sits inside a sector page.
    starSystem:starSystemSchema.optional(),
    // Optional (added later): on a place page charted from a star system's survey chart, which world it is and a copy of its fields (planets.ts).
    planet:planetSchema.optional(),
    // Optional (added later): typed ties from this page to others (Parent of, Rival of, Sails from…). Shown on both pages (tie-connections.ts).
    ties:tiesSchema.optional(),
    // Optional (added later): the template this page was made from, and its info box values by field id.
    templateId:id.optional(), fields:z.record(id, z.union([z.string().max(2000), z.number().finite()])).optional(),
    // Optional (added later): on a session page, the recap an AI drafted (timeline, quotes, GM notes, things to check).
    recap:recapSchema.optional(),
    // Optional (added later): who last changed the page when it wasn't the GM: a co-GM, or a player on their own page.
    editedBy:z.object({name:z.string().trim().min(1).max(80), as:z.enum(["co-gm","player"])}).optional(),
    // Optional (added later): this page's text settings (size, font, spacing…), and with `branch` the pages inside it too (page-text.ts).
    text:pageTextSchema.optional(),
    // Optional (added later): how the page itself looks: banner, icon, info box side, contents list and width (page-text.ts).
    pageLook:pageLookSchema.optional(),
    updatedAt: z.string().datetime(),
});
export const workspaceSchema = z.object({ schemaVersion: z.literal(1), worlds: z.array(worldSchema).max(100), campaigns: z.array(campaignSchema).max(500), entries: z.array(entrySchema).max(5000) }).superRefine((s, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", message });
    const all = [...s.worlds, ...s.campaigns, ...s.entries];
    if (new Set(all.map(x => x.id)).size !== all.length)
        bad("IDs must be unique");
    const worlds = new Set(s.worlds.map(w => w.id));
    const campaigns = new Map(s.campaigns.map(c => [c.id, c]));
    const entries = new Map(s.entries.map(e => [e.id, e]));
    for (const c of s.campaigns)
        if (!worlds.has(c.worldId))
            bad("Campaign world is missing");
    for (const c of s.campaigns)
        if (c.linkedWorldIds && (new Set(c.linkedWorldIds).size !== c.linkedWorldIds.length || c.linkedWorldIds.includes(c.worldId)))
            bad("Linked worlds must be different from each other and from the campaign's own world");
    const paired=s.campaigns.flatMap(c=>c.maptableCampaignId?[c.maptableCampaignId]:[]);if(new Set(paired).size!==paired.length)bad("A Maptable campaign can be paired with only one Wiki campaign");
    for(const c of s.campaigns){if(new Set((c.calendars??[]).map(x=>x.id)).size!==(c.calendars??[]).length)bad("Calendar IDs must be unique within a campaign");if(new Set((c.statFields??[]).map(f=>f.id)).size!==(c.statFields??[]).length)bad("Stat field IDs must be unique within a campaign");}
    for (const e of s.entries) {
        if(e.kind==='map'&&!e.mapData)bad('Map entries need map data');
        if(e.mapData&&e.kind!=='map')bad('Map data requires a map entry');
        if(e.quest&&e.kind!=='quest')bad('Quest details require a quest entry');
        if(e.recap&&e.kind!=='session')bad('A recap belongs on a session page');
        if(e.org&&e.kind!=='faction')bad('An organization profile requires an organization (faction) entry');
        if(e.org){const refs=orgRefs(e.org);
          for(const ref of [...refs.characters,...refs.pages]){const t=entries.get(ref);if(t&&(t.worldId!==e.worldId||(t.campaignId!==null&&t.campaignId!==e.campaignId)))bad('A profile cannot point outside its world or campaign');}
          for(const ref of refs.characters){const t=entries.get(ref);if(t&&t.kind!=='character')bad('People and members in a profile must be character pages');}}
        if(e.profile&&e.kind!=='character')bad('A character profile requires a character entry');
        if(e.vehicle&&e.kind!=='vehicle')bad('Vehicle details require a vehicle entry');
        if(e.store&&e.kind!=='store')bad('Store details require a store page');
        if(e.galaxy&&e.kind!=='galaxy')bad('Galaxy details require a galaxy page');
        if(e.sector&&e.kind!=='sector')bad('A sector hex map requires a sector page');
        if(e.starSystem&&e.kind!=='system')bad('A survey chart requires a star system page');
        if(e.planet){if(e.kind!=='place')bad('A charted world requires a place page');
          const sys=entries.get(e.planet.systemPageId);if(sys&&(sys.kind!=='system'||sys.worldId!==e.worldId))bad('A charted world must point at a star system page in its world');
          const map=e.planet.worldMapId?entries.get(e.planet.worldMapId):undefined;if(map&&(map.kind!=='map'||map.worldId!==e.worldId))bad('A charted world’s world map must be a map page in its world');}
        if(e.starSystem)for(const ref of systemRefs(e.starSystem)){const t=entries.get(ref);if(!t)continue;if(t.kind!=='faction')bad('A star system can only point at organization pages');if(t.worldId!==e.worldId||(t.campaignId!==null&&t.campaignId!==e.campaignId))bad('A star system cannot point outside its world or campaign');}
        if(e.store)for(const ref of storeRefs(e.store)){const t=entries.get(ref);if(!t)continue;if(t.kind!=='character')bad('A store can only point at character pages');if(t.worldId!==e.worldId||(t.campaignId!==null&&t.campaignId!==e.campaignId))bad('A store cannot point outside its world or campaign');}
        if(e.character?.spells){const trackers=new Set((e.character.trackers??[]).map(t=>t.id));if(e.character.spells.some(x=>x.cost&&!trackers.has(x.cost.trackerId)))bad('A spell can only spend from one of the character’s own trackers');}
        if(e.vehicle){for(const ref of vehicleRefs(e.vehicle)){const t=entries.get(ref);if(!t)continue;if(ref===e.id)bad('A vehicle cannot point at itself');if(t.worldId!==e.worldId||(t.campaignId!==null&&t.campaignId!==e.campaignId))bad('A vehicle cannot point outside its world or campaign');}
          const kindOf=(id?:string)=>id?entries.get(id)?.kind:undefined,owner=kindOf(e.vehicle.ownerId),commander=kindOf(e.vehicle.commanderId);
          if(commander&&commander!=='character')bad('A vehicle’s commander must be a character page');
          if(peopleRefs(e.vehicle).some(id=>{const k=kindOf(id);return k&&k!=='character';}))bad('Only character pages can hold a seat or be on a crew manifest');
          if(owner&&owner!=='character'&&owner!=='faction')bad('A vehicle’s owner must be a character or organization page');}
        if(e.profile)for(const ref of profileRefs(e.profile)){const t=entries.get(ref);if(!t)continue;if(ref===e.id)bad('A character cannot have a tie to themselves');if(t.worldId!==e.worldId||(t.campaignId!==null&&t.campaignId!==e.campaignId))bad('A profile cannot point outside its world or campaign');if(t.kind!=='character'&&t.kind!=='faction')bad('Ties must point at character or organization pages');}
        if(e.ties||e.profile){const types=new Set(tieTypesOf(s.worlds.find(w=>w.id===e.worldId)).map(t=>t.id));
          if(e.ties&&new Set(e.ties.map(t=>t.id)).size!==e.ties.length)bad('Tie ids must be unique on a page');
          for(const t of e.ties??[]){if(!types.has(t.typeId)||(t.cover&&!types.has(t.cover.typeId)))bad('A tie needs a kind of tie this world has');if(t.toId===e.id)bad('A page cannot be tied to itself');const to=entries.get(t.toId);if(to&&(to.worldId!==e.worldId||(to.campaignId!==null&&to.campaignId!==e.campaignId)))bad('A tie cannot point outside its world or campaign');}
          for(const b of e.profile?.blocks??[])if(b.kind==='ties')for(const t of b.ties)if(t.typeId&&!types.has(t.typeId))bad('A tie needs a kind of tie this world has');}
        if(e.codex)for(const cid of Object.keys(e.codex.found)){const c=campaigns.get(cid);if(!c||c.worldId!==e.worldId||(e.campaignId!==null&&e.campaignId!==cid))bad('A codex find belongs to a campaign that can see the page');}
        for(const ref of [e.quest?.giverId,e.quest?.placeId,...(e.quest?.rewardIds??[]),...(e.quest?.linkIds??[]),...(e.quest?.objectives??[]).flatMap(o=>[o.targetId,o.whereId])]){if(!ref)continue;const t=entries.get(ref);if(t&&(t.worldId!==e.worldId||(t.campaignId!==null&&t.campaignId!==e.campaignId)))bad('A quest cannot point outside its world or campaign');}
        for(const pin of e.mapData?.pins??[]){if(pin.entryId){const target=entries.get(pin.entryId);if(target&&(target.worldId!==e.worldId||(target.campaignId!==null&&target.campaignId!==e.campaignId)))bad('A map pin cannot link outside its world or campaign');}}

        for(const pin of e.mapData?.pins??[])for(const link of pin.weatherLinks??[]){
          const campaign=campaigns.get(link.campaignId);
          if(!campaign||campaign.worldId!==e.worldId||(e.campaignId!==null&&e.campaignId!==campaign.id))bad('Map weather must belong to the map’s world and campaign');
          const calendar=campaign?.calendars?.find(c=>c.id===link.calendarId);
          if(!calendar?.weather?.regions.some(r=>r.id===link.regionId))bad('The linked weather calendar or region is missing');
        }
        if(new Set((e.tabs??[]).map(t=>t.id)).size!==(e.tabs??[]).length)bad("Tab IDs must be unique within an article");
        if((e.tabs??[]).some(t=>["overview","stats","map"].includes(t.id)))bad("Tab ID is reserved");
        if(e.character){
          if(e.kind!=="character")bad("Character details require a character entry");
          if(Object.keys(e.character.statsByCampaign).length>500)bad("Too many campaign stat sets");
          for(const [cid,values] of Object.entries(e.character.statsByCampaign)){
            if(campaigns.get(cid)?.worldId!==e.worldId || (e.campaignId!==null&&cid!==e.campaignId))bad("Stats belong to a campaign in the character's scope");
            if(Object.keys(values).length>200)bad("Too many stat values");
            for(const field of campaigns.get(cid)?.statFields??[]){
              const value=values[field.id]; if(value==null)continue;
              const valid=field.type==='number'?typeof value==='number':field.type==='checkbox'?typeof value==='boolean':typeof value==='string';
              if(!valid)bad("Stat value does not match its field type");
            }
          }
        }
        if (!worlds.has(e.worldId))
            bad("Article world is missing");
        if (e.campaignId && campaigns.get(e.campaignId)?.worldId !== e.worldId)
            bad("Article campaign is outside its world");
        let next = e.parentId;
        const seen = new Set([e.id]);
        let depth = 0;
        while (next) {
            if (seen.has(next)) {
                bad("Folder cycle is not allowed");
                break;
            }
            seen.add(next);
            const p = entries.get(next);
            // Any page can hold sub-pages, as long as it is in the same campaign (or both are shared lore).
            if (!p || p.worldId !== e.worldId || p.campaignId !== e.campaignId) {
                bad("A page can only go inside a page in the same campaign or shared lore");
                break;
            }
            if (++depth > 20) {
                bad("Use at most 20 levels of pages");
                break;
            }
            next = p.parentId;
        }
    }
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type Campaign = z.infer<typeof campaignSchema>;
export type World = z.infer<typeof worldSchema>;
export const emptyWorkspace = (): Workspace => ({ schemaVersion: 1, worlds: [], campaigns: [], entries: [] });
export const newId = () => crypto.randomUUID();
export const MAX_LINKED_WORLDS = 12;
/**
 * The worlds whose lore (pages with no campaign) a campaign shows: its own world first, then the worlds it is linked to.
 * A link to a world that is gone, archived or a template, to the campaign's own world, or a repeat is ignored, so a stale id never shows anything.
 */
export function campaignLoreWorldIds(s: Pick<Workspace, "worlds">, campaign: Pick<Campaign, "worldId" | "linkedWorldIds">): string[] {
    const usable = new Set(s.worlds.filter(w => !w.archived && !w.isTemplate).map(w => w.id));
    const out = [campaign.worldId];
    for (const id of campaign.linkedWorldIds ?? []) if (usable.has(id) && !out.includes(id) && out.length <= MAX_LINKED_WORLDS) out.push(id);
    return out;
}
/** Just the linked worlds (not the campaign's own). */
export const linkedLoreWorldIds = (s: Pick<Workspace, "worlds">, campaign: Pick<Campaign, "worldId" | "linkedWorldIds">) => campaignLoreWorldIds(s, campaign).slice(1);
/** Pages a campaign sees: its own world's lore and its own pages, plus linked worlds' lore. With no campaign (a world's own view) only that world's lore. */
export const visibleEntries = (s: Workspace, worldId: string, campaignId: string | null) => {
    const own = campaignId === null ? undefined : s.campaigns.find(c => c.id === campaignId);
    const linked = own && own.worldId === worldId && own.linkedWorldIds?.length ? new Set(linkedLoreWorldIds(s, own)) : null;
    return s.entries.filter(e => (e.worldId === worldId && (e.campaignId === null || e.campaignId === campaignId)) || (!!linked && e.campaignId === null && linked.has(e.worldId)));
};
/** Worlds and links after a world is removed: no campaign keeps a link to it. */
export const withoutWorldLinks = (s: Workspace, worldId: string): Workspace => s.campaigns.some(c => c.linkedWorldIds?.includes(worldId))
    ? { ...s, campaigns: s.campaigns.map(c => { if (!c.linkedWorldIds?.includes(worldId)) return c; const { linkedWorldIds, ...rest } = c; const left = linkedWorldIds.filter(x => x !== worldId); return left.length ? { ...rest, linkedWorldIds: left } : rest; }) }
    : s;
/** Turns one world's link to a campaign on or off. Not the campaign's own world; at most 12 links. */
export function setWorldLink(s: Workspace, campaignId: string, worldId: string, on: boolean): Workspace {
    return { ...s, campaigns: s.campaigns.map(c => {
        if (c.id !== campaignId || c.worldId === worldId) return c;
        const has = (c.linkedWorldIds ?? []).includes(worldId);
        if (on === has || (on && (c.linkedWorldIds ?? []).length >= MAX_LINKED_WORLDS)) return c;
        const { linkedWorldIds, ...rest } = c;
        const next = on ? [...(linkedWorldIds ?? []), worldId] : (linkedWorldIds ?? []).filter(x => x !== worldId);
        return next.length ? { ...rest, linkedWorldIds: next } : rest;
    }) };
}
// `linked` also gives the lore of the worlds the campaign is linked to (own world first). Left out by default, so agents, backups and exports stay to the campaign's own world.
export function campaignExport(s: Workspace, campaignId: string, opts: { linked?: boolean } = {}): Workspace {
    const c = s.campaigns.find(x => x.id === campaignId);
    if (!c)
        throw new Error("Campaign not found");
    const ids = opts.linked ? campaignLoreWorldIds(s, c) : [c.worldId];
    const own = visibleEntries(s, c.worldId, c.id), pages = opts.linked ? own : own.filter(e => e.worldId === c.worldId);
    return workspaceSchema.parse({ schemaVersion: 1, worlds: ids.map(id => s.worlds.find(w => w.id === id)!), campaigns: [c], entries: pages.map(e=>e.mapData?{...e,mapData:scopeMapWeather(e.mapData,c.id)}:e).map(e=>e.character?{...e,character:{...e.character,statsByCampaign:Object.fromEntries(Object.entries(e.character.statsByCampaign).filter(([cid])=>cid===c.id))}}:e).map(e=>e.codex?{...e,codex:{...e.codex,found:Object.fromEntries(Object.entries(e.codex.found).filter(([cid])=>cid===c.id))}}:e) });
}
export function importCopy(current: Workspace, input: unknown): Workspace {
    const incoming = workspaceSchema.parse(input);
    const ids = new Map([...incoming.worlds, ...incoming.campaigns, ...incoming.entries].map(x => [x.id, newId()]));
    const ref = (value: string) => ids.get(value)!;
    const links=(body:string)=>body.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g,(full,target,label)=>ids.has(target)?`[[${ref(target)}${label??""}]]`:full);
    return workspaceSchema.parse({ schemaVersion: 1,
        worlds: [...current.worlds, ...incoming.worlds.map(w => ({ ...w, id: ref(w.id), name: (w.name + " (imported)").slice(0, 160), archived: false }))],
        campaigns: [...current.campaigns, ...incoming.campaigns.map(c => { const copy = { ...c, id: ref(c.id), worldId: ref(c.worldId), ...(c.linkedWorldIds?.some(w => ids.has(w)) ? { linkedWorldIds: c.linkedWorldIds.filter(w => ids.has(w)).map(ref) } : {}), ...(c.frontPage ? { frontPage: { widgets: c.frontPage.widgets.map(w => w.type === "links" ? { ...w, links: w.links.filter(l => !l.entryId || ids.has(l.entryId)).map(l => l.entryId ? { ...l, entryId: ref(l.entryId) } : l) } : w) } } : {}), ...(c.sidebar ? { sidebar: remapSidebarPages(c.sidebar, ids) } : {}) }; delete copy.maptableCampaignId; delete copy.discord; if (!c.linkedWorldIds?.some(w => ids.has(w))) delete copy.linkedWorldIds; return copy; })],
        entries: [...current.entries, ...incoming.entries.map(e => ({ ...e, id: ref(e.id), worldId: ref(e.worldId), campaignId: e.campaignId ? ref(e.campaignId) : null, parentId: e.parentId ? ref(e.parentId) : null, mapData:e.mapData?{...e.mapData,...(e.mapData.zoomOf?{zoomOf:ids.has(e.mapData.zoomOf.mapId)?{...e.mapData.zoomOf,mapId:ref(e.mapData.zoomOf.mapId)}:undefined}:{}),pins:e.mapData.pins.map(p=>({...p,entryId:p.entryId?ids.get(p.entryId)??null:null,areaMapId:p.areaMapId?ids.get(p.areaMapId)??null:p.areaMapId,weatherLinks:p.weatherLinks?.map(l=>({...l,campaignId:ref(l.campaignId)}))}))}:undefined, body:links(e.body), tabs:e.tabs?.map(t=>({...t,body:links(t.body)})), character:e.character?{...e.character,statsByCampaign:Object.fromEntries(Object.entries(e.character.statsByCampaign).map(([cid,values])=>[ref(cid),values]))}:undefined, quest:e.quest?{...e.quest,giverId:e.quest.giverId?ids.get(e.quest.giverId)??null:null,placeId:e.quest.placeId?ids.get(e.quest.placeId)??null:null,...(e.quest.rewardIds?{rewardIds:e.quest.rewardIds.flatMap(id=>ids.get(id)??[])}:{}),...(e.quest.linkIds?{linkIds:e.quest.linkIds.flatMap(id=>ids.get(id)??[])}:{}),objectives:e.quest.objectives.map(o=>({...o,...(o.targetId?{targetId:ids.get(o.targetId)??null}:{}),...(o.whereId?{whereId:ids.get(o.whereId)??null}:{})}))}:undefined, org:e.org?remapOrg(e.org,ids):undefined, vehicle:e.vehicle?remapVehicle(e.vehicle,id=>ids.get(id)):undefined, store:e.store?remapStore(e.store,id=>ids.get(id)):undefined, sector:e.sector?{...e.sector,systems:e.sector.systems.map(x=>({...x,pageId:x.pageId?ids.get(x.pageId):undefined}))}:undefined, starSystem:e.starSystem?remapSystem(e.starSystem,id=>ids.get(id)):undefined, planet:e.planet?{...e.planet,systemPageId:ids.get(e.planet.systemPageId)??e.planet.systemPageId,worldMapId:e.planet.worldMapId?ids.get(e.planet.worldMapId):undefined}:undefined, profile:e.profile?remapProfile(e.profile,ids):undefined, ties:remapTies(e.ties,ids), codex:e.codex?{...e.codex,found:Object.fromEntries(Object.entries(e.codex.found).map(([cid,f])=>[ref(cid),f]))}:undefined }))],
    });
}
export function canParent(entry: Entry, parent: Entry, s: Workspace) {
    if (parent.worldId !== entry.worldId || parent.campaignId !== entry.campaignId)
        return false;
    let current: Entry | undefined = parent;
    const seen = new Set<string>();
    while (current) {
        if (current.id === entry.id || seen.has(current.id))
            return false;
        seen.add(current.id);
        current = s.entries.find(e => e.id === current!.parentId);
    }
    const next = {...s,entries:s.entries.map(e=>e.id===entry.id?{...e,parentId:parent.id}:e)};
    return workspaceSchema.safeParse(next).success;
}
export function folderPath(s:Workspace, entry:Entry):string {
    const names:string[]=[];let parent=entry.parentId;const seen=new Set<string>();
    while(parent&&!seen.has(parent)){seen.add(parent);const f=s.entries.find(e=>e.id===parent);if(!f)break;names.unshift(f.title);parent=f.parentId;}
    return names.join(' / ');
}
export function inFolder(s:Workspace,entry:Entry,folderId:string):boolean {
    let parent=entry.parentId;const seen=new Set<string>();
    while(parent&&!seen.has(parent)){if(parent===folderId)return true;seen.add(parent);parent=s.entries.find(e=>e.id===parent)?.parentId??null;}
    return false;
}
export function compareEntries(a:Entry,b:Entry){return (a.order??1e9)-(b.order??1e9)||(a.kind==='folder'?-1:0)-(b.kind==='folder'?-1:0)||a.title.localeCompare(b.title);}
export function reorderEntry(s:Workspace,id:string,direction:number):Workspace {
    const entry=s.entries.find(e=>e.id===id);if(!entry)return s;
    const siblings=s.entries.filter(e=>e.worldId===entry.worldId&&e.campaignId===entry.campaignId&&e.parentId===entry.parentId).sort(compareEntries);
    const at=siblings.findIndex(e=>e.id===id),to=at+direction;if(to<0||to>=siblings.length)return s;
    [siblings[at],siblings[to]]=[siblings[to],siblings[at]];
    const orders=new Map(siblings.map((e,i)=>[e.id,i]));
    return {...s,entries:s.entries.map(e=>orders.has(e.id)?{...e,order:orders.get(e.id)}:e)};
}
export function resolveLink(s: Workspace, from: Entry, target: string) {
    const candidates = visibleEntries(s, from.worldId, from.campaignId);
    const exact = candidates.find(e => e.id === target);
    if (exact)
        return exact;
    const names = candidates.filter(e => e.title.toLowerCase() === target.toLowerCase());
    return names.find(e => e.campaignId === from.campaignId) ?? names[0];
}
export function demoWorkspace(): Workspace {
    const now = new Date().toISOString();
    const entry = (id: string, title: string, kind: Entry["kind"], campaignId: string | null, parentId: string | null, body = ""): Entry => ({ id, worldId: "demo-world", title, kind, campaignId, parentId, body, updatedAt: now });
    return { schemaVersion: 1, worlds: [{ id: "demo-world", name: "The Lantern Coast", description: "Salt roads, old promises, and a light that never goes out.", archived: false }], campaigns: [
            { id: "demo-campaign", worldId: "demo-world", name: "The Salt Road", description: "A missing cartographer. An unfamiliar tide.", github: { repository: "", branch: "main" } },
            { id: "demo-campaign-two", worldId: "demo-world", name: "Winter at Greyhaven", description: "Another story in the same world.", github: { repository: "", branch: "main" } },
        ], entries: [
            entry("demo-places", "Places", "folder", null, null),
            entry("demo-greyhaven", "Greyhaven", "place", null, "demo-places", "# A city at the edge of the sea\n\nWhitewashed houses climb the cliffs above a harbor crowded with blue sails. Every evening, the lighthouse keeper rings a bronze bell.\n\n## At a glance\n- Known for: salt markets and shipwrights\n- Local custom: leave a light in the window for travelers\n- A useful contact: [[demo-mara|Mara Venn]]\n\n## A question worth asking\nWhy has the lighthouse been burning green?"),
            entry("demo-mara", "Mara Venn", "character", null, null, "# The keeper of borrowed maps\n\nMara trades in coastal charts and stories. She remembers every debt, but rarely asks for payment in coin.\n\nHome: [[demo-greyhaven|Greyhaven]]."),
            entry("demo-sessions", "Session Notes", "folder", "demo-campaign", null),
            entry("demo-first", "A light in the fog", "session", "demo-campaign", "demo-sessions", "# Where we left off\n\nThe party arrived in [[demo-greyhaven|Greyhaven]] at dusk. [[demo-mara|Mara Venn]] offered them a water-damaged chart with a coastline nobody recognized.\n\n## Next session\n- [ ] Ask Mara about the missing cartographer\n  - [ ] Examine the mark on the chart\n  - [ ] Visit the harbor office\n- [ ] Follow the green light\n\n## GM notes\nThe chart changes when it touches seawater. Keep this discovery within this campaign."),
            entry("demo-threads", "Loose threads", "tasks", "demo-campaign", null, "# Things to follow up\n\n- [ ] Find the cartographer\n  - [ ] Speak to the dock workers\n- [ ] Learn who is tending the lighthouse\n- [x] Meet Mara Venn"),
            entry("demo-winter", "The first snowfall", "session", "demo-campaign-two", null, "# A separate campaign\n\nSnow has closed the northern road to [[demo-greyhaven|Greyhaven]].\n\nThis campaign shares the world articles, but has its own sessions, tasks, and GitHub repository settings."),
        ] };
}

// GM secrets: a block from a line "::: secret" to a line ":::" is GM-only, even inside a player-visible tab.
// An unclosed block runs to the end of the text, so a missing ":::" never leaks the rest of a secret.
export const SECRET_OPEN=/^[ \t]*:::[ \t]*secret[ \t]*$/i,SECRET_CLOSE=/^[ \t]*:::[ \t]*$/;
// GM-only text: "::: secret" blocks (counting blocks inside them, so a note inside a secret can't end it early), %%asides%% and lines starting "(gm)".
const BLOCK_START=/^[ \t]*:::[ \t]*[a-z][\w-]*\b/i,GM_LINE=/^[ \t]*\(gm\)/i,ASIDE=/ ?%%[^%\n]*%%/g;
export function stripSecrets(text:string){if(!/:::|%%|\(gm\)/i.test(text))return text;let depth=0,found=false;const kept:string[]=[];for(const line of text.split("\n")){const bare=line.replace(/\r$/,"");if(depth){if(SECRET_CLOSE.test(bare))depth--;else if(BLOCK_START.test(bare))depth++;continue;}if(SECRET_OPEN.test(bare)){depth=1;found=true;continue;}if(GM_LINE.test(bare)){found=true;continue;}if(bare.includes('%%')){const next=line.replace(ASIDE,'');if(next!==line){found=true;kept.push(next);continue;}}kept.push(line);}return !found?text:kept.join("\n").replace(/\n{3,}/g,"\n\n").trim();}


// "[[maptable:<sceneId>|Label]]" links open the GM's own Maptable scene; players only ever get the label.
export const MAPTABLE_LINK=/\[\[maptable:([A-Za-z0-9_-]{1,120})(?:\|([^\]]*))?\]\]/g;
export const maptableLinks=(text:string)=>[...text.matchAll(MAPTABLE_LINK)].map(m=>({sceneId:m[1],label:(m[2]??"").trim()||"Battle map"}));
export function playerText(text:string){return playerInline(stripSecrets(text).replace(MAPTABLE_LINK,(_,_id,label)=>(label??"").trim()));}
// Player payloads are explicit allowlists, never the GM workspace with CSS hiding.
// `mine` are pages a signed-in member may edit (their Who can edit): they read those as if shared with players.
// `linker` is that member's key (player-sheet.ts linkerKey): they also see a sheet they linked themselves on their own page, even while the stats are GM only.
export function playerCampaign(s:Workspace,campaignId:string,mine?:ReadonlySet<string>,linker?:string){
 const c=s.campaigns.find(c=>c.id===campaignId);if(!c)throw new Error("Campaign not found");
 // A draft recap never reaches players, whatever its tabs say.
 const candidates=visibleEntries(s,c.worldId,c.id).filter(e=>e.recap?.status!=='draft').map(e=>mine?.has(e.id)&&e.overviewVisibility!=="players"?{...e,overviewVisibility:"players" as const}:e);
 const fields=(c.statFields??[]).filter(f=>!f.archived&&f.visibility==="players");
 // Text settings come down from pages above, even ones players can't open: only how the text looks, never what it says.
 const world=s.worlds.find(w=>w.id===c.worldId),allById=new Map(s.entries.map(e=>[e.id,e]));
 const entries=candidates.flatMap(e=>{
   const tabs=[...(e.overviewVisibility==="players"?[{id:"overview",title:e.kind==="quest"?"Journal":e.kind==="vehicle"||e.kind==="store"?"Description":"Overview",body:playerText(e.body)}]:[]),...(e.tabs??[]).filter(t=>t.visibility==="players").map(t=>({id:t.id,title:t.title,body:playerText(t.body)})),...(e.overviewVisibility==="players"?playerRecapTabs(e.recap,playerText):[])];
   const showStats=e.kind==="character"&&e.character?.statsVisibility==="players";
   const mapData=e.mapData?.visibility==="players"?playerMap(e.mapData):undefined;
   const codex=e.codex?playerCodex(e.codex,c.id,playerText):undefined;
   const shareOrg=(e.kind==='faction'&&e.org?.visibility==='players')||(e.kind==='character'&&e.profile?.visibility==='players')||(e.kind==='vehicle'&&e.vehicle?.visibility==='players');
   const ownSheet=!!linker&&!!mine?.has(e.id)&&e.character?.sheet?.linkedById===linker;
   const sheet=(showStats||ownSheet)&&e.character?.sheet?playerSheet(e.character.sheet):undefined;
   // Trackers: on a character whose stats are shared, or one this member may edit (they change them there).
   const trackers:PlayerTracker[]=e.kind==='character'&&(showStats||!!mine?.has(e.id))?playerTrackers(e.character?.trackers):[];
   // Inventory and spells: on a page this member may edit, or when the GM shares them.
   const own=!!mine?.has(e.id),items=itemSettingsOf(c);
   const inventory=e.kind==='character'&&e.character&&(own||e.character.inventory?.visibility==='players')&&(e.character.inventory||own)?playerInventory(e.character.inventory,items):undefined;
   const spells=e.kind==='character'&&e.character&&items.spells.on&&(own||e.character.spellsVisibility==='players')&&(e.character.spells?.length||own)?playerSpells(e.character.spells):undefined;
   const features=e.kind==='character'&&e.character?.features?.length&&(own||e.character.featuresVisibility==='players')?playerFeatures(e.character.features):undefined;
   // A store: when the GM shares it (and it is for one of this member's characters), or one of their characters runs it.
   const ownStore=!!e.store?.ownerId&&!!mine?.has(e.store.ownerId),forMe=!e.store?.who||e.store.who.some(id=>mine?.has(id));
   const store=e.kind==='store'&&e.store&&(ownStore||(e.store.visibility==='players'&&!e.store.awaiting&&forMe))?playerStore(e.store,mine??new Set(),Date.now()):undefined;
   if(!tabs.length&&!(showStats&&fields.length)&&!sheet&&!mapData&&!codex&&!shareOrg&&!trackers.length&&!inventory&&!spells&&!features?.length&&!store)return [];
   const values=e.character?.statsByCampaign[c.id]??{};
   const template=e.overviewVisibility==="players"?templateOf(s,e):null,info=template?infoRows(s,template,e,true).map(r=>({label:r.label,value:r.value,...(r.pageId?{pageId:r.pageId}:{})})):[];
   return [{id:e.id,title:e.title,kind:e.kind,parentId:undefined as string|undefined,text:textDiff(resolveText(e,id=>allById.get(id),world?.text).text),pageLook:e.pageLook?{...e.pageLook,toc:undefined}:undefined,...(info.length?{info}:{}),role:e.kind==="character"?(e.character?.role??"npc"):undefined,tabs,mapData,picture:e.overviewVisibility==="players"||codex||(e.kind==='vehicle'&&e.vehicle?.visibility==='players')?e.picture:undefined,codex,org:undefined as PlayerOrg|undefined,vehicle:undefined as PlayerVehicle|undefined,rides:undefined as {id:string;title:string;roles:string[]}[]|undefined,profile:undefined as PlayerProfile|undefined,ties:undefined as PlayerTie[]|undefined,quest:e.kind==="quest"&&e.overviewVisibility==="players"?playerQuest(e.quest??newQuest(),()=>true,playerText,questCategories(c),linker):undefined,sheet,...(trackers.length?{trackers}:{}),...(inventory?{inventory:inventory as PlayerInventory}:{}),...(spells?{spells:spells as PlayerSpell[]}:{}),...(features?.length?{features:features as PlayerFeature[]}:{}),...(store?{store:store as PlayerStore}:{}),stats:showStats?statRows(shownStats(fields,e.character?.statLayout),values):[]}];
 });
 const calendars=(c.calendars??[]).filter(x=>x.visibility==='players').map(publicCalendar);
 const readable=new Set(entries.map(e=>e.id));
 // The page each one sits inside, only when players can read that page too (for `::: pages` with `inside:`).
 {const parentOf=new Map(candidates.map(x=>[x.id,x.parentId]));for(const e of entries){const parent=parentOf.get(e.id);if(parent&&readable.has(parent))e.parentId=parent;}}
 // A shared organization Profile: the player-safe copy is built here, once every page players can read is known.
 const byId=new Map(candidates.map(e=>[e.id,e])),title=(id:string)=>byId.get(id)?.title??'';
 for(const e of entries){const src=byId.get(e.id);if(src?.kind!=='faction'||src.org?.visibility!=='players')continue;
  const subgroups=candidates.filter(x=>x.parentId===src.id&&x.kind==='faction'&&readable.has(x.id)).map(x=>({id:x.id,title:x.title,members:x.org?.visibility!=='players'?[]:orgMembersOf(x.org,(id,gm)=>!gm&&readable.has(id)).map(id=>({id,title:title(id)}))}));
  e.org=playerOrg(src.org,id=>readable.has(id),playerText,{title,subgroups,linked:playerLinkedPages(s,src,candidates.filter(x=>readable.has(x.id))),vehicles:candidates.filter(x=>x.kind==='vehicle'&&readable.has(x.id)&&x.vehicle?.ownerId===src.id&&!x.vehicle.ownerGm&&x.vehicle.visibility==='players').map(x=>({id:x.id,title:x.title})).sort((a,b)=>a.title.localeCompare(b.title))});}
 // A shared character Profile: organizations only where the page and its own Profile are shared and the character's place isn't GM only.
 for(const e of entries){const src=byId.get(e.id);if(src?.kind!=='character'||src.profile?.visibility!=='players')continue;
  e.profile=playerProfile(src.profile,id=>readable.has(id),playerText,playerOrganizations(candidates,src.id,id=>readable.has(id),playerText),{title,linked:playerLinkedPages(s,src,candidates.filter(x=>readable.has(x.id)))});
  // Pinned stats, items and spells: only from what this payload already gives players (shared tabs, GM-only lines left out). Statblock lines never.
  const pins=playerPins(src.profile.pins,{stats:e.stats,items:e.inventory?.items,spells:e.spells,features:e.features});if(pins.length)e.profile.pins=pins;}
 // A shared vehicle: GM-only values left out, and its owner, commander and location only when players can read those pages.
 for(const e of entries){const src=byId.get(e.id);if(src?.kind!=='vehicle'||src.vehicle?.visibility!=='players')continue;
  e.vehicle=playerVehicle(src.vehicle,vehicleTypeOf(src.vehicle,s.worlds.find(w=>w.id===src.worldId)),id=>readable.has(id),playerText);}
 // A character lists the shared vehicles it owns, commands or crews, taken from those vehicles' player copies.
 for(const e of entries){if(e.kind!=='character')continue;const rides=entries.flatMap(x=>{const roles=x.vehicle?playerVehicleRoles(x.vehicle,e.id):[];return roles.length?[{id:x.id,title:x.title,roles}]:[];});if(rides.length)e.rides=rides;}
 // Ties: shared ones, and the cover story of a GM-only one, only where players can read both pages.
 for(const e of entries){const src=byId.get(e.id);if(!src)continue;const ties=playerTies(s,src,c.id,id=>readable.has(id),playerText);if(ties.length)e.ties=ties;}
 // An info box links only to pages players can read; a link to any other page is left out.
 for(const e of entries){if(e.info)e.info=e.info.filter(r=>!r.pageId||readable.has(r.pageId));if(e.quest)e.quest={...e.quest,giverId:e.quest.giverId&&readable.has(e.quest.giverId)?e.quest.giverId:null,placeId:e.quest.placeId&&readable.has(e.quest.placeId)?e.quest.placeId:null,rewardIds:e.quest.rewardIds.filter(id=>readable.has(id)),objectives:e.quest.objectives.map(o=>({...o,...('targetId' in o?{targetId:o.targetId&&readable.has(o.targetId)?o.targetId:null}:{}),...('whereId' in o?{whereId:o.whereId&&readable.has(o.whereId)?o.whereId:null}:{})}))};if(e.mapData)e.mapData={...e.mapData,paths:e.mapData.paths?.map(p=>({...p,entryId:p.entryId&&readable.has(p.entryId)?p.entryId:null})),labels:e.mapData.labels?.map(l=>({...l,entryId:l.entryId&&readable.has(l.entryId)?l.entryId:null})),pins:e.mapData.pins.map(p=>({...p,entryId:p.entryId&&readable.has(p.entryId)?p.entryId:null,areaMapId:p.areaMapId&&readable.has(p.areaMapId)?p.areaMapId:null,weatherLinks:p.weatherLinks?.filter(l=>l.campaignId===c.id&&calendars.some(cal=>cal.id===l.calendarId&&cal.weather?.regions.some(r=>r.id===l.regionId)))}))};}
 const sessionsNewestFirst=candidates.filter(e=>e.kind==='session').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(e=>e.id);
 const frontPage=resolveFrontPage(c.frontPage,{entries,calendars,clean:playerText,sessionsNewestFirst});
 return {schemaVersion:1,calendars,campaign:{id:c.id,name:c.name,look:playerLook(c.look),items:playerItemSettings(itemSettingsOf(c)),...(c.forum?{forum:true}:{})},world:{name:s.worlds.find(w=>w.id===c.worldId)!.name},entries,frontPage};
}
export type PlayerCampaign=ReturnType<typeof playerCampaign>;
// Pages players can read that link to this one, from the text players can read (shared tabs, GM secrets removed).
function playerLinkedPages(s:Workspace,target:Entry,pages:Entry[]){
 const link=/\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/g;
 return pages.filter(e=>e.id!==target.id).filter(e=>[...(e.overviewVisibility==='players'?[e.body]:[]),...(e.tabs??[]).filter(t=>t.visibility==='players').map(t=>t.body)].some(t=>[...stripSecrets(t).matchAll(link)].some(m=>resolveLink(s,e,m[1])?.id===target.id))).map(e=>({id:e.id,title:e.title}));
}
export function searchableText(e:Entry){return [e.title,e.body,orgSearchText(e.org),profileSearchText(e.profile),vehicleSearchText(e.vehicle),storeSearchText(e.store),e.galaxy?.facts.type,e.galaxy?.summary,...(e.sector?.systems??[]).map(x=>x.name+' '+x.note),systemSearchText(e.starSystem),e.planet?`${e.planet.profile.type} ${e.planet.profile.kind}`:'',tieSearchText(e.ties),...(e.tabs??[]).map(t=>t.title+" "+t.body),e.character?.group,e.character?.location,e.character?.faction,...(e.character?.tags??[]),e.mapData?.category,...(e.mapData?.pins??[]).map(p=>p.title+' '+p.notes)].join(" ");}
