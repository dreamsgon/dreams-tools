# AI connections

RPG Tools can work with an AI two ways. Both are set up under **Connect an AI** (the **AI & GitHub** area in the Encyclopedia). Keys are per campaign and can be revoked at once.

## Way 1: connect an AI app (MCP)

Use ChatGPT, Claude or any app that supports MCP connectors.

1. In the Encyclopedia open **Connect an AI** and make a **named key** for a campaign.
2. Give your AI app the address:
   - `/api/mcp/<key>` for connectors that take only a URL, or
   - `/api/mcp` with the key as a **Bearer** token.
3. For a local assistant there is also a bridge script, `scripts/rpg-tools-mcp.mjs`. Supply the site address and the key privately; never commit them.

### What the AI can do

Each connection has a **mode**: **Help me run the game**, **Run the game** or **Read only**. Inside a mode you set **Do it**, **Ask me** or **Off** for each action:

- **Off** hides and refuses the tool.
- **Ask me** logs a *suggestion* that waits in the AI panel for **Approve**, **Change** or **Skip**. Suggested moves show as dashed tokens on the map.
- Turn off **See GM-only things** to give the AI only the players' view.

Tools, in groups:

| Group | Examples |
|---|---|
| Read | `list_worlds`, `read_campaign`, `search_campaign`, `read_article`, `read_page` (lists a page's ties), `read_recaps` |
| Write pages | `create_page`, `append_to_page`, `add_quest_log`, `set_objective`, `set_quest_state`, `add_codex_find`, `write_session_notes`, `tie_pages` |
| Dice | `roll` (fair server-side dice, posted to Discord when set up) |
| Table (paired Maptable campaign only) | `move_token`, `damage`, `heal`, `set_condition`, `show_token`, `reveal_fog` |
| Combat | `start_combat`, `next_turn`, `end_combat` |
| Pictures | `view_scene` (the scene as an image: map, grid squares, tokens with names and HP, effects, fog, GM or players view) |

Ready-made **prompts**: `prep_session`, `recap_session`, `run_scene`, `run_combat`, `story_so_far`.

### Seeing what the AI did

The **AI connected** chip opens the AI panel with an **activity log**. You can **Undo** a change (pages edited since are left alone) and **Pause** the connection. Maptable shows a similar chip with the combat line. The apps keep working while an AI edits: your unsaved edits are joined with the AI's saves instead of blocking.

A simpler read-only encyclopedia connection exists too: create a **read-only agent key** in the encyclopedia's Connections, and run `scripts/encyclopedia-mcp.mjs` with `RPG_TOOLS_URL` and `ENCYCLOPEDIA_AGENT_KEY`. It reads private GM material for that campaign only; never give it to players.

## Way 2: paste an API key

A GM can paste an API key from **Anthropic, OpenAI, xAI (Grok), Google AI Studio (Gemini), DeepSeek, OpenRouter, Venice** or any other OpenAI-style API.

1. **Connect an AI › API key**, paste the key and press **Check key** to list its models.
2. Pick a **model**, a **monthly token limit**, a **mode** and the **Do it / Ask me / Off** choices.
3. The key is locked on the server and never sent back to the browser (only its last four characters show).

With a key, the **AI panel**'s **Ask** tab lets the AI use RPG Tools' tools and answer inside the app. Every chat is **saved** with its campaign and available on any device, shared by Maptable and the Encyclopedia. The chat bar switches, searches, renames and deletes chats, and exports Markdown, copy, a session page or Discord (older messages beyond the latest 400 move to part files and are still included in exports).

Features that use an API-key connection: [Check with your AI](World-Maps), [recaps and The story so far](Session-Recaps-and-AI-Writing), [Write with AI](Relationships-and-Family-Trees) in the relationship generators, and Star-system [setting drafts and checks](Star-Systems-and-Space). Without a key, each has **Copy prompt** for your own AI app. **Tokens count against the monthly limit**, even when a call fails.

> **Tutorial: let your AI run a combat**
> 1. Make an MCP key in *Run the game* mode; set `damage` and `next_turn` to **Ask me**.
> 2. Paste the connector URL into your AI app and ask it to start combat on the open scene.
> 3. Watch the dashed suggestions appear in the AI panel; **Approve** a few, **Skip** others, and **Undo** from the activity log if needed.
