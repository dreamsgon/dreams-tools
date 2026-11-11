# Production deployment

Verified 2026-11-11.

- Site: https://dreams-tools-sable.vercel.app
- GitHub: https://github.com/dreamsgon/dreams-tools (main)
- Vercel dashboard: https://vercel.com/dreamsgon/dreams-tools
- Initial deployed source: 79fefdfe82e6de6bdf8e87ad552a39011e331175; Vercel reported Ready and the live home and account redirect were checked.
- Supabase: existing RPG Tools project, with verified email/password accounts. Production Site URL and both /auth/finish callbacks are saved. Original Site callbacks remain allowed.
- S3 console: https://us-east-1.console.aws.amazon.com/s3/buckets/dreamsgon-rpg-tools-136753589849?region=us-east-1
- Bucket is private, ACLs disabled, public access blocked, SSE-S3 encryption. App prefix is maptable/. Dedicated IAM user dreams-tools-vercel has ListBucket plus GetObject/PutObject/DeleteObject only under that prefix.
- S3 CORS allows only the production origin, GET/HEAD/POST, all request headers, ETag exposure and a 3600-second cache.
- Lifecycle rule ExpireTemporaryTransfers expires only maptable/transfers/ after one day.
- All seven required environment variables are saved as sensitive Production variables in Vercel. No AWS credentials belong in this repository, ZIP, browser code or documentation. Preview/Development are not configured.

## Remaining work

Custom SMTP is not configured; configure it before inviting ordinary users or relying on confirmation/reset email. Authenticated live save/upload/reload, two-account isolation and other acceptance checks in TODO.md remain pending. Local tests and deployment readiness do not prove those flows.

Existing campaign/map data has not been migrated. Export backups from the original apps, import into the new account, compare content and images, and retain the originals until verified.

