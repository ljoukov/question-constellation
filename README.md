# Question Constellation

SvelteKit app for exploring GCSE question families and reusable Thinking Memory patterns.

## Product Docs

- [Product methodology](docs/product-methodology.md)
- [Product flows and mobile mocks](docs/product-flows.md)
- [Extraction specification and D1 schema](docs/extraction-spec.md)

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

The app is configured for Cloudflare Workers through `wrangler.jsonc`. This repo intentionally does
not use GitHub Actions for Cloudflare deployment.

For Cloudflare-side deploys from `origin/main`, connect the GitHub repo in Cloudflare and use:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm wrangler deploy
```

The Worker runtime needs these Cloudflare secrets:

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_API_KEY`
- `AUTH_COOKIE_SECRET`
