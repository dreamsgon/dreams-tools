# Deploy RPG Tools to Vercel

This version runs standard Next.js on Vercel's Node.js runtime. No Cloudflare Worker binding, Sites project, or ChatGPT authentication headers are needed. The owner's production deployment is https://dreams-tools-sable.vercel.app; see [current status](docs/DEPLOYMENT_STATUS.md). The steps below also document setup for other deployments.

## 1. Create the services

- GitHub: use [dreamsgon/dreams-tools](https://github.com/dreamsgon/dreams-tools), branch `main`. Both tools are at the repository root; use Root Directory `.` in Vercel.
- [Vercel: new project](https://vercel.com/new): import that repository. Select **Next.js**, Node **22.x**, install command `npm ci`, build command `npm run build`, and leave Output Directory at the framework default. The repository root contains package.json and vercel.json; do not select the parent DNDApp folder. GitHub Pages is not the deployment target.
- [Supabase dashboard](https://supabase.com/dashboard): create a project for authentication. No application database tables or service-role key are required.
- [Amazon S3 bucket console](https://s3.console.aws.amazon.com/s3/buckets): create a dedicated **general-purpose** bucket. Use a globally unique name without dots, record its region, keep **Block all public access** on and **ACLs disabled**, and use the default SSE-S3 encryption for this setup. Do not enable static website hosting.

Save the Vercel production URL (for example `https://your-maptable.vercel.app`). You can configure that URL in the following steps and redeploy after setting variables. Source privacy and website access are separate: map APIs require an account even if the website's sign-in page is public.

## 2. Set up multiple accounts in Supabase

Enable the Email authentication provider and email/password signup. Keep email confirmation enabled; this app only accepts verified email accounts. Users register at `/account` and get their own private workspaces. To limit registration, disable public signup in Supabase and manage confirmed users through its dashboard.

In Auth URL Configuration, set Site URL to your production Vercel origin. Add these allowed redirect URLs, replacing the domain:

```text
https://your-maptable.vercel.app/auth/finish
https://your-maptable.vercel.app/auth/finish?recovery=1
http://localhost:5173/auth/finish
http://localhost:5173/auth/finish?recovery=1
```

Add your custom domain or an exact trusted preview URL if you use one. Keep the default confirmation/recovery email link behavior that returns an authorization code. This app exchanges that code at `/auth/finish` using the cookie PKCE verifier. Open confirmation/reset links in the same browser that initiated the request.

**Configure custom SMTP before inviting normal users.** Supabase's default mail service only delivers to project-team addresses. SMTP belongs in Supabase, not the application's environment variables. Test registration, confirmation, login, logout, password reset, and Remember me. See [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

Copy the project's URL and **publishable key** into the two NEXT_PUBLIC variables below. Do not use a service-role/secret key in a NEXT_PUBLIC variable.

## 3. Give the app access to its private S3 bucket

Create a dedicated IAM identity/access key for this app. Attach [docs/s3-iam-policy.json](docs/s3-iam-policy.json), replacing `YOUR_BUCKET` and adjusting `maptable/` if you choose a different prefix. Store the key only in Vercel/server environment settings. Never use an AWS root-account access key.

The template grants GetObject, PutObject and DeleteObject within the application's prefix. ListBucket on the dedicated bucket is included because S3 otherwise returns 403 for missing objects; the first workspace read needs 404 to recognize a new account. See [AWS GetObject permission behavior](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html). The app exposes no bucket-listing endpoint.

In the bucket's Permissions > CORS section, paste [docs/s3-cors.json](docs/s3-cors.json) after replacing the example production origin. Include localhost only if you use this bucket for development. Add each trusted preview/custom domain explicitly. Direct browser uploads use POST; downloads use GET/HEAD. CORS does not make the bucket public.

In Management > Lifecycle rules, create a rule with prefix **`maptable/transfers/`**, expiring current objects after **1 day**. The matching configuration is [docs/s3-lifecycle.json](docs/s3-lifecycle.json). Adjust the prefix if MAPTABLE_S3_PREFIX differs. Apply this rule only to temporary transfers, never the entire app prefix or `users/`. If bucket versioning is enabled, also expire noncurrent versions/delete markers for this temporary prefix. Existing immutable workspace segments are intentionally retained; their cleanup is future work.

The console link to manage all buckets is [Amazon S3](https://s3.console.aws.amazon.com/s3/buckets). A private S3 object URL is not the web application's URL and does not become a public image link. The app issues short-lived signed URLs after authentication.

## 4. Add Vercel environment variables

Set these for **Production**, and separately for Development/Preview if used. The MAPTABLE_ prefix avoids accidentally using Vercel's own AWS runtime variables. Use exactly the names below.

| Variable | Value |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Your Supabase project URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Your Supabase public/publishable key |
| MAPTABLE_S3_BUCKET | Dedicated private bucket name, without dots |
| MAPTABLE_S3_PREFIX | `maptable` by default; separate prefixes for development/preview |
| MAPTABLE_AWS_REGION | The S3 bucket's region, e.g. `us-east-1` |
| MAPTABLE_AWS_ACCESS_KEY_ID | Dedicated IAM access key ID |
| MAPTABLE_AWS_SECRET_ACCESS_KEY | Its secret access key |
| MAPTABLE_AWS_SESSION_TOKEN | Only for temporary AWS credentials; otherwise omit |

Temporary credentials expire; renew them before expiry. Select secret/sensitive storage for credentials where offered. Set public Supabase variables before building because Next.js can inline public variables. Redeploy after any environment changes. `.env.example` lists the same variables; `.env.local` is ignored by Git.

Preview deployments should use their own S3 prefix/bucket. Add their exact origins to S3 CORS and Supabase redirects. Preview and production credentials/state should not be shared accidentally.

## 5. Optional additional S3 image bucket

The main bucket already stores maps and uploads. The app also retains its **S3 object** import and **Your S3 bucket** upload choices for a separately configured image collection:

- Set `S3_BUCKET` to that bucket and `S3_PREFIX` to its base folder (default `maptable/`).
- It uses the same MAPTABLE_AWS credentials and region, so the bucket must be in that region and IAM must also grant GetObject/PutObject for the chosen image prefix.
- Apply GET/HEAD CORS for your app origins to this bucket too. Browser uploads stage through the main bucket; the server forwards the image to the optional bucket.
- Image keys are isolated by account: `S3_PREFIX/users/supabase%3A<USER_UUID>/maps/forest.webp`. Connections shows the exact personal folder. Enter only `maps/forest.webp` in the importer.
- The `%3A` above is a literal part of the stored object key. Do not substitute a colon when manually placing images through the console.

For a bucket you already used with the old single-owner app, copy the desired images into the correct user's folder or migrate them through an embedded-image JSON backup. The app deliberately does not expose the old shared prefix to every new account.

Public image links can still be imported through **Image URL** when the host allows cross-origin image reads.

## 6. Deploy and verify

Deploy from Vercel after saving the variables. No custom start command or static export is needed. Then:

1. Register and verify two test accounts (or create confirmed test users in Supabase).
2. In account A, upload a map, create a campaign, add tokens/fog, save, reload, export a player image and a JSON backup.
3. Sign in as B in a separate browser/profile. It must have an independent workspace and cannot read A's `/api/assets?id=...` URL or settings.
4. Upload an image larger than 4.5 MB but smaller than 20 MB. It should use a direct S3 POST and finish successfully. Test a large workspace save/load and a 4.5–9 MB Discord render if using Discord.
5. Open the same account in two browsers. Save competing edits and confirm the stale revision receives a conflict instead of overwriting newer data.
6. Test email confirmation/password reset and optional S3/Discord connections. Generate a campaign agent key, check read-only/edit access, and revoke it.
7. Import existing campaign backups only after these checks. Keep your original app and backups until the restored campaigns/images are verified.

Unit tests use local fakes and do not prove your IAM, CORS, SMTP, or hosted environment is configured. These live checks remain in TODO.md.

## Limits and troubleshooting

- Vercel's function request/response limit is 4.5 MB. The app keeps normal JSON requests under 3 MB and transfers larger workspace payloads via private S3 staging. Map images accept up to 20 MiB; Discord renders up to 9 MiB; staged workspace request JSON up to 50,000,000 bytes. Existing per-segment save limits still apply. [Vercel limits](https://vercel.com/docs/functions/limitations)
- Agent/MCP edits should be split into JSON batches under 3 MB, reading the returned revision after each. Large reads can return `{downloadUrl}`; the included MCP/browser client handles it without forwarding the campaign key.
- Signed storage URLs expire after five minutes. They grant temporary access to that one object; keep them private. Reconnect/reload if one expires. Vercel deployment protection may block MCP clients before application authentication; use the intended production domain and configure hosting access accordingly.
- Storage 403 on a new account: check IAM, including ListBucket, correct region/prefix, and all MAPTABLE_AWS variables. Do not make the bucket public to fix it.
- Browser upload/download blocked: check exact-origin S3 CORS, including POST, and allow the app's network requests in the browser.
- Email not delivered: configure custom SMTP and check Supabase logs/redirect settings.
- Callback expires or fails: initiate a fresh link and open it in the same browser; check the exact allowed redirect URL.
- Production data is not stored in the Vercel filesystem. Do not expect old `.wrangler/state` files to migrate themselves.

## RPG Encyclopedia

The same deployment now serves `/encyclopedia` alongside `/maptable`, linked from `/`. No extra database, bucket or environment variables are required. The existing private S3 bucket and Supabase account support both modules; the `MAPTABLE_` environment names are retained for compatibility. Encyclopedia saves and images are separate from Maptable.

Follow [docs/ENCYCLOPEDIA.md](docs/ENCYCLOPEDIA.md) for migration and optional read-only MCP setup. Encyclopedia workspace JSON is capped at 2 MB; uploaded atlas images at 8 MB. Test two-account isolation, public player-link filtering, fog masks, save conflicts, and replacement/revocation on the deployed site. Revocation stops new authorized requests; already issued signed image URLs can remain valid for five minutes. The optional additional S3 image connection belongs to Maptable; encyclopedia images use the main private bucket.

