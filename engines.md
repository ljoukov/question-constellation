# Engines

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

Open signed-in routes such as `http://localhost:5173/`, `http://localhost:5173/profile`, or a practice page. In local Vite dev only, `DEV_AUTH_USER_ID` populates `event.locals.user` server-side, so the app reads and writes personal rows for that exact user id. Change `DEV_AUTH_USER_ID` to test another user's persisted local/remote personal data.

When `.env.local` also contains `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ACCESS_TOKEN`, and the `PERSONAL_DB_DATABASE_ID`, local dev uses the Cloudflare D1 REST fallback for personal reads and writes. That lets you reproduce a production user's state by setting `DEV_AUTH_USER_ID` to that user's real uid. Do not print or commit those Cloudflare credentials.

This override is gated by SvelteKit `dev`; it is ignored in deployed Workers. Production auth still uses the sealed Firebase session cookie.
