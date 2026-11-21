# Characters and the rollable sheet

A character page can have a **Stats** tab that works as a full, system-agnostic **rollable sheet**: stats in groups, named rolls with formulas that read other stats, targets and spending from trackers.

![The Stats sheet](images/stat-sheet.jpg)

## The Stats sheet (GM)

Stats show in their **groups** (sections) with search. Each stat has a value control (− / + for numbers, text, checkbox, list, long text) and any number of **named rolls** (up to 6). Pick **Normal**, **Advantage** or **Disadvantage** at the top before rolling.

- **Add a stat** or **Change** opens one dialog: name, group, kind of value, a short note under the name, a description, rolls with a live preview, a **GM only** checkbox, and what it spends.
- **Arrange stats** re-orders and regroups. Renaming a stat renames it inside other stats' formulas too.
- Roll buttons read *Roll 1d20+3*. If a roll can't roll yet, a hint says why (for example, a missing value).

![Change a stat](images/stat-dialog.jpg)

### Formulas

Put values in `{ }` inside a roll:

| Write | Meaning |
|---|---|
| `{value}` | This stat's own value |
| `{Agility}` | Another stat by name (a checkbox counts as 1 or 0) |
| `{Agility mod}` | Another stat's worked-out value |
| `floor`, `ceil`, `round`, `min`, `max`, `abs`, `+ - * / ( )` | Arithmetic |

Examples: `1d20+{Brawn mod}`, `{value}d6>=5`, `2d6+{value}`. Plain numbers added after dice are totalled (1d20+2+2 shows 1d20+4).

- **Worked out from the value** (`derived`): for example `floor(({value}-10)/2)` is shown beside the number and usable as `{Name mod}`.
- **Target**: each roll can need *at least* or *at most* a number or another stat. The roll card shows **Success** or **Fail**, and Discord posts get it too.
- **Using it spends**: a roll can spend from a tracker by name (for example Stress or Ammo); the character needs a tracker with that name.

### Starter layouts

On the empty Stats tab, or from **Add a layout**, pick a starter by mechanic. They use generic placeholder names and no rulebook text:

- **d20 + modifier**
- **Dice pool** (`{value}d6>=5`)
- **Roll under d100** (Roll and Hard targets)
- **2d6 + stat**

A layout adds its stats after the sheet's own and skips names already on it.

## Trackers

At the top of the Stats tab, **Trackers** are small gauges (up to 8): Shields, Stress, Ammo, Fuel, Hit dice or your own, shown as a **bar** or as **pips** (up to 20) with − and +, a maximum, a colour and an **eye** to hide it from players. Players see shown trackers when stats are shared. A player who may edit the character moves and edits their own trackers from their player page.

## Statblocks

The **Statblock** tab takes any pasted statblock as-is and finds dice, "+5 to hit" and ability and skill modifiers, turning them into click-to-roll chips (turn this off per statblock; `[[…]]` always works). It starts GM only. Switch it to **Players** for a familiar, summon or companion the party runs: players then see it on a Statblock tab in their player view and can roll from its chips, and any statblock lines pinned to the Profile show there too. Hiding the tab makes it GM only again. Maptable tokens linked to the character show the statblock read-only on the token's Statblock tab.

## Players rolling

When the Stats tab is **Player visible**, players get a read-only sheet in its groups with values, worked-out values, notes and roll buttons. Everything is worked out on the server, so formulas and GM-only stats never reach them. A roll that needs a GM-only stat says "Your GM hasn't finished this roll yet." A signed-in member rolling a character they may edit rolls **on the server**: it goes to the roll log and to Discord with the character's picture, with Success or Fail. Anyone else rolls locally.

## From Maptable

Tokens can **link** to a Wiki character (tokens added from the Wiki link automatically). A linked token's menu offers **Roll from <name>'s sheet** and the roll goes through the dice tray, which can post to Discord.

> **Tutorial: a skill with a modifier**
> 1. Stats tab › **Add a layout** › *d20 + modifier*.
> 2. Open a number stat such as an ability (here called *Might*), set **Worked out** to `floor(({value}-10)/2)`.
> 3. Add a roll named *Check* with `1d20+{Might mod}` and a target *at least 12*.
> 4. Set Might to 14 and press **Roll 1d20+2**. The card says Success or Fail.
