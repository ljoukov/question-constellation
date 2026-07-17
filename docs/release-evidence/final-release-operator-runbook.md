# Final release operator runbook

This is the fail-closed order for the July 2026 Question Constellation release. Run it from the
repository root. Stop on every non-zero exit, unexpected count, stale hash, or unexplained diff.
Do not run paper extraction, study-card generation, illustration generation, English model
validation, or full-paper grading concurrently with another model-producing phase.

Direct Wrangler commands below explicitly load operator credentials from `.env.local`; stop if
that file does not provide the required `CLOUDFLARE_*` values. The repository's Node release
scripts already load `.env.local` themselves, including their D1 and R2 paths, so do not export
credentials manually or add a redundant Wrangler flag to those script commands.

## 1. Freeze and integrate the implementation

1. Wait for every paper/code subagent to finish and confirm there is no model process still
   running.
2. Review `git status --short`, the complete diff, generated evidence, and untracked files. Do not
   discard unrelated user work. Raw study-card rollout/event JSONL is deliberately ignored: it can
   contain complete session context and is not release material. The committed
   `model-lineage-evidence.json` files retain its SHA-256 and sanitized nonzero event count plus
   exact summary, prompt, model-output, reviewer-input/output and accepted-artifact hashes.
3. Create a recoverable local implementation commit, then integrate the latest `origin/main`
   directly into the detached/current release commit (no feature branch):

   ```sh
   git add -A
   git diff --cached --check
   git commit -m "Complete GCSE content release"
   git fetch origin main
   git merge origin/main
   ```

4. Resolve any overlap deliberately. Run the focused suites plus `pnpm run check` and
   `pnpm run build` before any remote write. A dirty or failing release candidate is a stop gate.

## 2. Finish and seal all 20 paper imports

The exact cohort is `data/release/selective-paper-cohort-lock.json`. Every final repair must have a
passed `codex-production-import-summary.json`, exact import-ready paper JSON, four distinct current
`gpt-5.6-sol`/`max` phase runs, clean required assets, zero review flags, and a matching D1 import.
`build-current-model-paper-cohort.mjs` orders only those 20 identities and byte-checks every locked
question paper, mark scheme and support PDF. Its v2 manifest embeds the lock hash; the outer batch
rechecks the exact set and bytes before any model process, so a same-count substitution is fatal.
Single-paper runs auto-load the canonical byte-pinned lock for any cohort identity. Before a model
phase, the parent stages read-only, hash-verified source snapshots with canonical support-document
identity; each child re-hashes its own copy. Canonical path/hash inputs and the snapshot mapping are
both attested, and every fresh extraction, judge, chain and solvability artifact is revalidated
before the next phase can consume it.
Use the repaired per-paper result in `tmp/current-model-paper-cohort/retry-runs/` when it exists;
otherwise use `tmp/current-model-paper-cohort/runs/`.

Do not run the old bulk recovered-paper approver. Its seven-paper approval evidence predates
migrations 0026/0028 and is historical only; unsupported response kinds now make those sittings
ineligible.

Stop unless all paper-writing processes are terminal. No later command may alter questions,
chains, steps, overlays, assets, mark rows, checklists, model answers, or source documents.

## 3. Apply Question migrations 0024 through 0028

First prove that the only pending Question migrations are 0024-0028 and that Personal migration
0008 is already applied:

```sh
corepack pnpm exec wrangler d1 migrations list QUESTION_DB --remote --env-file .env.local
corepack pnpm exec wrangler d1 migrations list PERSONAL_DB --remote --env-file .env.local
```

Then apply the Question migrations transactionally and list again:

```sh
corepack pnpm exec wrangler d1 migrations apply QUESTION_DB --remote --env-file .env.local
corepack pnpm exec wrangler d1 migrations list QUESTION_DB --remote --env-file .env.local
```

Failure gates:

- 0024 removes only the exact unsupported guided-seed identities. It is intentionally destructive
  because there are no learner rows requiring compatibility; official Literature practice remains
  fail-closed until a separately reviewed J352 import exists.
- 0025 must either see no targeted June 2023 content on a clean database, or the exact three
  reviewed poetry rows and six delivered source assets. Any partial historical set aborts.
- 0026 must withdraw approvals containing marked unsupported response kinds.
- 0027 must demote every old illustration and install every freshness trigger before new art.
- 0028 must add `approved_content_fingerprint` and withdraw every remaining old approval.
- Never approve a paper before 0028. Never generate fresh art before 0027.

## 4. Rebuild and import the final curriculum mapping

The reviewed mapping evidence hashes include live paper/chain/mark evidence. Rebuild both mapping
families only after every paper write and migration is final. The pre-rebuild Computer Science
artifact is known to be stale for mappings 89-124 after the CS2 repair.

```sh
corepack pnpm run build:reviewed-curriculum-mappings
node scripts/import-curriculum-catalog.mjs \
  --require-complete-question-disposition \
  --output=docs/release-evidence/curriculum-question-disposition-audit.json
node scripts/import-curriculum-catalog.mjs \
  --output=docs/release-evidence/curriculum-catalog-dry-run.json
node scripts/import-curriculum-catalog.mjs \
  --write \
  --output=docs/release-evidence/curriculum-catalog-import.json
```

Stop unless every eligible published question is mapped or explicitly withheld, ambiguity and
unmapped counts are zero, ownership checks pass, and the post-write snapshot exactly matches the
reviewed plan.

## 5. Complete, validate, and import study cards

No other model-producing process may overlap this phase. The runner itself may use at most two
model jobs concurrently.

```sh
node scripts/run-prepared-study-card-completion.mjs --max-concurrent=2
node scripts/run-prepared-study-card-completion.mjs --execute --max-concurrent=2
```

The dry run must preserve the existing hash lock. The final state at
`docs/release-evidence/study-card-prepared-completion/queue-state.json` must be `complete`, with 26
accepted standard jobs (438 cards) and 13 accepted Literature shards (171 cards). Together with
the immutable 24-release baseline (488 cards), the accepted union must be exactly 63 releases and
1,097 cards. It must contain all 171 Literature method/plot/quotation cards and no candidate or
quarantine directory.

Every accepted completion job must also record `lineageManifestPath` and
`lineageManifestSha256`. Each manifest must prove a passed `gpt-5.6-sol`/`max` generator and fresh
independent reviewer with disjoint run ids, exact persisted summaries/prompts/model outputs,
nonzero content-addressed event evidence, and complete generator-output -> accepted-review ->
accepted-artifact semantic learner-content linkage for every card. Catalog/source/offering binding and
normalized choice keys are the only explicit deterministic post-review exclusions. The four
reconstructed baseline releases carry the same gate.
There must therefore be exactly 43 manifests after completion, while no release JSONL is tracked:

```sh
test "$(find data/study-cards/releases -mindepth 2 -maxdepth 2 \
  -name model-lineage-evidence.json | wc -l)" -eq 43
test -z "$(git ls-files 'data/study-cards/releases/**/*.jsonl')"
git check-ignore \
  data/study-cards/releases/example/nested/review-events.jsonl
```

The final verifier does not need the ignored raw streams to remain on the operator VM; deleting or
losing a raw stream after its manifest was materialized must not weaken or bypass any retained hash
or linkage check.

Build the exact expected release-id set from the three locked plans and compare it with the
discovered artifact set **before** any importer phase. Never drive a write from a broad `find`:
an accidental extra accepted directory must be rejected before it can reach D1. Then run only
that exact sorted list through three complete phases. If one artifact fails, stop the phase; do
not start the next phase.

```sh
mkdir -p docs/release-evidence/study-card-imports
mkdir -p tmp/final-release

{
  jq -r '.releases[].releaseId' data/study-cards/final-release-baseline.json
  jq -r '.physicalBatches[].physicalBatchId' \
    docs/release-evidence/study-card-descendant-coverage/tier-safe-execution-queue.json
  jq -r '.shards[].releaseId' \
    data/study-cards/english-literature/ocr-j352-deepening-shard-manifest.json
} | LC_ALL=C sort > tmp/final-release/expected-study-card-release-ids.txt

find data/study-cards/releases -mindepth 2 -maxdepth 2 \
  -name accepted-study-cards.json -printf '%h\n' | \
  xargs -r -n1 basename | LC_ALL=C sort \
  > tmp/final-release/discovered-study-card-release-ids.txt

test "$(wc -l < tmp/final-release/expected-study-card-release-ids.txt)" -eq 63
test "$(uniq -d tmp/final-release/expected-study-card-release-ids.txt | wc -l)" -eq 0
cmp \
  tmp/final-release/expected-study-card-release-ids.txt \
  tmp/final-release/discovered-study-card-release-ids.txt

while IFS= read -r release; do
  artifact="data/study-cards/releases/${release}/accepted-study-cards.json"
  node scripts/import-study-cards.mjs \
    --input="$artifact" \
    --validate-only \
    --output="docs/release-evidence/study-card-imports/${release}-validate.json" || exit 1
done < tmp/final-release/expected-study-card-release-ids.txt

while IFS= read -r release; do
  artifact="data/study-cards/releases/${release}/accepted-study-cards.json"
  node scripts/import-study-cards.mjs \
    --input="$artifact" \
    --output="docs/release-evidence/study-card-imports/${release}-dry-run.json" || exit 1
done < tmp/final-release/expected-study-card-release-ids.txt

while IFS= read -r release; do
  artifact="data/study-cards/releases/${release}/accepted-study-cards.json"
  node scripts/import-study-cards.mjs \
    --input="$artifact" \
    --write \
    --output="docs/release-evidence/study-card-imports/${release}-write.json" || exit 1
done < tmp/final-release/expected-study-card-release-ids.txt
```

The final verifier below independently rejects any missing/unexpected accepted artifact and any
D1 row that differs from the exact accepted union. Existing accepted cards are not regenerated;
the three-or-four-choice rule is prospective.

## 6. Approve only currently eligible full-paper sittings

Generate a fresh v3 database snapshot and an incomplete preapproval cohort view:

```sh
node scripts/verify-selective-paper-cohort-d1.mjs \
  --plan=tmp/current-model-paper-cohort/plan.json \
  --output=docs/release-evidence/selective-paper-cohort-d1-verification.json

node scripts/build-selective-paper-cohort-evidence.mjs \
  --manifest=tmp/current-model-paper-cohort/manifest.json \
  --plan=tmp/current-model-paper-cohort/plan.json \
  --primary-work-root=tmp/current-model-paper-cohort/runs \
  --combined-work-root=tmp/current-model-paper-cohort/retry-runs \
  --database-verification=docs/release-evidence/selective-paper-cohort-d1-verification.json \
  --recovered-evidence=docs/release-evidence/recovered-selective-paper-extraction-input-recovery.json \
  --allow-incomplete \
  --output=tmp/selective-paper-cohort-preapproval.json

jq -r '.papers[] | select(.approvalDisposition.status == "not_approved") | \
  [.sourceDocumentId, .approvalDisposition.reason] | @tsv' \
  tmp/selective-paper-cohort-preapproval.json
```

Only rows reported as `not_approved` and `eligible: true` may be approved. Every other paper must
remain withdrawn and ultimately report `withheld_ineligible`. For each eligible paper, run
`approve-paper-sitting.mjs` first without `--write`, then repeat the identical command with
`--write`. Use the final work root's exact summary and import-ready JSON, the stable past-paper
entry id, a stable reviewer id, and the official first-page duration:

```sh
node scripts/approve-paper-sitting.mjs \
  --summary=<final-work-root>/codex-production-import-summary.json \
  --paper-artifact=<final-work-root>/import-ready/<source-document-id>.json \
  --duration-minutes=<official-minutes> \
  --reviewed-by=<stable-release-reviewer-id> \
  --past-paper-entry-id=<stable-past-paper-entry-id>

# Only after the dry run passes unchanged:
node scripts/approve-paper-sitting.mjs \
  --summary=<final-work-root>/codex-production-import-summary.json \
  --paper-artifact=<final-work-root>/import-ready/<source-document-id>.json \
  --duration-minutes=<official-minutes> \
  --reviewed-by=<stable-release-reviewer-id> \
  --past-paper-entry-id=<stable-past-paper-entry-id> \
  --write
```

Official duration locks for the expected repaired candidates:

| Source document                                                | Past-paper entry id                                         | Official duration |
| -------------------------------------------------------------- | ----------------------------------------------------------- | ----------------: |
| `aqa-8464p1h-qp-jun24`                                         | `aqa-combined-physics-higher-2024-june-paper-1-physics`     |        75 minutes |
| `aqa-8464p2h-qp-jun24`                                         | `aqa-combined-physics-higher-2024-june-paper-2-physics`     |        75 minutes |
| `aqa-computer-science-2024-june-paper-2-computing-concepts-qp` | `aqa-computer-science-2024-june-paper-2-computing-concepts` |       105 minutes |
| `aqa-geography-2024-june-paper-3-geographical-applications-qp` | `aqa-geography-2024-june-paper-3-geographical-applications` |    **90 minutes** |

The Geography duration is locked to the official PDF text “Time allowed: 1 hour 30 minutes”; it
must not be entered as 75. If a different paper unexpectedly becomes eligible, inspect its locked
official PDF and do not guess the duration.

Rerun the v3 D1 verifier after approvals, then build the final tracked cohort evidence without
`--allow-incomplete`:

```sh
node scripts/verify-selective-paper-cohort-d1.mjs \
  --plan=tmp/current-model-paper-cohort/plan.json \
  --output=docs/release-evidence/selective-paper-cohort-d1-verification.json

node scripts/build-selective-paper-cohort-evidence.mjs \
  --manifest=tmp/current-model-paper-cohort/manifest.json \
  --plan=tmp/current-model-paper-cohort/plan.json \
  --primary-work-root=tmp/current-model-paper-cohort/runs \
  --combined-work-root=tmp/current-model-paper-cohort/retry-runs \
  --database-verification=docs/release-evidence/selective-paper-cohort-d1-verification.json \
  --recovered-evidence=docs/release-evidence/recovered-selective-paper-extraction-input-recovery.json \
  --output=docs/release-evidence/selective-paper-cohort.json
```

Stop unless the cohort is schema v4, `passed`, exactly 20/20, database-matched, and every paper is
either exactly current/approved or explicitly `withheld_ineligible`.

## 7. Generate and atomically publish fresh illustration pairs

Run only after migration 0027 and after all paper evidence is sealed. Do not overlap this with any
other model phase.

```sh
ILLUSTRATION_WORK_ROOT="tmp/chain-illustrations/final-release-$(date -u +%Y%m%dT%H%M%SZ)"
node scripts/generate-chain-illustrations.mjs \
  --subject=all \
  --max-chains=20 \
  --work-root="$ILLUSTRATION_WORK_ROOT" \
  --publish \
  --require \
  --release-manifest=docs/release-evidence/chain-illustration-release-manifest.json
```

The runner now fails closed: every selected job must be either an explicit semantic rejection or a
fully validated ready pair before any upload; all sources/files/provenance and D1 identities are
preflighted; all content-addressed R2 objects must upload and verify; source fingerprints are
rechecked; then one transactional D1 batch exposes the complete accepted set. A failed R2 phase
can leave only unreferenced content-addressed objects. No partial D1 illustration release or
partial manifest is valid.

Stop unless the tracked manifest and run summary prove one pass with 1-20 selected chains, unique
planner/judge run ids, exact passed hard checks/judges, and only `published` or semantic-rejection
jobs.

## 8. Local browser, model, and cleanup validation

Set local development auth to the fixed disposable identity (never a production user) and restart
through the project script:

```sh
# In .env.local: DEV_AUTH_USER_ID=ux-cleanup-test-user and matching test email/name.
scripts/dev-server.sh restart 5173
```

Run passive browser checks first:

```sh
node scripts/validate-release-browser.mjs \
  --base-url=http://127.0.0.1:5173 \
  --output=docs/release-evidence/browser-validation \
  --viewport=mobile,ipad,laptop \
  --theme=light,dark \
  --screenshot=viewport \
  --fail-on-issues
```

The final data verifier proves the exact accepted artifact union, 17-offering representation,
1,401 offering/component pairs, 152 selectable deck scopes, and byte-for-byte remote study-card
children. It does not execute the runtime catalog query through each learner offering. Close that
runtime gap with the dedicated offering harness. Run its read-only preflight first; it must prove
the exact ordered 17-offering catalog, all 152 local/remote ready selectable scopes, the 63-release
and 1,097-card accepted union, an exact runtime-card match for every offering, and at least one
canonical three-choice and four-choice runtime card:

```sh
corepack pnpm run validate:study-card-offerings
```

Only after that reports `ready`, run the reveal-only real-Chrome matrix with the explicit
disposable-user cleanup confirmation:

```sh
node scripts/validate-study-card-offering-browser.mjs \
  --base-url=http://127.0.0.1:5173 \
  --output=docs/release-evidence/study-card-offering-browser-validation \
  --execute-offering-matrix \
  --confirm=delete-ux-cleanup-test-user
```

Require 17/17 passed cases, zero recall-review requests, zero unexpected non-Analytics API writes,
zero stored recall reviews/evidence/model runs, and verified cleanup before and after. The harness
configures one exact course/tier scope at a time, re-queries its full card identities immediately
before Chrome, and only reveals the first exact standard card; it never advances or submits a
review. Do not run it concurrently with either model browser harness. This bounded laptop/light
matrix proves offering/runtime wiring only: the mobile/iPad/laptop and light/dark screenshot matrix
above remains a separate release gate.

Choose a control that the fresh cohort evidence says is `withheld_ineligible`. Do not use the
default P1 control if P1 was newly approved. For example, if Combined Biology P1 remains withheld:

```sh
node scripts/validate-full-paper-browser.mjs \
  --base-url=http://127.0.0.1:5173 \
  --output=docs/release-evidence/full-paper-browser-validation \
  --approved-slug=aqa-8464p2h-jun24 \
  --control-slug=aqa-8464b1h-jun24 \
  --control-catalog-path=/past-papers/gcse/aqa/combined-biology-higher/2024-june-paper-1-biology \
  --viewport=mobile,ipad,laptop \
  --theme=light,dark
```

Prepare the exact ten-question English plan, generate the reviewed-input template, fill and review
every scenario/quotation/examiner-evidence field, then run read-only Chrome:

```sh
node scripts/prepare-english-literature-practice-validation.mjs \
  --d1 \
  --base-url=http://127.0.0.1:5173 \
  --minimum-per-kind=2 \
  --require-ready \
  --output=docs/release-evidence/english-literature-practice-validation-preflight.json

node scripts/validate-english-literature-practice-browser.mjs \
  --prepare-input-template \
  --plan=docs/release-evidence/english-literature-practice-validation-preflight.json \
  --base-url=http://127.0.0.1:5173 \
  --output=docs/release-evidence/english-literature-practice-browser

node scripts/validate-english-literature-practice-browser.mjs \
  --read-only-browser \
  --plan=docs/release-evidence/english-literature-practice-validation-preflight.json \
  --inputs=docs/release-evidence/english-literature-practice-browser/reviewed-inputs.json \
  --base-url=http://127.0.0.1:5173 \
  --output=docs/release-evidence/english-literature-practice-browser \
  --fail-on-issues
```

The template command prints the exact planned call count, confirmation token, and plan SHA-256.
Only after human review, execute the model matrix with those exact printed values:

```sh
node scripts/validate-english-literature-practice-browser.mjs \
  --execute-model-validation \
  --plan=docs/release-evidence/english-literature-practice-validation-preflight.json \
  --inputs=docs/release-evidence/english-literature-practice-browser/reviewed-inputs.json \
  --base-url=http://127.0.0.1:5173 \
  --output=docs/release-evidence/english-literature-practice-browser \
  --confirm=<exact-execute-N-english-literature-model-calls-token> \
  --confirm-plan-sha256=<exact-plan-sha256> \
  --fail-on-issues
```

Then, sequentially—not concurrently—run the approved full-paper submission harness. It uses and
cleans the same disposable uid:

```sh
node scripts/validate-full-paper-submission-browser.mjs
node scripts/validate-full-paper-submission-browser.mjs \
  --execute-approved-submission \
  --confirm=delete-ux-cleanup-test-user
```

Finally prove cleanup independently, execute the idempotent cleanup once more, and prove zero rows:

```sh
node scripts/cleanup-dev-auth-data.mjs
node scripts/cleanup-dev-auth-data.mjs \
  --write \
  --confirm=delete-ux-cleanup-test-user
node scripts/cleanup-dev-auth-data.mjs
```

Stop if any Personal row or directly traceable development Analytics row remains, or if any
production Analytics row is encountered. Never run the two model browser harnesses concurrently.

## 9. Final verifier and build gates

Run both verifier modes; only the full remote/R2/legacy command may report final `passed`:

```sh
node scripts/verify-final-release-data.mjs \
  --output=docs/release-evidence/final-release-data-local.json

node scripts/verify-final-release-data.mjs \
  --remote \
  --verify-r2 \
  --verify-local-source-inputs \
  --require-legacy-cleanup \
  --r2-concurrency=4 \
  --output=docs/release-evidence/final-release-data.json
```

The first command validates only tracked, content-addressed source records and therefore runs in a
clean clone. The final command additionally requires the operator's ignored official PDFs and
rehashes all 20 question papers, 20 mark schemes and 17 support documents. Required exact totals
include 63 releases, 1,097 cards, 17 offerings, 789 canonical descendant
targets, exactly 1,401 offering/component pairs, exactly 152 selectable deck scopes, 43 required
model-lineage manifests, 20 papers, every local/remote Question and Personal migration, the v4
cohort lock, all required cohort R2 assets, and the exact one-pass illustration manifest/current
primary set.

After all agents stop, run the integrated gates:

```sh
corepack pnpm run test:extraction-pipeline
corepack pnpm run test:study-card-pipeline
corepack pnpm run test
corepack pnpm run check
corepack pnpm run build
```

Every command must pass. Review and commit the final evidence without secrets or transient model
work roots:

```sh
git status --short
git add -A
test -z "$(git diff --cached --name-only -- 'data/study-cards/releases/**/*.jsonl')"
git diff --cached --check
git diff --cached --stat
git commit -m "Record final release evidence"
git fetch origin main
git merge origin/main
```

If the merge changes anything, rerun the full test/check/build and final remote verifier before
push.

## 10. Push, manual deploy, and production smoke

Push the exact tested commit directly to `origin/main`:

```sh
git push origin HEAD:main
```

If main advanced, do not force push: fetch, merge, rerun the gates, and retry. After the push
succeeds, run the explicitly requested manual Cloudflare deploy and record its Worker version:

```sh
corepack pnpm exec wrangler deploy --env-file .env.local
```

After deployment settles, run anonymous production Chrome and sitemap checks:

```sh
node scripts/validate-release-browser.mjs \
  --base-url=https://constellation.eviworld.com \
  --output=tmp/browser-validation-production \
  --viewport=mobile,ipad,laptop \
  --theme=light,dark \
  --screenshot=viewport \
  --allow-anonymous \
  --fail-on-issues

corepack pnpm run seo:validate-sitemap -- \
  --base-url=https://constellation.eviworld.com
```

Check every cohort paper's public question, chain, constellation, practice, and required-asset
routes:

```sh
jq -r '.papers[].sourceDocumentId' data/release/selective-paper-cohort-lock.json | \
while IFS= read -r source_document_id; do
  node scripts/check-public-question-routes.mjs \
    --source-document-id="$source_document_id" \
    --base-url=https://constellation.eviworld.com \
    --output="tmp/public-route-checks/${source_document_id}.json" \
    --fail-on-error || exit 1
done
```

Finally rerun the full remote verifier as a post-deploy D1/R2 smoke without rewriting the committed
release artifact:

```sh
node scripts/verify-final-release-data.mjs \
  --remote \
  --verify-r2 \
  --verify-local-source-inputs \
  --require-legacy-cleanup \
  --r2-concurrency=4 \
  --output=tmp/final-release-data-post-deploy.json
```

Do not declare the release complete unless the deployed Worker, production routes, sitemap,
remote verifier, and cleanup all pass against the pushed commit.
