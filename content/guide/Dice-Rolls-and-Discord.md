# Dice, rolls and Discord

## The dice tray

Open **Dice** (a button on the tool bar, or in the Tools sheet on a phone). On pages without Maptable's tool bar, a floating Dice button and Roll log appear on every page.

- Click a die to add it to the pool; **right-click** a die (or **long-press** on a phone) to remove one, the reverse of adding (2d6 becomes 1d6).
- **Roll name for Discord**: in a campaign scene, type a name such as *Attack on goblin*. It becomes the title of the roll's Discord card, for **Post** and **Always**. A name typed after rolling applies when you press **Post**. The name also shows in the tray history and roll log.
- The tray shows the latest rolls and the **Roll log** keeps recent ones per browser.

![Dice tray with a roll name posted](images/dice-tray-roll-name.jpg)

## Dice notation

Anywhere that takes dice (tray, sheets, text rolls):

| Write | Meaning |
|---|---|
| `1d20+5` | Roll and add |
| `4d6kh3` / `2d20kl1` | Keep the highest 3 / lowest 1 |
| `2d6!` | Exploding dice |
| `5d10>=8` | Count successes (dice at or over 8) |
| `2d20<=14` | Count dice at or under 14 |
| `4dF` | Plus/minus dice |

Advantage and disadvantage turn a single d20 into `2d20kh1` or `2d20kl1`; other rolls are rolled twice and the higher or lower total kept.

## Rolls inside your writing

In any Encyclopedia article or tab, `[[1d20+5]]` or `[[1d20+5|Label]]` becomes a click-to-roll chip with a result card. A formula needs a die, so `[[1999]]` stays a plain link. `[[table:Name]]` rolls a random table. `{{word|note}}` adds a hover note. Players get rolls as plain, working chips but never the hidden note text.

## Discord

In a campaign's **Connections**, add **named Discord channels**, one webhook each (discord.com, discordapp.com, PTB, Canary, threads and forum posts all work). Each webhook is checked when added and a deleted one shows in red.

For each kind of post you choose **what goes where**: your rolls, the AI's rolls, initiative, combat, exploration and world maps, narration, recaps, or **Don't post**. You can also set a *Post as* name.

- Posts are cards. Rolls show the total large with the roller's token picture; natural 20s are gold and enemies' rolls red.
- **Initiative** is a card that can be kept up to date.
- Rolls from a linked character show Success or Fail when the roll has a target (see [Characters and the rollable sheet](Characters-and-the-Rollable-Sheet)).
- Signed-in members rolling on a player page roll on the server and post as *Member · Label*. Co-GMs and share-link viewers roll locally with a one-line note.

> **Tutorial: post an attack roll to Discord**
> 1. In the campaign's Connections, add a Discord channel with its webhook and set *Your rolls* to that channel.
> 2. Open Maptable, press **Dice**, click a d20 and a d6.
> 3. Type *Attack on goblin* in **Roll name**.
> 4. Roll, then press **Post** (or set it to **Always** to post every roll).
