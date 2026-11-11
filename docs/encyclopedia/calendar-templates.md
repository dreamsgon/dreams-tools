# Calendar template references

Reviewed November 6, 2026. Templates are editable starting points, not official game tools. Default years are campaign examples. Moon phases, historical era transitions, and automatic Age rollover are not modeled. The app supports positive years only.

| Template | Year and week | Edition choice and references |
| --- | --- | --- |
| Forgotten Realms — Harptos | 12 × 30-day months, five extra festivals; Shieldmeet every fourth year; ten-day tendays | Festivals do not advance the tenday. Shieldmeet follows Midsummer. [Calendar of Harptos](https://forgottenrealms.fandom.com/wiki/Calendar_of_Harptos); [official DMG errata](https://media.wizards.com/2021/dnd/downloads/DMG-Errata.pdf). Example year: 1492 DR. |
| Gregorian | 365/366 days; seven weekdays | Proleptic rules for all years: divisible by 4, except centuries unless divisible by 400. Year 1 begins on Monday. No Julian calendar changeover. [US Naval Observatory](https://aa.usno.navy.mil/faq/leap_years). Example year: 2026 CE. |
| Krynn — Solamnic (5E) | 12 × 28-day months; seven weekdays | Uses *Shadow of the Dragon Queen*, “War Comes to Krynn,” Calendar; Magetag spelling. Earlier publications use different month lengths and names. Weekday epoch is an editable campaign convention. [Official chapter](https://www.dndbeyond.com/sources/dnd/sotdq/war-comes-to-krynn); [Dragonlance Nexus variant discussion](https://dragonlancenexus.com/the-moons-of-krynn-and-why-this-fan-pulls-his-hair-out-every-time-someone-talks-about-it/). Example year: 351 AC. |
| Elder Scrolls — Tamrielic | 365 days; seven weekdays | Uses Skyrim/Oblivion month lengths without Gregorian leap days. Earlier games differ. Weekday epoch is a campaign convention. [Lore calendar](https://elderscrolls.fandom.com/wiki/Calendar); [Skyrim calendar constants](https://ng.commonlib.dev/_calendar_8h_source.html). Example year: 4E 201. |
| Dragon Age — Thedas (RPG) | 12 × 30-day months plus five annums; 365 days | Uses *Dragon Age RPG Core Rulebook*, p.157. *World of Thedas* instead describes a 360-day year. English weekdays and annums outside the week are explicit editable conventions. [Calendar and variant discussion](https://dragonage.fandom.com/wiki/Calendar). Prefix `9:` and suffix `Dragon` give example year 9:41 Dragon; update these manually when the Age changes. |
| Eberron — Galifar | 12 × 28-day months; seven weekdays | Each month starts on Sul. No leap days. [Galifar calendar](https://eberron.fandom.com/wiki/Galifar_Calendar); [weekdays](https://eberron.fandom.com/wiki/Week). Example year: 998 YK. Day of Mourning and Long Shadows dates follow the [holiday reference](https://eberroncolumbus.wikidot.com/eberron-calendar). |
| Greyhawk — Common Year | 12 × 28-day months plus four seven-day festival weeks; 364 days | Festival weeks participate in the weekday cycle. Uses the later 364-day version, not the 1980 folio’s 360-day version. [Greyhawk calendar](https://www.greyhawkonline.com/greyhawkwiki/Calendar). Example year: 576 CY. |
| Exandria — Tal’Dorei Reborn | 11 months totaling 328 days; seven weekdays | Uses Tal’Dorei Reborn holiday dates, including Highsummer on 7 Sydenstar; Wildemount dates can differ. No leap rule is supplied; epoch weekday is an editable campaign convention. [Publisher preview, pp.8–9](https://d1vzi28wh99zvq.cloudfront.net/pdf_previews/420050-sample.pdf). Example year: 836 PD. Year zero exists in the lore but is outside this app’s supported range. |

The app shows the source links and template notes next to each calendar. Customizing a template changes the campaign’s copy and never rewrites the starting template. Source links are reference material, not live dependencies; the calendar works without fetching them.


## Moons and seasons (v0.6)

The source list in `lib/calendar-almanac.ts` is also linked in the editor. Cycles are **phase periods**, not orbital periods or Eberron ascendance. Colors are illustrative. All anchors and boundaries can be changed; saved calendars never silently receive new defaults.

| Template | Moons | Seasons / conventions |
| --- | --- | --- |
| Harptos | Selûne 30.4375 days, full Hammer 1, 1372 DR | Festival-based 5E campaign convention: Greengrass, Midsummer, Highharvestide, Midwinter; era-dependent, not universal astronomical boundaries |
| Gregorian | Mean 29.53059-day cycle, new Jan 6, 2000 ~18:14 UTC | Northern meteorological March/June/September/December 1 |
| Krynn | Solinari 36, Lunitari 28, Nuitari 8 days; arbitrary full anchors at campaign start; Nuitari private | Day-one seasonal month starts are editorial |
| Tamriel | Masser and Secunda 24 days using Oblivion implementation; full campaign-start anchors are editorial | Gregorian-equivalent month starts are editorial |
| Thedas | Primary Moon and Satina, manual; numeric periods unverified | Wintersend/Summerday mark spring/summer; August 1 and Firstfall 1 are editorial autumn/winter starts |
| Eberron | Twelve visible moons, manual; lost Crya omitted; no invented numeric periods | Therendor/Nymm/Rhaan/Vult day one as regional campaign convention |
| Greyhawk | Luna 28 and Celene 91 days, full Richfest 4 | Five seasons; starts Readying/Planting/Reaping/Patchwall/Sunsebb 1; festival weeks retain preceding season |
| Tal’Dorei | Catha 30 days (D&D Beyond convention; other sources differ), editorial full anchor; Ruidus manual | Published starts Dualahei 13, Unndilar 26, Fessuran 3, Duscar 2 |
| Custom | Example 28-day Moon, new at campaign start | Four editable example seasons |

Manual phases apply to every date until edited; historical phase overrides, moonrise/set, eclipses, and weather simulation are not implemented. Gregorian phase approximation uses elapsed calendar days at midnight and a mean synodic period, so it is not suitable for astronomical predictions.
