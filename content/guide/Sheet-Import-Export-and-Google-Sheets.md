# Sheet import, export and Google Sheets

Three ways to bring a character from another game or tool into RPG Tools, and one way to get it out.

## Import a character sheet with an AI (any game)

Works for any game system. The AI app (ChatGPT or Claude) turns your sheet into a standard **`rpgtools-sheet`** JSON file that RPG Tools reads.

1. In the Encyclopedia open **Characters › Import sheet** (a new character), or a character's sheet section › **Import a sheet** / **Import again** (to update).
2. The dialog **copies a prompt** that includes the game system and your campaign's stat form, so the AI reuses your field names. Paste it into ChatGPT or Claude along with your sheet (text, PDF text, or notes).
3. Paste the AI's reply into the dialog, or upload a `.json`. Chat around the JSON and code fences are ignored.
4. **Check step**: you see token slots, every field matched to your stat form by name (choose *Use*, *Add as new* or *Don't import*), trackers, rolls, tabs, traits and anything the AI couldn't place.
5. Confirm. Fields go on the campaign's stat form (new ones in their own section, player visible for a PC, GM only otherwise), gauges become **trackers**, HP, AC, initiative, speed and rolls go into an imported sheet ("X attack" and "X damage" pair up), lists become page tabs, traits become Profile chips, and anything unplaced lands in a GM-only **Not imported** tab.

![The check step](images/sheet-import-check.jpg)

An **update** changes only what the file has, and a linked Google Sheet is never replaced. Dice the roller can't read are left out and listed. Players can't store an imported sheet.

## Export a sheet

A character's sheet section › **⋯ › Export as .json** saves an `rpgtools-sheet` file that Import sheet reads back into the same page. Choose:

- **Everything** (for you or your own VTT), or
- **What players can see**, which leaves out GM-only fields, trackers, tabs, traits and page text, and also the stats, trackers and sheet when the Stats tab is GM only.

A Google sheet's cached values are exported, never its link or cells.

## Link a Google Sheet

A character page can link one Google Sheet. Its **Profile** tab then shows a **Character sheet** section with chosen cells copied from it: HP (with a maximum and your own label such as Stress), AC, Initiative, other stats and rolls with their formulas.

**Two ways to link**

- **Published link (no setup).** In Google Sheets: File › Share › **Publish to the web**, pick the tab and **CSV**, and paste the link under *Link a character sheet*. Publishing makes it readable by anyone with the link.
- **Sign in with Google.** Google's own file picker lets you choose one sheet; your browser reads it (scope `drive.file`, only files you pick). Nothing is stored on the server. This needs a one-time setup by the site owner; until then the button says it is not set up.

**Which cells.** A tab named **`RPG Tools`** with a first row *Name, Value, Roll* is read row by row (HP, Max HP, AC and Initiative fill their slots; a Roll makes a roll). Otherwise click label and value cells in a grid. *Download template* gives an example CSV.

**Rolls.** The sheet section lists roll items by group (Skills, Saves, Attacks, Other). "Longbow attack" and "Longbow damage" become one row with Attack and Damage buttons; a bare "+5" rolls 1d20 plus it. Use Advantage, Normal or Disadvantage first.

**Players.** When Stats are player visible, players see the copied values and formulas, read only, never the spreadsheet id or link. A signed-in member who may edit a character can **Link my sheet**, **Refresh**, **Open** and **Unlink** their own, and roll from it (rolls run on the server and post to Discord as the character). A sheet the GM linked stays the GM's.

**Write HP back (optional).** On a Google sign-in link with an HP cell, turn on **Write HP back to the sheet**. HP controls (−5, −1, set, +1, +5) change the page at once and, after 1.5 seconds of quiet, the browser writes that one cell. It first reads the cell so it can show *Use the sheet's value* or *Write ours* if someone changed it, and never overwrites a formula. In Maptable, tokens linked to such a character write HP too (from the tab where the change was made; changes from other tabs, devices or the AI are not written).

> **Tutorial: a published sheet in two minutes**
> 1. Make a Google Sheet with a tab named *RPG Tools* and rows: `HP,24`, `Max HP,24`, `AC,16`, `Perception,+5,1d20+5`.
> 2. File › Share › Publish to the web › that tab › CSV. Copy the link.
> 3. On the character page choose *Link a character sheet* and paste it.
> 4. Open the sheet section and click *Perception* to roll.

## Notes for the site owner

Google sign-in needs `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_API_KEY` and `NEXT_PUBLIC_GOOGLE_APP_ID` plus the Sheets, Picker and Drive APIs enabled; the steps are in `docs/ENCYCLOPEDIA.md` in the repository. This has not yet been verified against a real Google project.
