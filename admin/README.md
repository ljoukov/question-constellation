# Analytics admin

Private SvelteKit explorer for the first-party `question-constellation-analytics` D1 database.

The deployed Worker is named `constellation-admin`.

For local development, copy the Cloudflare account credentials used by the root app into `admin/.env.local`, then run `npm run dev` from this directory. Local development is intentionally allowed without an admin password when neither `ADMIN_PASSWORD` nor `ADMIN_ALLOWED_EMAILS` is set.

Production fails closed until it has authentication. Either protect the Worker with Cloudflare Access and set `ADMIN_ALLOWED_EMAILS`, or set a Basic Auth secret before deployment:

```sh
npx wrangler secret put ADMIN_PASSWORD
npm run deploy
```

The current deployment derives a domain-separated admin password from the local `AUTH_COOKIE_SECRET`, so the underlying Firebase cookie secret is never reused or uploaded. Username: `admin`. To display the derived password locally when needed, run `npm run password` from this directory.

The Worker binding is `ANALYTICS_DB`. The public application writes to the same binding; this app only reads it.

The AI overview additionally needs `CHATGPT_CODEX_PROXY_URL` and `CHATGPT_CODEX_PROXY_API_KEY` as Worker secrets/vars. Jobs are stored in D1 and polled by the UI. Deployed generation runs in the `ANALYTICS_SUMMARY_WORKFLOW` Cloudflare Workflow; `waitUntil` protects the fast enqueue operation. Local Vite development falls back to direct `waitUntil`/in-process generation because Workflow bindings are only available under Wrangler.

Before production, review [the analytics data inventory and governance proposal](../docs/analytics-data-governance.md), configure a daily retention call, and explicitly accept or change the proposed 90-day raw / 30-day summary retention. Protected deletion and retention APIs live at `/api/privacy/delete` and `/api/maintenance/retention`; both require explicit confirmation text.
