# Writing wiki pages

Everything you can type on a Wiki page. Page text is Markdown with some wiki extras: links between pages, pages shown inside other pages, info boxes, read-aloud boxes, columns, styled words, HTML and text only the GM sees.

You don't need to remember any of it. In **Write** mode the **Insert** menu puts any block below at the cursor, the **Style** menu styles the words or lines you selected, and the preview beside the text shows the page as readers will see it.

## Words

- `**bold**`, `*italic*`, `~~struck through~~` and `==highlighted==`.
- A backtick (the key left of 1) on each side of words shows them in a typewriter font, like `this`.
- `[a website](https://example.com)` links to a website.
- `{{Vessa|The old name for the river}}` shows the note when someone hovers over *Vessa*.
- `Text.[^1]` with a line `[^1]: The note.` anywhere below adds a numbered footnote, listed at the end of the page.

## Links between pages

- `[[Ravenmoor]]` links to the page called Ravenmoor. Typing `[[` or `@` lists the pages to pick from.
- `[[Ravenmoor|the old keep]]` shows other words for the link.
- `[[Ravenmoor#History]]` opens Ravenmoor at its **History** heading. `[[#History]]` jumps to a heading on the same page.
- A link to a page that doesn't exist yet shows in red. Click it to create the page, inside the page you are on.
- On your own pages, a small lock marks links to pages players can't see.
- Hover a link to preview the page.

## Headings, lists and tables

- `## Heading` and `### Smaller heading`. Headings are listed under **On this page** beside the page, and each one can be linked to.
- `- item` for a list, `1. item` for a numbered list (the numbers count themselves), `- [ ] task` for a checkbox.
- `> words` for a quote, `---` on its own line for a rule, three backticks above and below for a code block.
- A table:

  ```
  | Name   | Rank    |
  | ------ | ------- |
  | Oswin  | Captain |
  ```

  Put `:` in the divider line to align a column: `:---:` centres it, `---:` puts it on the right.

## Showing one page inside another

Put an exclamation mark before a link, on a line of its own:

- `![[Ravenmoor]]` shows the opening of Ravenmoor (its text up to the first heading), with a link to read the rest.
- `![[Ravenmoor#History]]` shows only the History section.
- `![[Ravenmoor|full]]` shows the whole page.
- `![[table:Rumours]]` (or `[[table:Rumours]]` on its own line) shows a random table with a Roll button.

The shown page stays up to date: change Ravenmoor and every page showing it changes too. Players see a shown page only if they can see that page, and never its secrets.

## Boxes

A box starts with `:::` and a name, and ends with `:::` on its own line. Boxes can go inside other boxes.

### Info box

```
::: infobox Ravenmoor
Kind: Fortress
Ruler: [[Lady Isolde]]
Population: 1,200
(gm) Secret: The well leads to the catacombs
:::
```

It sits at the right of the text (write `::: infobox left` for the left). With no name after `infobox`, it uses the page's title. Rows starting `(gm)` are only yours.

### Read-aloud, notes and handouts

```
::: read-aloud
Rain hammers the shutters. Somewhere below, a door slams.
:::
```

- `::: read-aloud` is boxed text to read to the players. Add a title after it: `::: read-aloud Entering the hall`.
- `::: note`, `::: tip` and `::: warning` (or `::: danger`) are coloured notes. A title can follow the name.
- `::: handout` looks like a letter the players find. `::: handout notice` looks like a posted notice.
- The Obsidian style works too: `> [!note] Title` followed by lines starting `>`.

### Columns

```
::: columns
The left side.
+++
The right side.
:::
```

Put `+++` between columns, up to four. On a phone they stack.

### Lists of pages

```
::: pages
kind: place
inside: [[The Northern Reaches]]
sort: changed
limit: 10
show: cards
:::
```

A list that keeps itself up to date. Every line is optional:

- `kind:` one kind or several with commas: place, character, organization, quest, item, map, session, page.
- `inside:` only the pages inside that page.
- `sort: changed` puts the most recently changed first (the default is by title).
- `limit:` the most pages to show.
- `show: list`, `show: cards` (with each page's opening words) or `show: table` (with when each changed).

Players see only the pages they can open.

## Styling words and lines

Put words in square brackets and the style in curly brackets right after:

- `[a whisper]{size=small}`, `[THE KING IS DEAD]{size=huge}`. Sizes: small, big, huge.
- `[Ye olde shoppe]{font=hand}`. Fonts: serif, sans, hand (old handwriting), mono (typewriter), display (the heading font).
- `[blood on the stones]{color=crimson}` for coloured words, `[important]{bg=brass}` for a highlight behind them. Colours: crimson, ember, brass, verdigris, lapis, amethyst, muted, or a hex colour like `#3a7`. The named colours change for dark mode so they stay readable.
- `caps`, `bold` and `italic` work too, and styles combine: `[Wanted]{font=display size=big color=ember caps}`.

For whole lines, use a style box:

```
::: style align=center size=big
By order of the Duke
:::
```

`align=` can be left, center or right.

## Only for the GM

Three ways to keep text from players. The server takes it out before a player's page is sent, so it never reaches their browser.

- A secret box:

  ```
  ::: secret
  The innkeeper is the cult's leader.
  :::
  ```
- `%%an aside in the middle of a sentence%%`.
- A line starting `(gm)`, in an info box or anywhere in the text.

On your own page they show with a lock so you can tell what players miss. When a player may edit a page (their own character, say), they can't change text that holds GM-only parts.

## HTML

For layouts Markdown can't do, write HTML in an HTML box:

```
::: html
<div style="text-align:center; border:2px solid #864; padding:12px">
  <b>The Gilded Goose</b><br>Rooms, ale and no questions
</div>
:::
```

`[dohtml]` … `[/dohtml]` works too, the same as in the Forum. The same filter as the Forum applies: tags, attributes and styles are allowed, but scripts, event handlers, frames, forms and outside pictures are taken out. On your page, a note says when something was left out.

## Rolls, tables and Maptable

- `[[1d20+5|Attack]]` is a chip that rolls when clicked.
- `[[table:Rumours]]` in a sentence rolls a random table.
- `[[maptable:<scene>|The bridge]]` opens a battle map in Maptable. Players don't get these links.

See [Wiki basics](Encyclopedia-Basics) for pages, templates and the sidebar.
