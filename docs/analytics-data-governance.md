# Analytics data inventory and governance

This is the pre-deployment inventory for the first-party analytics system. The database contains direct identifiers, IP/location metadata, ordinary learner-entered answers, and raw model material. Treat it as restricted production data, especially because learners may be school-age.

## Collected fields

### Browser journey events

- Identity: generated anonymous id, generated 30-minute session id, authenticated Firebase uid, email, and display name when signed in.
- Page context: event id/type/time/sequence, page-view id, full URL, path, query string, title, referrer, and app version/environment.
- Page behavior: page-view and page-leave events, total duration, visible/engaged duration, maximum scroll depth, form submission, and client-error message/file/line/column.
- Interaction context: element tag, id, CSS classes, normalized visible/ARIA label text, role, name, href, generated selector, and click coordinates/button.
- Ordinary input changes: field name/type, current value, previous value, trigger, and value length. Identical `input`/`change` values are deduplicated.
- Unconditionally redacted: password, hidden, file, token/secret/API-key/auth, credit-card/CVV/security-code, OTP/one-time-code fields, and every `data-analytics-redact` subtree. `data-analytics-ignore` subtrees are not recorded.

### Browser, device, network, and request context

- Browser/OS/device: full user agent, parsed browser/version, operating system, mobile/tablet/desktop class, viewport, screen size, approximate device memory, and logical CPU count.
- Best-effort network hints: Network Information API `effectiveType`, downlink estimate, RTT estimate, and save-data preference. Browsers generally do not reliably expose whether the connection is Wi-Fi.
- Request metadata: IP from `CF-Connecting-IP`/`X-Real-IP`, accepted languages, CF Ray, and every available request header except the credential-bearing exclusions below.
- Cloudflare request context: country, region/code, city, postal code, timezone, colo, continent, latitude/longitude, ASN/organization, and the full serializable `request.cf` object (which may also contain HTTP/TLS/priority/RTT/bot-management fields when Cloudflare supplies them).
- Never stored: `Cookie`, `Authorization`, `Proxy-Authorization`, `CF-Access-JWT-Assertion`, or `X-API-Key` headers.

### Runtime model calls

- Linkage: model-run id, session/anonymous/user identity, route/path, environment, app version, IP, user agent, sanitized headers, and Cloudflare context.
- Request: feature name, exact model, requested thinking level, raw prompt, raw structured model input, and feature metadata.
- Result: status, start/completion time, duration, model version, raw output, available raw thought/reasoning channel text, usage JSON, cost, and error name/message.
- Current learner-facing integrations: general answer grading, English Literature step grading, and experimental paper grading. Analytics writes are non-blocking and must never fail the learner action.

### AI overview jobs

- Job scope/status/requester/timestamps/duration, environment/window, model/version/thinking level, source snapshot JSON, exact overview prompt, raw available reasoning, Markdown summary, usage/cost, and error.
- The overview prompt tells the model not to reproduce hidden chain-of-thought and to distinguish evidence from inference. The restricted admin can still inspect the stored raw reasoning evidence.
- Deployed generation is a Cloudflare Workflow (available on Workers Free) because observed GPT-5.6 Sol runs take 33-90 seconds and `waitUntil` only extends an HTTP invocation for up to 30 seconds after its response. D1 job polling is independent of Workflow instance retention.

## Access controls

- `admin/` is a separate Worker and is `noindex`, `nofollow`, `noarchive` at HTML and response-header levels.
- Production and local development use the same server-side Firebase Google redirect flow as the public app. Every page and API request verifies the encrypted session and checks the Firebase UID against the two-entry admin allow-list.
- Missing Firebase configuration fails closed. Unauthenticated pages redirect to the login screen, unauthenticated APIs return 401, and authenticated but unapproved users receive access denied.
- No Cloudflare operator token or database credential is uploaded as a Worker runtime variable.

## Retention policy

The deployed admin Worker enforces these defaults every day at 04:17 UTC through a Cloudflare cron trigger:

- Journey sessions/events/requests and raw model calls: **90 days**.
- AI summaries, including copied source snapshots: **30 days**.
- Identifier-free administrative audit rows: **365 days**.

The protected `POST /api/maintenance/retention` endpoint provides an operator-triggered equivalent when called with `confirm: "prune expired analytics"`; days can be overridden within guarded limits. Each automatic or manual prune adds an identifier-free administrative audit row.

## Per-person and per-session deletion

The protected `POST /api/privacy/delete` endpoint accepts scopes `session`, `anonymous`, or `user`. It requires the exact confirmation string `delete <scope> <identifier>`.

- Session deletion removes that session's events, ingestion requests, model runs, session aggregate, and any AI overview whose stored source/prompt contains the session id.
- Anonymous-id deletion removes every linked session, event, request, model run, and affected overview.
- User deletion accepts either uid or email and removes every matching session, event, request, model run, and affected overview.
- The audit log retains only a SHA-256 hash of the deletion target, not the deleted identifier.

Because AI summaries copy source data, deletion removes the entire affected summary rather than attempting an unsafe partial rewrite. D1 backups/time-travel retention must also be considered in the final production privacy policy; application-layer deletion cannot shorten Cloudflare's platform backup window.
