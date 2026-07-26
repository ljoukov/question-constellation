# Science challenge recovery checkpoint — 2026-07-25

Status: stopped at a user-requested, non-mutating recovery boundary. The repository worktree is
intentionally dirty and the Git index is clean. Nothing in this checkpoint has been committed,
pushed, deployed, uploaded, or published.

## Recovery handles

- Source Codex task: `019f810a-5b8a-7463-b431-80778d05343d`
- Takeover Codex task: `019f9202-8d7c-7423-a4e2-66232b2aae5f`
- Authoritative evidence checkout label: `question-constellation-evi-ui-takeover`
- B0 root:
  `tmp/science-challenges/science-500-v1/generation-review-rebase-cycle02`
- V1 root:
  `tmp/science-challenges/science-500-v1/verification-completion-20260724-cycle02`
- Failed S1 root:
  `tmp/science-challenges/science-500-v1/generation-review-rebase-repair-cycle02`
- Reserved immutable recovery-evidence root:
  `tmp/science-challenges/science-500-v1/generation-review-rebase-repair-cycle02-recovery-01`
- Reserved external publication root:
  `tmp/science-challenges/science-500-v1/generation-review-rebase-repair-cycle02-recovered-01`

The two reserved roots are still absent.

## Authenticated parent evidence

- B0 manifest:
  `8ec5427d02c931e56860934ccf45f3c2b62df995690103fead287a06e086a46a`
- B0 rebase:
  `3766077f25cddc4c377fdda53065447484cee37445600aafad39f0ba5a97ad84`
- B0 candidate set:
  `a952fb3eaeea0a17ead1e14c8f47d1fdfe040185d13015f6ab3c458bf2a99202`
- B0 plan:
  `c9358de63bcc60e557a50e46dbb796494e6038ad157d2a26d7dbdf7239cf569d`
- Base plan:
  `d9d7a8defcc53a60103b54dcec48843e2bae382f755541626b64f4a6ff8a77b3`
- V1 summary:
  `65e8c0e159fa555e45845b659c6a00351373018b006c7131694b3f84722afd15`
- Failed S1 authority:
  `cf859ff23728717ef1866124215bb24386b0df0e0c988a5b418cf608a32b69d3`
- Failed S1 objective:
  `72a23faf5ed0497fb9c08eeebc85d4cce2410e54065308b05390650ea47ffc30`
- Failed S1 execution:
  `835fd575a4435fb7ad9366c164c4ba8d7e941c6ca311524c102368f3ac525def`

The evidence contains 408 ordered candidates in 51 contiguous shards and 173 committed physical
attempt transactions.

## Read-only recovery result

The final dry-run returned `planned / stage-successor`:

- Recovery id:
  `d70cbca29265c2bfdd53635f34d89e8008b75008bdd90724e581ac3ca1a307d4`
- Recovery execution id:
  `d3fb576604f9354ca168dbcbde20554394dfaab39b917e1ccfe276708bf8476d`
- Recovery manifest:
  `c0dcfae1c43d011e2feeeeb833af0b8bb93b75ebb30e00c456be1881c8fb1e81`
- Direct-child lineage:
  `d0f9ea90a9d24d768bce31960a672bdae90490eebe974d9e9ba6ba560b0dfbd5`
- Registry reservation:
  `3f050013337b80d0dae149850a946ae5bc4692ecd09d71e2b6bc21bceac8d408`
- Deterministic registry commit:
  `07438397e09c8961d2d21bbd10cb234be117a4c0606b2ad07a15a9afa84ef577`

Classification:

- 10 preserved passed proposals: `science-001` through `science-007`, `science-009`,
  `science-012`, and `science-013`
- 39 repair-required shards
- 2 frozen non-mutable shards: `science-035` and `science-044`
- 145 strict pre-model infrastructure invocations
- 28 consumed logical content attempts

Next logical attempt ordinals:

- `science-008`: 4
- `science-010`, `science-011`, and `science-014`: 3
- `science-015` and `science-016`: 2
- the remaining 33 repair-required shards: 1

No attempt 5 is permitted. Each logical slot allows at most four infrastructure invocations.
Strictly pre-model failures do not consume the logical ordinal; timeout, ambiguous, non-empty model
output, or an indeterminate crash does.

## Recovery invariants now implemented

- The direct-child authority is fixed at
  `git-common-dir:science-challenge-review-rebase-child-registry/v2`, shared across linked
  worktrees, and cannot be caller-selected.
- The generator lifecycle is:
  `pure gates -> inspect/reserve -> seed parent -> initialize objective -> write execution marker -> commit registry -> preflight/model`.
- `execution.json` contains canonical execution identity plus a worktree-relative output-root
  binding. Replay rejects noncanonical bytes, aliases, competing roots, tampering, and path escape.
- The immutable recovery-evidence root and external publication root are separate, non-nested, and
  non-aliased. The recovery root rejects generation summaries, effective cohorts, transactions,
  journals, and publication artifacts.
- The recovery terminal binding is derived only from immutable collection evidence.
- A new disconnected V1b/S1b sibling is forbidden. Recovery must continue the authenticated failed
  S1 objective.
- Catchable unexpected failures are recorded as sanitized indeterminate evidence and consume the
  logical ordinal. Unknown crash artifacts fail closed.

## Verification at this checkpoint

- Registry/generator integration: 72/72 passed.
- Independent registry + core + recovery CLI rerun: 28/28 passed.
- Generator, marker, multipart, browser-export, and art-safety rerun: 105/105 passed.
- Existing effective-cohort, provenance, and upload suites: 92/92 passed.
- Release-safety focused suite: 32/32 passed.
- Recovery dry-run output contained no home-directory path or username.
- `git diff --check` and syntax checks passed.
- Shared registry v2, recovery-evidence root, and publication root all remained absent after replay.

## Intentionally unfinished

- The actual registry reservation/commit and recovery-root staging have not run.
- The 39 repair-required shards have not called the model.
- The recovered 408-row cohort has not been independently reviewed.
- The 408 short-recall prompts are not complete or independently reviewed.
- The 2,000 light/dark illustration assets are not generated or reviewed.
- Materialization, exact duplicate audit, browser QA, D1/R2 validation, sitemap validation, release
  archive, upload, push, and deployment remain pending.
- Sanitized archive-closure plumbing is syntactically valid but not functionally complete. In
  particular, recovery-aware upload replay, sanitized `manifestPath` projection, exact
  10-preserved/39-new/2-frozen enforcement, and a focused recovery-archive integration test remain.
- `skills/science-challenge-release/SKILL.md` contains the prompt, verification, image, release, and
  safety workflow and passes its current leak/safety tests. Its infrastructure-recovery section
  still needs to be reconciled with this final registry and two-root design before it is called
  final.

## Safe resume point

First rerun the infrastructure-recovery CLI with the same six evidence/root arguments and
`--dry-run`, and require the exact identities and counts recorded above. Only after explicit
instruction should the same command be run without `--dry-run` to create the registry entry and
stage the immutable recovery evidence. Then run the external publication generator against the
separate publication root to repair exactly the 39 required shards.

Do not create a replacement V1b/S1b root, reset attempt ordinals, copy the failed S1 into a new
objective, or publish directly from B0/V1/failed S1.
