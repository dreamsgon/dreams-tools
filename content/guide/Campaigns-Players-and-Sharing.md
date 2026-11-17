# Campaigns, players and sharing

## The campaign hub and front page

![A campaign hub on its Dashboard](images/campaign-hub.jpg)

`/campaigns/<campaign>` is one campaign across both tools.

- **Dashboard**: a grid of widgets pulled from the campaign, such as the next session, recent pages, the party and your scenes.
- **Front page**: a list of widgets that players see first on their player site. Widgets include **The story so far** (see [Session recaps and AI writing](Session-Recaps-and-AI-Writing)). Players get only what the front page resolves from shared material; secrets and GM-only pages never reach it.

## Campaign looks

Each campaign can have its own look: a **banner** (choose which part stays in view), an **accent colour**, a **heading font** (Cinzel, Spectral, Schibsted Grotesk, Marcellus, Cormorant Garamond or Space Grotesk) and a **page surface** (plain, parchment, stone, night). Each has light and dark versions. The look applies to the campaign's Encyclopedia pages and, unless you turn it off, to the player site.

## Sharing with players

### Player links

In the Encyclopedia's Connections, create a **player link**. Anyone holding it reads only material you shared; private notes, GM secrets and unrevealed map areas are filtered out on the server. **Replace or revoke** the link to stop access. Picture links already issued can work for up to five more minutes, and downloaded copies can't be recalled.

### Who sees what

- Each page and tab has a visibility setting (for example **Player visible** or GM only).
- Inside any page, wrap text in a secret block and only you will see it:

  ```
  ::: secret
  The innkeeper is the cult's courier.
  :::
  ```

  Players never receive it. An unclosed block hides everything after it.
- Many things have their own **eye** (quest rewards, vehicle values, inventory lines…). A hidden item never reaches the player site.

### Members and groups

![The Members tab](images/members-tab.jpg)

For real accounts rather than a shared link, use the **Members** tab on the campaign page (a campaign with notes has it):

1. **Invite links**: one per group, set to *Join straight away* or *Wait for my OK*.
2. **People**: let in or decline requests, set each member's groups, remove or ban.
3. **Groups and permissions**: Co-GMs, Players and Guests come with every campaign; add up to 20 of your own. Each permission is **Yes**, **No** or **Never** per group. A member can do something when any group says Yes and none says Never; the owner always can.

What members get:

- **Players** open **Open player pages** from *Campaigns you're in* and see the front page and shared pages signed in, without the secret link. A page's **Who can edit** (set by the GM on the page) lets a member edit that page, add sub-pages, and so on from their player site.
- **Co-GMs** open the campaign from *Campaigns you're in*. Read only by default, with GM notes and secrets if their group allows. Permissions can add **Edit Encyclopedia pages** and **Edit maps and run the table** (these also need *See GM-only pages*). Co-GMs can add pictures, stored in the GM's storage.
- You hear about joins and leaves through the notification bell and, if set, Discord.

> **Tutorial: let a friend play**
> 1. Open the campaign's **Members** tab and make an invite link for the *Players* group set to *Wait for my OK*.
> 2. Send the link. When they ask to join, press **Let in**.
> 3. On a character page, set **Who can edit** to that player. They can now update their character from their player site, move trackers and roll from the sheet.
