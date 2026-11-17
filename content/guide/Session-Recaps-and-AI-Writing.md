# Session recaps and AI writing

Make a recap of each session, publish it to players, and keep a running **story so far**, with the AI's help or entirely by yourself.

## Make a recap

![The New session recap dialog](images/session-recap.jpg)

In a **session notes folder** or on a **session page**, choose **New session recap**. Pick the writer:

- **Hand to my AI app**: RPG Tools makes a GM-only draft page and copies instructions for your connected AI app.
- **Write it with my API key**: an API-key connection that may write recaps and read GM-only things writes it in RPG Tools, from up to about 100,000 tokens of transcript, with a token estimate.
- **Me, no AI** (also *Write it myself* on a session page): the page becomes a draft recap you write, with the transcript attached.

**Source**: paste a transcript, upload a `.txt` or `.md` or a Discord chat export (`.json` or `.html`), paste an RP thread, or give a link. **Read the link** fetches a Google Doc or text file shared with "anyone with the link", a GitHub file or gist, or a Notion page published to the web. Then set the title, date, **who is who** (speakers guessed from character pages), recap length, how much to pull out, a note to steer it, and what to make.

A recap has a **draft or published** status, a timeline, quotes, GM notes and a **Check before publishing** list. Timeline and Quotes reach players only when set to Player visible; GM notes never do, and a draft never reaches players or a players-only AI connection. A recap can be posted to Discord when published.

An optional **Check it with AI** reads a recap you wrote against your transcript.

## The story so far

A **front page widget** that sits above the newest sessions. Write it in the front page editor or have it written from the recaps players can read (published and shared, secrets and links removed): either with an API key in one short request that keeps what still holds from the current story, or by your AI app with `read_recaps` and the `story_so_far` prompt. Nothing is saved until you save the front page.

## How the AI writes

Open **How the AI writes** (from the AI connections dialog, **Edit styles** beside any Style menu, or `?styles=recap|story|gen`). Writing styles are kept per campaign (never sent to players) and choose which style recaps, The story so far and generator writing use.

A style sets:

- length and up to two tones;
- who tells it (about the party, as "we", or one character's journal);
- story, bullet points or both; past or present tense; language;
- your own instructions.

**Warm storyteller** is how it always wrote; five built-in styles can be copied but not changed, and a campaign keeps up to 30 of its own. **Try it** writes a sample. Every style has:

- **Write like me**: paste up to 2,000 characters of your own writing; the AI matches how it sounds, not what it says.
- **See the full wording sent to the AI**: shows the locked lines around the lines you can change. Editing them saves your own wording until you press **Go back to the settings**.

A separate **AI chat** tab keeps the campaign's own instructions and reply length for the AI panel's chat.

> **Tutorial: a recap in five minutes**
> 1. In *Sessions*, open the session page and press **New session recap**.
> 2. Upload your Discord export, confirm who is who, choose *Warm storyteller*.
> 3. Press **Write it with my API key**, review the draft and the *Check before publishing* list.
> 4. Publish it, then update **The story so far** on the front page.
