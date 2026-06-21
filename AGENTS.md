## Local Guidance

- Read `docs/product-methodology.md` before changing product direction, navigation, data models, onboarding, question-bank surfaces, or Thinking Memory behavior.
- Read `docs/product-flows.md` before changing acquisition paths, public question pages, answer-chain pages, constellation pages, practice/check flows, or mobile UX.
- Read `docs/extraction-spec.md` before building extraction agents, importing papers or mark schemes, changing answer-chain derivation, or changing question-bank storage/schema.
- Question Constellation should currently feel like a lightweight public GCSE question bank / exam-question atlas organized by answer chains, not a generic chatbot, full GCSE workspace, or dashboard-first revision app.
- First-use flows should start with a concrete public exam question -> answer chain -> constellation -> practice. Do not expose abstract thinking patterns as the main starting taxonomy.
- Runtime model use should be optional and lightweight; curated questions, model answers, mark checklists, common weak answers, and static answer-chain structure should carry most product value.
- Thinking Memory is a post-practice retrieval surface. Keep it as one unified library of earned answer chains organized by subject filters only for navigation, with transfer across topics and subjects still visible.
- The D1 database is bound as `QUESTION_DB` for future use, but the current app intentionally uses generated server-side data only.
- Use `scripts/dev-server.sh start|stop|restart|logs [port]` for local development. It follows the Spark tmux/log pattern but serves plain HTTP on localhost.
- When the user says "push", push the current work to `origin/main` directly. Do not create branches other than `origin/main` unless the user explicitly asks for a separate branch or PR.
- The current UI pass has no login flow. Keep public question, chain, constellation, practice, and Thinking Memory routes usable without auth. If auth is reintroduced later, use this repo's own Firebase identity and allow every verified user; do not add an admin allow-list gate.
- This app does not use shadcn components yet. Do not copy shadcn UI assumptions from Observatory Admin unless the project explicitly adopts that component system later.
- Deployments are expected to run from Cloudflare on pushes to `origin/main`, not from GitHub Actions. Use local `wrangler deploy` only for diagnostics, first-time setup, or emergency manual repair.
- Local `.env.local` may contain Cloudflare operator credentials: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCOUNT_ACCESS_TOKEN`, and `CLOUDFLARE_API_TOKEN`. Use these only to authenticate Wrangler or API calls; never upload `CLOUDFLARE_*` keys into the Worker runtime.
- The public UI is D1/R2-backed. Deployed Workers should use native `QUESTION_DB` and `QUESTION_R2` bindings. Local Vite development should use Cloudflare REST fallback from `.env.local`; do not replace the dev server with `wrangler dev` just to get bindings.
- Use `pnpm run import:chained` to load the currently chained question subset into D1 from `data/extracted-questions/.../semantic-chains/`.
- No Worker runtime secrets are required for the current public UI.
- For full-screen visual pages, keep the shell stable with `min-height: var(--app-viewport-height, 100vh)`, flex column layout, and `flex: 1 1 auto; min-height: 0` for main content regions. Keep background art in stable CSS layers or explicit `aspect-ratio` containers so image or icon loading cannot shift layout.
