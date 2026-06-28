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

There is no login flow in the current UI pass. The D1 database is bound in `wrangler.jsonc`
as `QUESTION_DB`; deployed Workers use the native binding, while local Vite development uses
Cloudflare REST credentials from `.env.local`.
Question-paper image assets are stored in the `question-constellation` R2 bucket through the
`QUESTION_R2` binding and served by the app from `/images/papers/...`. Local Vite uses the same
route with Cloudflare R2 REST fallback.

## Validation

```sh
pnpm run check
pnpm run test
pnpm run build
```

To import the currently chained question set into D1:

```sh
pnpm run import:chained
```

For the script-first AQA Separate Science extraction/import pipeline:

```sh
pnpm run download:aqa-separate-science
pnpm run extract:aqa-separate-science:batch -- --paper=aqa-84611h-qp-jun24 --chunk-pages=1
pnpm run prepare:import-ready-extraction -- --input-root=data/vision-extracted/aqa-separate-science-higher --output-root=tmp/import-ready-extracted/aqa-separate-science-higher
pnpm run build:existing-chain-context -- --input-root=tmp/import-ready-extracted/aqa-separate-science-higher --output=tmp/existing-chain-context.json
```

`prepare:import-ready-extraction` builds a clean subset, audits it with warnings treated as blockers,
and runs per-paper import dry-runs by default. Add `--import` only when the vetted subset should write
to D1. `build:existing-chain-context` emits the compact chain catalog to pass back into later
extraction runs with `--existing-chains`.

To refresh legacy extracted paper images in R2 after running `pnpm run extract:aqa`:

```sh
CLOUDFLARE_API_TOKEN=... pnpm run upload:r2-images
```

or, with the token already exported:

```sh
pnpm run upload:r2-images
```

The legacy `extract:aqa` command expects the ignored local `data/aqa-combined-science-trilogy-higher/`
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

No Worker runtime secrets are required for the current UI. Local Cloudflare operator credentials
belong only in `.env.local`.
