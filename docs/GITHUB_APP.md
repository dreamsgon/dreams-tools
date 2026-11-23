# Sign in with GitHub (optional)

Without this, a GM connects a campaign's repository with a fine-grained GitHub key they make by hand. With it, the
**GitHub & backups › Connect a repository** dialog shows **Sign in with GitHub**: one click to authorize RPG Tools, and one
more to choose which repositories it may use. Both ways keep working side by side.

## How it works

- RPG Tools is registered as a GitHub App. The GM authorizes it and adds it to the repositories they choose (or all of them).
- `GET /api/github/login` (signed-in RPG Tools accounts only) sets a one-time state cookie and opens GitHub's authorize page.
- `GET /api/github/callback` checks the state, swaps GitHub's code for the GM's user key with the client secret, and returns a
  small page that keeps the key in that browser's localStorage and closes. The server does not store or log the key.
- `POST /api/github/refresh` renews the key when it runs out (GitHub App user keys last 8 hours; the refresh key 6 months).
- From then on the browser talks to api.github.com directly, exactly as with a pasted key. The key reaches only the
  repositories the GM added the app to, and only with the permissions below.

## One-time setup (site owner)

1. On GitHub: **Settings › Developer settings › GitHub Apps › New GitHub App**.
   - Name: e.g. `RPG Tools` (its slug, from the app's URL `github.com/apps/<slug>`, goes in step 3).
   - Homepage URL: the site, e.g. `https://dreams-tools-sable.vercel.app`.
   - Callback URL: `https://dreams-tools-sable.vercel.app/api/github/callback`.
   - Leave **Expire user authorization tokens** on. Leave **Request user authorization (OAuth) during installation** off.
   - Setup URL: `https://dreams-tools-sable.vercel.app/api/github/callback`, with **Redirect on update** on.
   - Webhook: turn **Active** off.
   - Repository permissions: **Contents: Read and write**. Metadata: Read-only (GitHub requires it). Nothing else.
   - Where can this app be installed: **Any account**, so other GMs can use it.
2. Create the app, then **Generate a new client secret**. Note the **Client ID** and the secret.
3. In Vercel (Project › Settings › Environment Variables, Production):
   - `GITHUB_APP_CLIENT_ID` = the Client ID
   - `GITHUB_APP_CLIENT_SECRET` = the client secret
   - `NEXT_PUBLIC_GITHUB_APP_SLUG` = the app's slug
4. Redeploy (the slug is read at build time).

Without all three, the dialog shows only the key steps and the three routes answer 503.

## Pasted keys

A pasted fine-grained key is kept in the browser for that repository and as the key for every campaign, so a key made for
**All repositories** (or for several) connects the next campaign without pasting again. **Forget GitHub on this device** in
the dialog removes all of them and the sign-in.
