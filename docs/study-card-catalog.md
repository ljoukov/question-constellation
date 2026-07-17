# Standard GCSE Study-Card Catalog

The standard study-card catalog is a clean, append-only D1 contract for reviewed GCSE cards across the eight currently supported subjects. It does not alias, migrate, or read the older AQA Science `recall_*` tables.

The learner-facing product remains question-led. These cards are static supporting material for recall such as plot, quotations, characters, themes, context, facts, methods, processes and formulae; this schema does not introduce a dashboard or a new route.

## Supported scope

- AQA GCSE: Biology, Chemistry, Physics, Computer Science, Geography and History.
- OCR GCSE: English Language and English Literature.
- Kinds: `definition`, `formula`, `process`, `test-result`, `unit`, `practical`, `fact`, `comparison`, `case-study`, `chronology`, `cause-consequence`, `interpretation`, `technique`, `structure`, `method`, `plot`, `quotation`, `character`, `theme`, `context`.

## Accepted artifact contract

The only accepted schema version is `standard-study-deck-v1`. Unknown properties are rejected. `release.supplementalRuns`, `reverseFront`, `reverseBack`, `memoryTip`, choice `misconception`, and coverage `reason` are the only optional properties shown below.

```json
{
	"schemaVersion": "standard-study-deck-v1",
	"release": {
		"id": "ocr-english-literature-2026-07-v1",
		"promptVersion": "standard-study-card-compiler-v1",
		"generator": {
			"model": "gpt-5.6-sol",
			"thinkingLevel": "max",
			"runId": "generator-thread-or-run-id"
		},
		"reviewer": {
			"model": "gpt-5.6-sol",
			"thinkingLevel": "max",
			"runId": "independent-review-thread-or-run-id",
			"independentTurn": true
		},
		"supplementalRuns": [
			{
				"purpose": "targeted-card-repair",
				"promptVersion": "english-literature-study-deck-repair-v1",
				"cardIds": ["ocr-english-literature-macbeth-vaulting-ambition"],
				"generator": {
					"model": "gpt-5.6-sol",
					"thinkingLevel": "max",
					"runId": "repair-generator-thread-or-run-id"
				},
				"reviewer": {
					"model": "gpt-5.6-sol",
					"thinkingLevel": "max",
					"runId": "repair-reviewer-thread-or-run-id",
					"independentTurn": true
				},
				"startedAt": "2026-07-16T10:20:00.000Z",
				"finishedAt": "2026-07-16T10:25:00.000Z"
			}
		],
		"startedAt": "2026-07-16T10:00:00.000Z",
		"finishedAt": "2026-07-16T10:30:00.000Z",
		"sourceManifestHash": "<64 lowercase hex characters>",
		"artifactPath": "data/study-cards/releases/ocr-english-literature-2026-07-v1/accepted-study-cards.json"
	},
	"cards": [
		{
			"id": "ocr-english-literature-macbeth-vaulting-ambition",
			"conceptKey": "macbeth-vaulting-ambition",
			"board": "OCR",
			"qualification": "GCSE",
			"subject": "English Literature",
			"kind": "quotation",
			"visualCue": "🔥",
			"front": "Which short Macbeth quotation captures dangerous ambition?",
			"back": "“Vaulting ambition”",
			"explanation": "Macbeth recognises that ambition can overreach and destroy him.",
			"memoryTip": "Picture ambition vaulting over a horse and losing control.",
			"contentRevision": 1,
			"choices": [
				{
					"key": "vaulting-ambition",
					"text": "“Vaulting ambition”",
					"isCorrect": true,
					"feedback": "This directly names the force driving Macbeth."
				},
				{
					"key": "fair-is-foul",
					"text": "“Fair is foul”",
					"isCorrect": false,
					"feedback": "This introduces moral inversion rather than Macbeth's motivation.",
					"misconception": "Confuses the witches' paradox with Macbeth's self-diagnosis."
				},
				{
					"key": "out-damned-spot",
					"text": "“Out, damned spot!”",
					"isCorrect": false,
					"feedback": "This expresses Lady Macbeth's guilt later in the play.",
					"misconception": "Chooses a guilt quotation because it is memorable."
				},
				{
					"key": "brave-macbeth",
					"text": "“Brave Macbeth”",
					"isCorrect": false,
					"feedback": "This establishes Macbeth's initial reputation.",
					"misconception": "Confuses a starting reputation with tragic motivation."
				}
			],
			"sources": [
				{
					"kind": "primary-text",
					"url": "https://www.gutenberg.org/ebooks/1533",
					"title": "Macbeth by William Shakespeare",
					"locator": "Act 1, Scene 7",
					"excerpt": "I have no spur ... but only vaulting ambition",
					"sourceHash": "<64 lowercase hex characters>",
					"rightsBasis": "Public-domain primary text; short attributed excerpt.",
					"supports": ["front", "back", "explanation", "memoryTip"]
				}
			],
			"targets": [
				{
					"offeringId": "<enabled curriculum offering id>",
					"curriculumComponentId": "<exact supported descendant id>",
					"topicComponentId": "<selectable topic id>",
					"isPrimary": true,
					"confidence": 1,
					"reviewed": true
				}
			]
		}
	],
	"coverage": [
		{
			"offeringId": "<enabled curriculum offering id>",
			"topicComponentId": "<selectable topic id>",
			"status": "ready",
			"cardCount": 1
		},
		{
			"offeringId": "<enabled curriculum offering id>",
			"topicComponentId": "<selectable topic id>",
			"status": "withheld",
			"cardCount": 0,
			"reason": "No independently reviewed source bundle is available yet."
		}
	]
}
```

Allowed source kinds are `curriculum-specification`, `question-paper`, `mark-scheme`, `examiner-report`, `supporting-document`, `official-web-page`, `primary-text`, `secondary-source`, and `original-synthesis`. Source URLs must be absolute HTTPS URLs. Every source records its exact locator, excerpt, SHA-256 source identity, rights basis, and the teaching claims it supports.

The validator derives rather than trusts:

- stable choice/source ids and choice display order;
- canonical per-card `content_hash`;
- release card/coverage counts;
- `mapping_source`, accepted coverage review state, import ownership, and per-card provenance JSON.

`release.supplementalRuns` is present only when a failed-closed release is completed by a narrowly targeted card repair. The required top-level generator and reviewer continue to identify the base batch. Each supplemental row names the final repaired card identities and preserves the separate repair prompt, generator, and independent reviewer runs; the row is also copied into provenance for only those repaired cards. Every accepted repaired card id must belong to exactly one supplemental generator row. Several repair rows may reference the same final merged-deck reviewer, which is also allowed to be the top-level reviewer. A missing/duplicate card identity, non-independent reviewer, generator/reviewer reuse within the same row, or timestamp outside the release window rejects the artifact.

For a standard batch that stops before review because only a bounded set of source excerpts fail the exact gate, the preserved exact-valid cards must not be regenerated. `--repair-from=<preserved-v3-work-dir>` validates the base trace and its failure manifest, generates only the identities still needed for topic coverage, merges them back in original order, and independently reviews the merged deck. The final release keeps the original generator at top level and records each repair generator plus its independent reviewer in `supplementalRuns`. Reviewer-rejected cards remain audit evidence; a release is publishable when every topic still has at least the configured minimum of accepted cards.

Each card has three or four ordered choices. The correct choice must equal `back` exactly, every choice text must be distinct, every distractor needs a misconception, and the correct row must not have one. Four choices are appropriate only when three distinct plausible misconceptions exist; use three when another distractor would be contrived. Existing reviewed four-choice artifacts remain valid. `memoryTip` is optional: omit it when no honest, non-contrived retrieval route exists. Its absence is not a review failure. Sources collectively must support `front`, `back`, and `explanation`, plus `memoryTip` or `reverse` when those fields exist.

Tier scope is inherited. A component whose own `tier` array lists Foundation and Higher is still Higher-only when any enclosing curriculum ancestor is explicitly Higher-only. The descendant planner, generator, offline validation and D1 import preflight all walk the complete ancestry; a Foundation target fails closed if that walk is missing, cyclic or contains a Higher-only row. Never infer Foundation eligibility from the leaf alone.

An accepted but not-yet-imported artifact may be narrowed without regenerating learner content only when a deterministic scope correction removes an invalid offering target, retains an already-reviewed valid target, recomputes release-local coverage and artifact hashes, and records exact before/after evidence. `node scripts/correct-study-card-tier-scope.mjs` is the reproducible correction for the two Separate Physics Momentum cards discovered during the July 2026 descendant queue. Its evidence is under `docs/release-evidence/study-card-descendant-coverage/`; the live queue hash remains historical while `generation-run.json` and the after evidence identify the corrected import hash.

The failed Combined Physics shard has a separate zero-regeneration recovery. Its archived generator, reviewer, source and candidate files are pinned by SHA-256. The 12 cards already accepted by the archived independent reviewer are materialized immediately as the explicit immutable partial release `aqa-combined-science-trilogy-8464-physics-partial-accepted-rollout-recovered-v1`; its hash is `594b25a0d329e6f2f7ede7bab801b705d1a5d9467f2ba7797799a49069754e16`. The stopping-distance rejection and two inherited Higher-only momentum rejections remain excluded. The recovery reuses the already-generated valid three-choice stopping-distance repair and the original Higher candidates, but all three require fresh independent review under corrected scope. It never calls a generator.

```sh
node scripts/recover-reviewed-study-card-split.mjs
node scripts/recover-reviewed-study-card-split.mjs --execute --prepared-lock=docs/release-evidence/study-card-prepared-completion/prepared-run-lock.json
```

The direct execute command remains fail-closed behind either the historical terminal queue or the active prepared orchestrator. The release command is therefore:

```sh
node scripts/run-prepared-study-card-completion.mjs --execute
```

The prepared queue reconciles 789 eligible targets as 351 covered and 438 uncovered. It preserves 23 logical-job lineages but expands three mixed-tier jobs into 26 physical batches: 24 future standard generator/reviewer batches under the explicit `standard-study-card-descendant-coverage-v2` three-or-four-choice contract, plus two Combined Physics fresh-review-only outputs recovered from archived v1 candidates. The two recovery rows share one atomic execution group, so their identical command is launched once and both artifacts are validated. The lock fingerprint is `60f63783f3ba87b3f631d5409f88039ad1d3e804c79dce4edf39deb768bb603c`. Existing immutable outputs are validated and reused; accepted cards are never regenerated. At most two model-producing processes run concurrently. Literature shards remain locked until every physical batch is accepted and the descendant planner reports zero remaining targets.

Acceptance also requires `model-lineage-evidence.json`. The commit-safe manifest binds the exact
passed `gpt-5.6-sol`/`max` generator and independent reviewer summaries, prompt/model-output hashes,
raw event-stream SHA-256 plus nonzero sanitized count, generation-run file, source manifest and
accepted artifact. Per-card semantic hashes prove that every published card's learner-visible
content occurs unchanged in a generator output and in the exact input to an accepting independent
review. Only deterministic catalog/source/offering binding and normalized choice keys are excluded
from that projection. Raw release JSONL is ignored and is not required after this manifest is
materialized.

Prospective standard curriculum batches use `standard-study-card-compiler-v5`. Version 3 introduced model-selected three-or-four-choice cards and the character-for-character contiguous source-excerpt instruction. Version 4 additionally limited new model excerpts to one short passage of at most 400 characters and rejected unsafe control bytes, equation-layout copying, reflow and multi-paragraph splicing before review. Version 5 permits a null memory tip and partitions generation output per card: deterministic-valid rows continue to review, and only enough failed identities to restore a topic's minimum are sent through targeted generation. Raw invalid rows and diagnostics remain in the release evidence. Completed artifacts and already-running older batches retain their original prompt version and hash; they are not relabelled or regenerated merely to vary option counts.

## D1 contract

Migration `migrations/0021_study_card_catalog.sql` creates:

| Table                 | Key and purpose                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `study_card_releases` | Immutable accepted/imported/rejected artifact, generator/reviewer run provenance, manifest/artifact hashes and expected counts. |
| `study_cards`         | Release-scoped canonical card; `visualCue` is stored as `emoji`; state is draft/published/retired.                              |
| `study_card_choices`  | Three or four ordered choices with one canonical answer, teaching feedback and diagnostic misconceptions.                       |
| `study_card_sources`  | URL/title/locator/excerpt/hash/rights/support provenance.                                                                       |
| `study_card_targets`  | Reviewed offering/component/topic mappings with exactly one primary target per card.                                            |
| `study_deck_coverage` | One explicit `ready` or `withheld` row per declared release/offering/topic scope.                                               |

The import transaction is:

1. Insert the release as `accepted`.
2. Insert every card as `draft`.
3. Insert choices, sources, targets and explicit coverage.
4. Publish each card, which invokes the database publication guards.
5. Mark the release `imported`, which recounts cards and coverage from stored target rows.

An exact already-imported artifact is idempotent. Any changed, partial, rejected, foreign-owned, or colliding identity is a conflict. Produce a new independently reviewed release instead of mutating or reviving old content.

`ready` requires `card_count > 0` and no reason. `withheld` requires `card_count = 0` and a non-empty reason. Both must reference an enabled offering and selectable topic. Database finalization recalculates distinct published cards for each row; a claimed count cannot make incomplete coverage appear ready.

## Runtime visibility predicate

Runtime code must not read `study_cards` alone. Use all of these gates:

```sql
SELECT card.*, target.offering_id, target.curriculum_component_id,
       target.topic_component_id, target.is_primary, target.confidence
FROM study_card_releases release
JOIN study_cards card ON card.release_id = release.id
JOIN study_card_targets target ON target.card_id = card.id
JOIN study_deck_coverage coverage
  ON coverage.release_id = card.release_id
 AND coverage.offering_id = target.offering_id
 AND coverage.topic_component_id = target.topic_component_id
WHERE release.status = 'imported'
  AND release.import_owner = 'study-card-import/v1'
  AND card.status = 'published'
  AND card.needs_human_review = 0
  AND card.import_owner = 'study-card-import/v1'
  AND target.reviewed = 1
  AND target.import_owner = 'study-card-import/v1'
  AND coverage.status = 'ready'
  AND coverage.reviewed = 1
  AND coverage.import_owner = 'study-card-import/v1';
```

Join `study_card_choices` on `card_id` and order by `display_order`. Source rows are provenance/admin data and need not be sent to learners.

`src/lib/server/studyCardCatalogQuery.ts` exports the guarded one-row-per-card query used for integration. Its positional parameters are `board`, `subject`, `offeringId`, then `topicComponentId`; it returns ordered choices as `choices_json` and cannot return a withheld topic.

## Commands

Offline validation and semantic artifact hash, with no D1 access:

```sh
npm run validate:study-cards -- --input=data/study-cards/releases/<release-id>/accepted-study-cards.json
```

Read-only remote D1 schema, ownership, identity and curriculum preflight:

```sh
npm run import:study-cards -- --input=data/study-cards/releases/<release-id>/accepted-study-cards.json
```

Write only after reviewing the preflight. Writes are accepted only from the durable path declared inside the artifact:

```sh
npm run import:study-cards -- --input=data/study-cards/releases/<release-id>/accepted-study-cards.json --write
```

Focused verification:

```sh
npm run test:study-card-pipeline
```
