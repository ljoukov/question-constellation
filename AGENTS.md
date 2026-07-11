## Local Guidance

- Read `docs/product-methodology.md` before changing product direction, navigation, data models, onboarding, question-bank surfaces, or retained-chain review behavior.
- Read `docs/product-flows.md` before changing acquisition paths, public question pages, answer-chain pages, constellation pages, practice/check flows, or mobile UX.
- Read `docs/extraction-spec.md` before building extraction agents, importing papers or mark schemes, changing answer-chain derivation, or changing question-bank storage/schema.
- Question Constellation should currently feel like a lightweight public GCSE question bank / exam-question atlas organized by answer chains, not a generic chatbot, full GCSE workspace, or dashboard-first revision app.
- First-use flows should start with a concrete public exam question -> answer chain -> constellation -> practice. Do not expose abstract thinking patterns as the main starting taxonomy.
- Runtime model use should be optional and lightweight; curated questions, model answers, mark checklists, common weak answers, and static answer-chain structure should carry most product value.
- Do not expose a `/thinking-memory` route in the current product. The old retained-chain UI was removed; any future retained-chain review surface should be rebuilt from the question -> chain -> constellation -> practice loop rather than restored as a standalone old UI.
- The D1 database is bound as `QUESTION_DB` for future use, but the current app intentionally uses generated server-side data only.
- Use `scripts/dev-server.sh start|stop|restart|logs [port]` for local development. It follows the Spark tmux/log pattern but serves plain HTTP on localhost.
- When the user says "push", push the current work to `origin/main` directly. Do not create branches other than `origin/main` unless the user explicitly asks for a separate branch or PR.
- When the user says "deploy", unless they explicitly say otherwise, they mean push the current work to `origin/main` and then run a manual deploy.
- The current UI pass has no login flow. Keep public question, chain, constellation, and practice routes usable without auth. If auth is reintroduced later, use this repo's own Firebase identity and allow every verified user; do not add an admin allow-list gate.
- This app does not use shadcn components yet. Do not copy shadcn UI assumptions from Observatory Admin unless the project explicitly adopts that component system later.
- Deployments are expected to run from Cloudflare on pushes to `origin/main`, not from GitHub Actions. Use local `wrangler deploy` when the user explicitly asks to deploy, and otherwise only for diagnostics, first-time setup, or emergency manual repair.
- Local `.env.local` may contain Cloudflare operator credentials: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCOUNT_ACCESS_TOKEN`, and `CLOUDFLARE_API_TOKEN`. Use these only to authenticate Wrangler or API calls; never upload `CLOUDFLARE_*` keys into the Worker runtime.
- The public UI is D1/R2-backed. Deployed Workers should use native `QUESTION_DB` and `QUESTION_R2` bindings. Local Vite development should use Cloudflare REST fallback from `.env.local`; do not replace the dev server with `wrangler dev` just to get bindings.
- Use `pnpm run import:chained` to load the currently chained question subset into D1 from `data/extracted-questions/.../semantic-chains/`.
- No Worker runtime secrets are required for the current public UI.
- For full-screen visual pages, keep the shell stable with `min-height: var(--app-viewport-height, 100vh)`, flex column layout, and `flex: 1 1 auto; min-height: 0` for main content regions. Keep background art in stable CSS layers or explicit `aspect-ratio` containers so image or icon loading cannot shift layout.

## Local Signed-In Testing

Use the dev auth override when you need to test authorized pages without Google OAuth.

Set a specific test user in `.env.local`:

```sh
DEV_AUTH_USER_ID=test-user-001
DEV_AUTH_EMAIL=test-user-001@example.test
DEV_AUTH_NAME="Test User"
```

Then restart local dev:

```sh
scripts/dev-server.sh restart 5173
```

Open signed-in routes such as `http://localhost:5173/`, `http://localhost:5173/profile`, or a practice page. In local Vite dev only, `DEV_AUTH_USER_ID` populates `event.locals.user` server-side, so the app reads and writes personal rows for that exact user id. Change `DEV_AUTH_USER_ID` to test another user's persisted local or remote personal data.

When `.env.local` also contains `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ACCESS_TOKEN`, and `PERSONAL_DB_DATABASE_ID`, local dev uses the Cloudflare D1 REST fallback for personal reads and writes. That lets you reproduce a production user's state by setting `DEV_AUTH_USER_ID` to that user's real uid. Do not print or commit those Cloudflare credentials.

This override is gated by SvelteKit `dev`; it is ignored in deployed Workers. Production auth still uses the sealed Firebase session cookie.

## English Literature Practice Validation

When changing English Literature step-by-step practice, validate the teaching experience through the real browser flow, not only through unit tests.

- Simulate a capable GCSE Grade 5-6 learner aiming for Grades 8-9. The coach should teach the missing analytical move without writing the learner's answer for them.
- Inspect at least 10 questions spanning different papers and task shapes: poetry comparison, two-extract comparison, extract plus wider text, whole-text judgement, and single-text analysis. Confirm that stage names, goals, success criteria, and hints fit the exact question.
- Run at least five realistic inputs, including blank or irrelevant work, plausible-but-vague work, partially successful work, a feedback-driven retry, and secure work. Click through the interface and record the exact input, decision, check feedback, and unlock behavior.
- Replay representative scenarios four times with slightly varied wording. Decisions may vary at the margin, but the missing skill, pass threshold, and next action should remain educationally consistent.
- Check every success criterion independently. Feedback must cite what the learner actually wrote, identify only the missing move, avoid moving the goalposts after a retry, and acknowledge a repaired weakness.
- Ground grading in the imported raw mark-scheme rows. Use examiner-report guidance only when it exists for that question or paper; never invent examiner commentary. Treat indicative content as examples rather than mandatory answers, and do not invent or silently correct quotations.
- Verify that later stages stay locked until the active step passes, passed stages remain reviewable, reset works, and direct question URLs redirect to the first step-by-step stage.
- Inspect desktop and mobile layouts for clipping, overflow, unstable heights, and readable feedback. Content quality and task correctness take priority over decorative polish.
- Use `scripts/dev-server.sh` for local development, then run the relevant unit tests, `pnpm run check`, and the production build before push or deploy.
