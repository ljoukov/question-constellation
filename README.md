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
Question-paper image assets are stored in the `question-constellation` R2 bucket through the
`QUESTION_R2` binding and served by the app from `/images/papers/...`.

## Validation

```sh
pnpm run check
pnpm run test
pnpm run build
```

To refresh extracted paper images in R2 after running `pnpm run extract:aqa`:

```sh
CLOUDFLARE_API_TOKEN=... pnpm run upload:r2-images
```

or, with the token already exported:

```sh
pnpm run upload:r2-images
```

`extract:aqa` expects the ignored local `data/aqa-combined-science-trilogy-higher/`
corpus and Poppler tools (`pdfinfo` and `pdfimages`) to be present.
This uploads local files from `data/aqa-combined-science-trilogy-higher/assets/question-papers/`
to R2 keys under `images/papers/`, matching the public route path without exposing the local
`data/` prefix.

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
