# Analytics admin

Private SvelteKit explorer for the first-party `question-constellation-analytics` D1 database.

The deployed Worker is named `constellation-admin`.

For local development, copy the Cloudflare account credentials and Firebase auth values used by the root app into `admin/.env.local`, then run `npm run dev` from this directory.

Production uses the public app's server-side Firebase Google flow: `/auth/start` creates the Google redirect, `/auth/continue` exchanges and verifies the Firebase ID token, and an encrypted HTTP-only cookie maintains the session. Access is checked against the UID allow-list in `src/lib/server/auth/access.ts` on every page and API request. Missing auth configuration fails closed.

The Worker binding is `ANALYTICS_DB`. The public application writes journey and model-call
evidence to the same binding. The admin reads that evidence and writes only restricted
operational records: concise AI-note jobs, reversible person/test classifications, privacy
audit rows, and retention/deletion changes.

The optional cohort note additionally needs `CHATGPT_CODEX_PROXY_URL` and
`CHATGPT_CODEX_PROXY_API_KEY` as Worker secrets/vars. Notes are limited, on-demand summaries of
the active filtered cohort; they are not part of the default overview. Jobs are stored in D1 and
polled by the UI. Deployed generation runs in the `ANALYTICS_SUMMARY_WORKFLOW` Cloudflare
Workflow; `waitUntil` protects the fast enqueue operation. Local Vite development falls back to
direct `waitUntil`/in-process generation because Workflow bindings are only available under
Wrangler.

Local Vite testing can use the root app's development identity by exporting
`DEV_AUTH_USER_ID`, `DEV_AUTH_EMAIL`, and `DEV_AUTH_NAME` before starting the admin app. This
override is compiled behind SvelteKit's development flag and is ignored by deployed Workers.

Review [the analytics data inventory and governance policy](../docs/analytics-data-governance.md). The Worker runs the 90-day raw / 30-day summary retention cron daily. Protected deletion and retention APIs live at `/api/privacy/delete` and `/api/maintenance/retention`; both require explicit confirmation text.
