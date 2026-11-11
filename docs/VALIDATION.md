# Vercel port validation

Checked locally on Windows, 2026-11-10, using Node 22.14.0 and Next.js 16.3.4:

- Dependency installation and lockfile update completed; package/lock dependency and engine metadata match.
- `npm run typecheck`: passed with generated Next.js route types.
- `npm test`: **319 passed, zero failures**, including imported encyclopedia model/export tests and new storage/privacy tests.
- `npm run build`: passed as a standard Next.js production build. Includes RPG Tools home, map, encyclopedia, player view, account/auth, agent, assets, workspace, settings, transfers, S3 and Discord routes.
- `npm run test:http`: passed against a locally started production server. Verified the RPG Tools home, encyclopedia player page, account page, protected map/encyclopedia redirects, rejection of forged old Sites identity headers, unauthenticated private APIs/transfers/agent access, and cross-origin account write rejection.
- Deployment configuration JSON parses; IAM/CORS/lifecycle files contain placeholders for the owner's settings.

New tests cover signed S3 conditional writes, concurrent workspace conflicts, first-write protection, missing revision failures, account/purpose transfer isolation, exact upload size/MIME policy constraints, large response downloads without credentials, direct browser uploads, and large-save success/failure without false acknowledgements. Storage tests use a fake S3 HTTP transport; MCP uses a local HTTP fixture. The original map/geometry/fog/rendering/save/agent tests remain included.

The Windows sandbox prevented some generated build writes and local loopback networking; builds and network fixture checks were rerun with those environment restrictions lifted. No test contacted a real S3 bucket, authenticated a live Supabase user, or posted to Discord.

Not yet performed: live Vercel deployment, actual IAM/S3 signing/CORS/lifecycle checks, real two-account isolation and SMTP flows, a full authenticated desktop/mobile browser acceptance pass, or campaign-data migration. These are explicit owner-configuration checks in DEPLOY_VERCEL.md and TODO.md. Unit/build success does not establish that external services are configured correctly.

The final folder and ZIP exclude installed dependencies, build output, credentials, local runtime state, private campaign data, and Git history. Run npm ci after copying/cloning. The original maptable application was not changed.
