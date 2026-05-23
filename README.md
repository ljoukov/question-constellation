# Question Constellation

SvelteKit app for exploring GCSE question families and reusable Thinking Memory patterns.

## Local Development

```sh
pnpm install
scripts/dev-server.sh start
```

Local auth uses the same server-side Firebase redirect/session shape as `the-observatory-admin`.
In development, `/auth/relogin` also allows a local email shortcut.

Required local env values are listed in `.env.example`. Any verified Google/Firebase user can enter.
The D1 database is bound in `wrangler.jsonc`
as `QUESTION_DB`, but the app currently uses generated server-side data only.

## Validation

```sh
pnpm run check
pnpm run test
pnpm run build
```

## Deployment

The repo includes a GitHub Actions workflow that deploys the Cloudflare Worker on pushes to `origin/main`.
The workflow expects these repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_API_KEY`
- `AUTH_COOKIE_SECRET`
