# Put this folder on GitHub

This folder contains Vercel-ready Next.js source for [dreamsgon/dreams-tools](https://github.com/dreamsgon/dreams-tools). The application belongs at the repository root on `main`. Follow [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md) to configure Supabase Auth, private S3 storage and Vercel.

## Instructions for the LLM

Read AGENTS.md first. If asked to upload, obtain the target GitHub owner/repository and intended visibility from the user's request or ask only for the missing values. Check whether the target exists before creating or modifying it. Use this folder as the Git root, not its parent DNDApp folder. A private repository is a reasonable default to propose; do not assume permission for public publication.

Before staging, inspect the file list and .gitignore. Confirm no local campaign data, credentials, node_modules, build output, or unrelated RPG modules are being staged. Run the documented checks and report any limitations. Initialize a new repository only when this is the intended fresh destination. Never include the original project's .git directory or history.

For a new empty remote, the equivalent commands are:

```sh
git init -b main
git add .
git diff --cached --stat
git status --short
git commit -m "Prepare RPG Tools maps and encyclopedia"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Replace OWNER/REPOSITORY with the verified destination. Create that empty GitHub repository through an authenticated client or GitHub UI first (avoid adding a separate README/license/.gitignore remotely). If the remote already contains work, fetch and reconcile it instead of forcing a push. Do not put a token in the remote URL. Review staged content before committing. Select a license with the owner; do not assume one.

For GitHub Desktop: add/create a repository using this folder, inspect changes, commit, then publish with the selected name and visibility. GitHub Desktop is useful if Git/CLI authentication is not configured.

## Prompt to give any coding assistant

> Work in the RPG Tools repository. First read AGENTS.md, README.md, DEPLOY_VERCEL.md, TODO.md, and docs/ARCHITECTURE.md. Keep this project limited to Maptable and RPG Encyclopedia. Also read docs/ENCYCLOPEDIA.md. Preserve account isolation, player-link filtering and encyclopedia campaign scopes. Inspect the current branch and local changes, choose the requested TODO item, implement it in a separate branch, run the relevant checks, and update TODO.md with the result and any remaining blockers. Preserve save compatibility, authentication, campaign-scoped agent permissions, and player-export concealment. Do not deploy or publish unless I ask.

Codex and Claude can use the repository instruction files. In T3Code or a DeepSeek/Grok coding interface, open the same repository and paste that prompt if instructions are not discovered automatically. For chat-only access, provide the relevant source files and ask for a patch; model access alone does not grant filesystem or GitHub access.

## Deploy after upload

Import the GitHub repository in Vercel with the Next.js preset and Node 22.x. Use `npm ci` and `npm run build`; leave the output directory at its default. Add the variables from `.env.example` before the deployment build. Follow DEPLOY_VERCEL.md for S3 IAM/CORS/lifecycle and Supabase email/redirect configuration. A private personal GitHub repository is supported by Vercel Hobby; private organization repositories require an appropriate paid plan. See [Vercel Git integration](https://vercel.com/docs/git).
