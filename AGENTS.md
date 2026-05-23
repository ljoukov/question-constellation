## Local Guidance

- Read `docs/product-methodology.md` before changing navigation, data models, onboarding, or Thinking Memory behavior.
- First-use flows should start with subject -> concrete question family/topic -> practice. Do not expose thinking patterns as the main starting taxonomy.
- Thinking Memory is a post-practice retrieval surface. Keep it as one unified library organized by subject, with transfer across topics and subjects still visible.
- The D1 database is bound as `QUESTION_DB` for future use, but the current app intentionally uses generated server-side data only.
- Use `scripts/dev-server.sh start|stop|restart|logs [port]` for local development. It follows the Spark tmux/log pattern but serves plain HTTP on localhost.
- Auth follows the server-side Firebase redirect/session pattern from `~/projects/the-observatory-admin/src/routes/auth`. This repo is a separate Firebase project; do not reuse Observatory Firebase project identity or API keys. Unlike Observatory Admin, Question Constellation should allow every verified Google/Firebase user to enter; do not add an admin allow-list gate.
- This app does not use shadcn components yet. Do not copy shadcn UI assumptions from Observatory Admin unless the project explicitly adopts that component system later.
- Deployments are expected to run on pushes to `origin/main`. Use local `wrangler deploy` only for diagnostics, first-time setup, or emergency manual repair.
- Local `.env.local` may contain Cloudflare operator credentials: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCOUNT_ACCESS_TOKEN`, and `CLOUDFLARE_API_TOKEN`. Use these only to authenticate Wrangler or API calls; never upload `CLOUDFLARE_*` keys into the Worker runtime.
- Runtime Worker secrets should be `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_API_KEY`, and `AUTH_COOKIE_SECRET`. Sync them with `wrangler secret bulk` or the GitHub Actions workflow secrets.
- For full-screen visual pages, keep the shell stable with `min-height: var(--app-viewport-height, 100vh)`, flex column layout, and `flex: 1 1 auto; min-height: 0` for main content regions. Keep background art in stable CSS layers or explicit `aspect-ratio` containers so image or icon loading cannot shift layout.
