# Recall Practice

Question Constellation's answer-chain flow helps students close reasoning gaps in multi-mark answers.
The recall flow is a separate support surface for compact, source-grounded GCSE knowledge where the
main barrier is retrieval: a fact, method, quotation, chronology, case study, technique, formula,
definition, or required-practical detail.

## Product Role

- Keep answer chains as the main public exam-question atlas.
- Use `/recall` as a lightweight retrieval-practice surface for the eight supported learner subjects:
  AQA Biology, Chemistry, Physics, Computer Science, Geography and History, plus OCR English
  Language and English Literature.
- Do not turn recall cards into answer chains unless the item genuinely has reusable mark-scoring
  reasoning.
- Keep signed-in progress and evidence private while the reviewed card catalog remains shared.

## Availability and Personalisation Contract

Reviewed canonical decks are generated and reviewed in the back-office compiler, imported as
immutable bundles, and available before a learner opens recall. Learner-facing recall never waits for
a model call. Personal progress changes the order and mix of already-published cards; a model outage
must not remove canonical decks, recognition mode, saved selections, or the route back to a subject.

Stable evidence gaps may be recorded privately in `user_recall_coverage_misses`. That table is an
offline-generation input only: it never supplies learner-facing text. A future batch may use repeated
coverage signals to propose original cards grounded in the official specification, then run the same
deterministic, independent content, cue, provenance and duplicate reviews as a standard card. Only an
accepted imported bundle may appear in a later session. A pending or failed tailored batch must leave
the complete published catalog usable and must never turn the main recall surface into a generation
waiting screen.

Catalog releases should be coverage-gated per offering and official component. A partial generation
run is not a complete subject deck and must not atomically replace a previously complete catalog.
Custom stacks are saved manifests over published card IDs, with reviewed tailored cards mixed in only
after offline acceptance.

The generic `study_card_*` runtime catalog is the source for imported cross-subject releases. A card
is visible only when its release is imported, a deterministic target inside the exact requested
offering/topic is reviewed, and that release/offering/topic coverage row is reviewed and `ready`.
The global primary target is preferred when it belongs to that offering, but a reviewed secondary
target keeps the same card available in another valid offering. Signed-in reads derive the exact
enabled offering from the learner's board, qualification, course and tier; topic filtering then stays
inside the learner's selected curriculum scope. OCR English Literature is additionally limited to the
four texts or poetry cluster choices stored in the learner profile.

The hand-authored catalog in `src/lib/recall/aqaScienceRecall.ts` is a narrower availability fallback,
not the generic catalog: it is served only for the exact AQA Separate Science Higher Biology,
Chemistry and Physics offerings. It must never leak into Foundation or Combined Science. Foundation,
Combined Science and every non-science subject therefore show only imported, reviewed standard cards;
an empty deck remains an honest empty state and never starts a model job.

## Card Types

Recall cards should be compact and source-grounded:

- `definition`: terms such as diffusion, isotope, homeostasis.
- `formula`: equations and word equations.
- `process`: short named mechanisms that often earn one or two marks.
- `test-result`: chemical tests and observable results.
- `unit`: SI units and common GCSE measurement units.
- `practical`: required-practical method hooks.
- `fact`: standalone recall facts.
- `comparison`: paired terms such as scalar/vector or genotype/phenotype.
- Humanities and English releases also use reviewed kinds such as `case-study`, `chronology`,
  `cause-consequence`, `interpretation`, `technique`, `structure`, `method`, `plot`, `quotation`,
  `character`, `theme`, and `context`.

## Practice Modes

- `Recall`: show the prompt, reveal the expected answer, then self-grade.
- `Recognise`: show answer choices for a lower-friction recognition pass.
- `True or false`: show one canonical answer or reviewed distractor as a proposed answer, then ask the
  learner to judge it.
- `Reverse`: show the answer side and recall the term, process, or formula name.

The recognition mode is deliberately not the only mode because visible choices reduce retrieval
strength. Signed-in progress records the exact course/tier scope plus card content revision and hash,
so revised material is not silently treated as previously mastered.

Recognition evidence stores the server-owned selected choice key. True-or-false evidence separately
stores the proposed statement's server-owned choice key and the learner's Boolean judgement. The
server resolves that key against the immutable card, determines whether the statement itself was
correct, and rejects inconsistent grades; the browser never defines which answer is true. Cards keep
their reviewed three- or four-choice artifact exactly—no synthetic fourth distractor is introduced.

## Sources

Recall generation uses the reviewed official catalog in
`data/curricula/curriculum-catalog.json` and its immutable PDFs. Curriculum is independent of past
papers. Refresh those sources through the curriculum catalog workflow; the older AQA-only cache can
still be regenerated with:

```sh
npm run download:aqa-science-specifications
```

The curated Separate Science route data in `src/lib/recall/aqaScienceRecall.ts` remains the exact
Separate Science Higher fallback catalog. Its v2 release gives every card a concise, source-safe second encoding in
`memoryTip`, while stable card IDs and curriculum mappings are unchanged. The release version is part
of each static content hash, so a learner is never shown stale mastery for materially enriched card
content. Generated cards retain exact PDF page evidence, the specification file hash, and reviewed
offering/component targets in D1.

The compiler extracts each selected page range in PDF reading order (`pdftotext -raw`). This avoids
splicing the specification's right-hand skills notes into the middle of its content sentences. Model
evidence must still be one contiguous verbatim span from that extraction. The validator only collapses
line breaks, tabs and repeated whitespace to one space so an exact PDF passage can travel through JSON;
it rejects reconstructed, corrected or otherwise edited quotes before review.

## Visual Cue Contract

Every card has one familiar native emoji that acts as a quick visual landmark. It identifies the broad
subject context without encoding the answer, formula, quotation, result, trend, unit, or a clue that
eliminates a distractor. The visible card uses the emoji; the card-kind label remains available to
assistive technology and to the setup filters. Subject-specific allowlists cover all eight runtime
subjects, while the older science compiler remains explicitly limited to Biology, Chemistry and Physics.

The compiler uses separate Codex turns for generation, full-card review and cue review. Persist a card
only when the deterministic validator, the independent content reviewer and the independent cue
reviewer all accept it. A proposed replacement is applied to the complete card and reviewed in another
turn; no fallback is automatically safe. The original deck and compiler share the allowlists in
`src/lib/recall/visualCues.js`.

The current artifact contract is `recall-card-bundle-v2` with prompt
`recall-card-compiler-v10`. It allows three or four choices: use four only when the card has three
genuinely distinct plausible misconceptions, and use three rather than inventing a filler
distractor. It requires evidence support paths for every choice's feedback and every
distractor misconception, tells the generator every deterministic text and source-excerpt limit, and
hash-binds the exact source snapshot, prompts, raw structured outputs and normalized independent
reviews into the accepted bundle. If the first cue review proposes a replacement, the durable run must
also contain the replacement prompt, raw output, normalized review and final merged cue review; those
files are part of the accepted hash identity and cannot be omitted or changed before import.
Immutable `recall-card-compiler-v5` through `recall-card-compiler-v9` bundles remain importable and
visible; their run IDs must end in the matching compiler version, while every new additive run must
end in `-compiler-v10`. This keeps exact historic prompts and outputs auditable without letting a v9
artifact masquerade as a v10 run. Compiler-v5 through compiler-v9 bundles retain their exact
four-choice validation; only prospective compiler-v10 bundles may contain three choices.
Older v1/v3 canary artifacts used coarser support tags; the importer rejects them explicitly rather
than silently interpreting them under the stronger contract. Regenerate those older artifacts before
importing them.

## Reproducible Compiler

Select one focused official topic or section and at least one exact offering. Tier is always explicit;
the compiler never expands a broad component to both tiers. If more than one offering is intentional,
also name the one primary mapping.

```sh
pnpm run generate:recall-cards -- \
  --specification-id=aqa-gcse-combined-science-trilogy-8464-v1.1 \
  --component-id=aqa-gcse-combined-science-trilogy-8464-v1.1:4-3-1-7 \
  --subject=Biology \
  --offering-id=aqa-gcse-combined-science-trilogy-8464-v1.1:biology:higher \
  --count=3
```

That command is a zero-model-cost plan by default. Add `--generate` only after checking the source,
page range, tier and targets. Production defaults are `gpt-5.6-sol` with `max` reasoning for the
generator and both independent reviewers.

Generation is additive. Before the prompt is built, the compiler snapshots every reserved static and
durable generated card ID, every existing subject-local concept key, and the cards already covering the
selected target. That deterministic snapshot is hash-recorded in the plan, included in the source
artifact and prompt, and enforced again before either independent review begins. Corrupt durable
artifacts fail closed. Stable identities and exact normalized duplicates are rejected mechanically;
the independent full reviewer also receives the existing target cards and rejects semantic
paraphrases. A run cannot silently act as a broad refresh. Revising an existing card is a separate
identity-preserving migration with an explicit importer update and exact old revision/hash guards.

Ephemeral event streams and working files live below `tmp/recall-generation/<run-id>/`. A successful
run separately writes its exact source evidence, prompts, structured model outputs, normalized
candidates, independent reviews, canonical accepted bundle, rejection report and run manifest below
`data/recall/generated/<run-id>/`. The accepted bundle is the reviewable, durable import artifact; its
SHA-256 identity is computed from canonical JSON, independent of whitespace or indentation.

If a completed compiler-v7-or-newer run predates companion binding but already has its complete exact
durable trail, bind it without replaying a model turn. The command is read-only unless `--write` is
present; it first proves the old accepted-artifact hash against the run manifest and refuses to replace
an identity that is already bound:

```sh
pnpm run bind:recall-card-companions -- \
  --input=data/recall/generated/<run-id>/accepted-cards.json \
  --write
```

## Dry-run-first Import

```sh
pnpm run import:recall-cards -- \
  --input=data/recall/generated/<run-id>/accepted-cards.json

pnpm run import:recall-cards -- \
  --input=data/recall/generated/<run-id>/accepted-cards.json \
  --write
```

The first command is read-only. It checks schema presence, official source hashes, specification-tree
relationships, exact offering/tier targets, ownership, stable IDs, idempotency and content conflicts.
`--write` accepts only durable artifacts below `data/recall/generated`. Changed compiler-owned cards
also require `--allow-update`; the update is guarded by the exact old status, revision and hash observed
during preflight. An identical published card is a no-op only when its source fingerprint, generation
run and canonical provenance also match. Rebinding identical content to a new reviewed run therefore
requires explicit `--allow-update` and uses the same exact preflight guards. Each transaction writes a
draft, all three or four choices, evidence and reviewed targets, then publishes through D1 completeness
triggers. Post-write verification compares every stored child row plus the parent run, source
fingerprint and canonical provenance with the accepted artifact.

When a reviewed additive release supersedes only part of an older batch, retire only the exact cards
named in a checked migration manifest. `pnpm run retire:recall-cards` is dry-run-first; `--write`
requires the expected old run, status, revision and content hash plus a published replacement from the
expected new run, then verifies the final state. Never retire a whole historic run merely because a
new topic batch exists: retain older cards whose concepts are not genuinely replaced.

## Reviewed memory-tip enrichments

New compiler runs should generate and review `memoryTip` with the complete card. The separate
enrichment workflow exists only for already-published, immutable cards whose native tip is blank. It
never edits an old accepted bundle or attributes a later tip to that bundle's reviewers.

Select each exact card ID explicitly. The default command performs a zero-model-cost D1 and durable
base-artifact preflight; `--generate` then runs one `gpt-5.6-sol`/max generator turn and a separate
`gpt-5.6-sol`/max reviewer turn. Any rejected card rejects the entire selected run.

```sh
pnpm run generate:recall-memory-tips -- \
  --run-id=<stable-name-enricher-v1> \
  --card-id=<published-card-id> \
  --card-id=<another-published-card-id>

pnpm run generate:recall-memory-tips -- \
  --run-id=<stable-name-enricher-v1> \
  --card-id=<published-card-id> \
  --card-id=<another-published-card-id> \
  --generate
```

The accepted artifact and its hash-bound prompts, raw outputs, normalized candidates, independent
reviews and source snapshot live under `data/recall/enrichments/<run-id>/`. Every row pins the exact
base card run, revision, content hash, source fingerprint, artifact hash/path, provenance digest and
cited evidence IDs, excerpts, file hashes and support paths. A tip must be concise, single-line,
source-grounded and a useful second encoding rather than a restatement.

Apply the matching D1 migration before importing. Import is dry-run-first and accepts only the
canonical durable artifact:

```sh
pnpm run import:recall-memory-tips -- \
  --input=data/recall/enrichments/<run-id>/accepted-enrichments.json

pnpm run import:recall-memory-tips -- \
  --input=data/recall/enrichments/<run-id>/accepted-enrichments.json \
  --write
```

The write is one guarded D1 transaction and exact post-write verification. Re-running the dry import
must report only no-ops. At read time, an imported overlay is eligible only while the native tip is
still blank and every pinned base identity still matches. The learner receives an effective revision
of `base + 1` and a canonical effective content hash over the base hash plus the tip, so previous
progress is not silently carried across the enrichment. A later native card revision automatically
takes precedence and makes a stale overlay ineligible.
