# Science challenge question art: local generation and R2 release

Question-specific challenge art is generated and reviewed locally, but final image bytes are never
checked into `static/`. The release id is part of every local and remote path.

Materializing the candidate first writes the hash-bound art manifest to
`tmp/science-challenges/science-500-v1/compiled/art-manifest.json`. The generation, review and
perceptual-audit commands use that path by default.

## Paths and immutable identity

- Local generation and review:
  `tmp/science-challenges/<release-id>/art-assets/<art-id>-<theme>-v1.webp`
- R2 object:
  `images/challenges/<release-id>/<art-id>-<theme>-<first-16-sha256>.webp`
- Public route:
  `/images/challenges/<release-id>/<art-id>-<theme>-<first-16-sha256>.webp`

The accepted `art-delivery-manifest.json` binds all 2,000 local files by full SHA-256, byte size,
content type, immutable cache policy, R2 key and public path. The accepted release's `runtime.json`
visual projection contains only the public R2 routes; it never references the ignored local
workspace.

## Operator workflow

Generate one new dark composition and one geometry-matched light sibling for every question context.
The learner-facing question is authoritative; the art brief is a fallible proposal. Before any model
call, compare every variable, allele and case, genotype, formula, unit, count, direction, label,
material and apparatus state with the question. A brief that conflicts with the question must fail
before generation.

```sh
pnpm run generate:science-question-art --resume
```

Generation sends the question and illustration brief to the configured image service. Confirm that
the user or release operator has authorized that external disclosure when the material is
unpublished.

Generation reserves 10 GiB of free space by default. The generator checks every distinct filesystem
that contains the work root or an output path before claiming or writing a work root and again
between generation, edit, normalization and publication steps. Normalization, recovery and
publication reserve their additional write headroom. A low-space reading—or an `ENOSPC`, `EDQUOT` or
`EFBIG` write failure that a free-space reading cannot predict—latches one shared stop and aborts
other in-flight model/ImageMagick phases. Override the reserve only when the storage plan justifies
it:

```sh
pnpm run generate:science-question-art \
  --resume \
  --min-free-space-gib=20
```

If the reserve is reached, the generation summary has `status: "failed-resumable"`, records the
measured and required bytes, stops scheduling new pairs and exits non-zero. Free space and rerun with
`--resume`; already accepted pairs are replayed from their hash-bound jobs. Repair runs remain bound
to their source review/audit, so after a partial repair stop, re-review or re-audit the current bytes
before starting the next repair pass. The summary's structured `nextAction.actions` is authoritative:
ordinary work uses `--resume`, while repair work never does. A repair action first refreshes the
complete independent review (and, for duplicate repair, the perceptual audit), then uses only the new
evidence hash. Once any attempt or job exists for a repair evidence hash, that hash is consumed:
rerunning the same repair command cannot implicitly continue it and stops before scheduling work.

`--max-attempts` accepts 1–4 (default 3), matching the release-lineage gate. Each failed attempt keeps
its prompts and `failure.json`, including the SHA-256 and size of every generated image it discarded.
The bulky failed image bytes are removed after that evidence is written. Successful attempts keep
both masters and both normalized images because accepted-art lineage requires and re-hashes them.
Attempt directories are immutable and monotonic across invocations, and the four-attempt ceiling is
total for that ordinary or full-hash repair lineage—not reset by restarting the process. A
12-character repair path prefix has a separate marker binding the complete 64-character evidence
hash, so two different repair inputs cannot alias the same attempt slots. Failed ordinary work must
be continued explicitly with `--resume`. Bare `--replace-output` refuses to mutate any existing
ordinary lineage; replacements must use hash-bound review or perceptual-audit repair evidence.
Choosing a lower `--max-attempts` on a later invocation does not invalidate already recorded
attempts; it simply prevents a new attempt above that requested limit. Any unresolved failed-attempt
cleanup or evidence error blocks every ordinary and repair lineage until the recorded prerequisite
is resolved, including cleanup attached to an older repair hash.

Network, DNS, timeout, authentication, rate-limit and image-service HTTP failures are run-level
prerequisites, not composition defects. After recording the current in-flight failure evidence, the
generator latches `SCIENCE_ART_IMAGE_SERVICE_UNAVAILABLE`, stops scheduling pairs and does not burn
the remaining attempt budget. Restore explicitly authorized service access, then follow the
summary's ordinary-resume or fresh-repair instruction.

The generation work root must be a real child of the workspace. Its ownership marker binds the exact
directory, release id and manifest hash; unmarked non-empty roots, symlinks and rebound markers fail
closed. A canonical release-output lock serializes every generator process even when callers request
different work roots, while a second lock protects the selected work root itself.

Dark output, light output and their passed job are published as one recoverable transaction. Candidate
bytes and backups are flushed before the journal; the job is renamed last; the complete job/spec/
prompt/master/normalized/output/repair lineage is replayed before backups are removed. Startup
re-validates a fully committed crash journal or rolls a partial/invalid transaction back without
overwriting unrecognized bytes. Stranded transaction and atomic-write temporaries are cleaned only
under the release lock. A valid pair whose transaction cleanup is still pending is preserved but
still produces a non-zero `failed-resumable` run. Resume preflights every selected immutable lineage
before the concurrent scheduler claims work. If a validated repair job supersedes an ordinary job,
resume preserves or restores the repaired bytes and never silently reverts to the rejected ordinary
pair; ambiguous repair histories and symlinked evidence archives stop before any pair is scheduled.
Unknown, duplicate, positional or value-bearing boolean CLI forms also fail before the work root is
claimed.

Review all 1,000 pairs against the exact learner question first and the art brief second. A failed
review is expected to write a complete reject summary before exiting non-zero:

```sh
pnpm run review:science-question-art --resume
```

For a deliberately smaller validated fixture, pass the same explicit `--require-count=<count>` to
generation, review and perceptual audit. Production remains gated at 1,000 by default.

Review schema v2 records one of three dispositions:

- `accept`: no issue;
- `retain-with-annotation`: only minor, harmless depiction or cosmetic issues; keep the pair and its
  annotation, and do not regenerate it; or
- `fresh-regenerate`: one or more major semantic, answer-leakage, task-identity, notation, material,
  direction, count, label, unit, apparatus-state or usability failures.

Regenerate only `fresh-regenerate` pairs using the independent review's concrete major instructions.
Never edit, inpaint, erase, or supply the rejected image as a reference. A major failure starts a
brand-new dark composition; only after that dark master is accepted may it be used to derive the new
light sibling. The rejected pair remains immutable evidence. Replacement is intentionally explicit,
and repair mode will not accept a stale review or silently resume after any reviewed image byte
changes:

```sh
pnpm run generate:science-question-art \
  --repair-review=tmp/science-challenges/science-500-v1/art-review/review-summary.json \
  --replace-output
```

Repeat review and repair until all pairs pass. Then hash all 2,000 files perceptually and compare
every asset against every different question context, including across themes. Only an art id's own
intended light/dark sibling is excluded; the release requires zero near-duplicates:

```sh
pnpm run audit:science-question-art-perceptual
```

Authored-static pairs are not exempt from semantic review. Freeze their current question, alt text,
source paths and source hashes before reviewing:

```sh
pnpm run prepare:science-authored-static-art-review \
  --release-id=science-179-v1-retained-static-final-v1

pnpm run review:science-question-art \
  --manifest=tmp/science-challenges/science-179-v1-retained-static-final-v1/art-manifest.json \
  --output-root=tmp/science-challenges/science-179-v1-retained-static-final-v1/art-review \
  --require-count=32 \
  --resume
```

If that review finds a major defect, generate only the named major set under a new immutable
generation-candidate release id, promote accepted replacements to new versioned static paths, then
rebuild and fully re-review the 32-pair final cohort. Do not reuse a failed cohort id or overwrite an
old static file. The final catalogue audit requires the passed 32-pair review and proves that its
review copies are byte-identical to the current static sources. Minor issues survive in the audit as
annotations.

If the audit finds a near-duplicate cluster, regenerate a deterministic small cover of the
colliding pairs rather than replacing every member:

```sh
pnpm run generate:science-question-art \
  --repair-perceptual-audit=tmp/science-challenges/science-500-v1/art-review/perceptual-audit.json \
  --replace-output
```

Any perceptual repair changes image bytes, so run the independent visual review again (unchanged
batches can resume) and then rebuild the perceptual audit. Continue until both gates pass.

The accepted release binds both the independent visual review and this byte-bound perceptual audit.
It cannot materialize if either is stale, incomplete, rejected, duplicated or refers to different
files. After materialization, inspect the delivery manifest without network access:

```sh
pnpm run upload:science-challenge-art
```

Dry-run is the default. It validates the source art manifest, delivery manifest, hard count, and
every local file's size and SHA-256. It also requires the accepted challenge release and proves that
the release binds these exact art and delivery manifests, its runtime projection and its durable
provenance archive. The runtime and archive are fully revalidated immediately before and after remote
writes, including complete archive file membership, so a late-added untracked event log, altered
learner-facing projection or different structurally valid manifest cannot be uploaded unnoticed.

Remote writes require the explicit `--upload` flag and all three exact hashes printed by dry-run:

```sh
pnpm run upload:science-challenge-art \
  --upload \
	--release=data/challenges/releases/science-500-v1/accepted-challenges.json \
  --expected-file-sha256=<file-sha256> \
  --expected-canonical-sha256=<canonical-sha256> \
  --expected-release-sha256=<accepted-release-canonical-sha256>
```

Before upload, all 2,000 inputs must pass together. Each object is copied into a private temporary
snapshot and that snapshot is checked against the reviewed size and full SHA-256 before and after
Wrangler reads it. The stable snapshot—not the mutable ignored-workspace path—is uploaded to the
content-addressed key, downloaded from R2, and compared again by size and full SHA-256. A changed
manifest or local file fails the release. Never use this command without explicit authorization for
remote R2 writes.
