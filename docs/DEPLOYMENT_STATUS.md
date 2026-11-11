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

Custom SMTP is not configured; configure it before inviting ordinary users or relying on confirmation/reset email for non-team accounts. The owner has no sender domain/provider yet and does not want their personal Gmail used as the app sender.

## Live verification and save fix

- The owner received a password recovery email, completed the reset themselves, and signed in successfully. Their earlier registration was a repeat signup for an already-confirmed account.
- Live Maptable saving initially returned S3 HTTP 501. Commit `05fb26d60678455b266e6fbf5808b822041adcd2` adds an exact Content-Length before signing PUT requests, preventing Node from using ordinary chunked transfer encoding. UTF-8 strings, binary subarrays, ArrayBuffers and empty bodies are covered by a real local HTTP regression.
- All 320 tests, typechecking, production build and production HTTP smoke checks passed. Vercel deployed the fix successfully.
- Authenticated Maptable campaign save and full-page reload passed. The UI showed Saved to cloud and retained the campaign.
- Authenticated encyclopedia world save and full-page reload passed. The UI showed All changes saved and retained the world.
- Small entries named Deployment check remain in the owner's account as verification artifacts. Maptable also has a blank Deployment upload check scene inside that campaign; no test image was uploaded.
- Automated image-upload verification was blocked by the browser extension's disabled file-URL access before file selection. Image uploads, large transfers, live conflicts and two-account isolation remain unchecked; this is not evidence of an application upload failure.

Existing campaign/map data has not been migrated. Export backups from the original apps, import into the new account, compare content and images, and retain the originals until verified.

