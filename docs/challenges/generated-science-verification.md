# Independent generated-science challenge verification

This is the release gate for the 408 generated GCSE Biology, Chemistry and Physics challenge
rounds. Exactly three verifiers must each start with an empty conversation context, must not have
authored the candidate, and must review only their supplied assignment evidence.

Each v2 assignment contains eight plan rows, exact hash-bound AQA specification excerpts, one clean
published paper-calibration row per round, and the candidate challenge. Each item also contains
every other generated candidate assigned to the same curriculum component, in plan order with
candidate, peer-set and assignment hashes. The paper row calibrates command-word demand and credit
density; it is not permission to copy its scenario or wording.

## Review every challenge independently

Set `accepted` to true only when every gate below passes.

1. **Exact curriculum grounding** — both question contexts stay inside the assigned leaf component,
   including Higher-only boundaries. Every asserted fact is supported by the excerpt or is
   uncontroversial prerequisite GCSE knowledge needed to ask it. The named curriculum setting must
   be substantively assessed rather than serving as decoration around a generic calculation or
   reasoning task.
2. **Paper calibration** — command word, marks, expected response depth, weak work and feedback are
   credible against the supplied mark scheme, checklist and primary answer chain. The new question
   must not copy or lightly paraphrase the paper scenario, names, values, table, apparatus or answer.
3. **Scientific and numerical correctness** — all values, units, formulae, state symbols, causal
   links, practical steps and conclusions are correct. Recompute every numerical answer and each
   distractor's implied error. A practical method must actually reach every stated end product;
   causal claims must include scientifically necessary qualifiers such as sign, direction or
   location. Evaluation of evidence must distinguish whether the design measures the intended
   effect, whether results are repeatable, and whether the sample is representative; do not credit
   validity, reliability and representativeness as interchangeable labels.
4. **Distinct contexts and cohort contribution** — opening and transfer differ in situation and
   surface features while assessing the same reusable concept and scoring method. The transfer must
   transfer that concept rather than jump to adjacent factual recall. Against every supplied
   same-component peer, the candidate must also be materially distinct in both context and cognitive
   demand. Reject swapped opening/transfer contexts, noun/value substitutions, repeated calculations
   or misconceptions, and cosmetic narrative changes.
5. **Self-contained tasks** — all required evidence appears in the text or supplied compact table.
   Reject references to an unseen diagram, graph, image, apparatus, source or earlier question.
   Reject any request to draw or sketch.
6. **Fair compare/diagnose/repair flow** — both pupil answers are plausible and within 20% word
   length; one is clearly stronger for the assigned reason. The diagnosis identifies the decisive
   weakness, the repair fixes exactly that weakness, and feedback never moves the goalposts.
7. **Choice quality** — each stage has exactly one defensible answer. Distractors are recognisable
   misconceptions rather than nonsense, grammar/length does not reveal the key, and feedback is
   specific.
8. **Difficulty and marks** — starter/standard/stretch and the mark count match the actual work, not
   merely the plan label.
9. **Learner copy** — concise British English, no internal ids, answer-chain jargon, invented
   examiner commentary, generic AI filler, accidental answer leakage or malformed maths/LaTeX.
10. **Illustration briefs** — opening and transfer briefs are unique to their context, scientifically
    drawable, text-free, answer-neutral and precise enough for an image judge. Alt text must describe
    the intended visible scene without giving the answer. The learner-facing question is
    authoritative: every variable, allele and case, genotype, formula, unit, count, direction,
    object/sample label, material and apparatus state in the brief must agree exactly. Do not
    substitute conventional notation such as `A/a` for question-specific `R/r`. A brief must not
    identify the requested answer merely by depicting its canonical appearance, even when it avoids
    labels and annotations.
11. **Hero teaser** — `hook` has a distinct role on featured/recommendation surfaces. It must be
    interesting and misconception-led but must not state the solution. It is intentionally absent
    from ordinary small cards.

When a challenge fails, add one or more issue rows with the exact field, category, evidence and a
minimal concrete repair. Do not repair the candidate. `accepted` must equal the conjunction of all
eleven booleans and an empty issue list.

## Output contract

Write one JSON file with this shape:

```json
{
	"schemaVersion": "science-challenge-independent-verification/v1",
	"assignmentId": "science-001",
	"assignmentEvidenceSha256": "copy evidenceSha256 exactly from the assignment JSON",
	"verifier": {
		"context": "empty",
		"model": "gpt-5.6-sol",
		"reasoningEffort": "max",
		"reviewedAt": "ISO timestamp",
		"provenance": {
			"orchestrator": "codex-collaboration",
			"taskName": "copy the canonical task name returned by spawn_agent",
			"forkTurns": "none",
			"dispatchLedgerSha256": "copy the canonical dispatch-ledger hash"
		}
	},
	"reviews": [
		{
			"id": "challenge id",
			"accepted": true,
			"curriculumGrounded": true,
			"paperCalibrated": true,
			"scientificallyCorrect": true,
			"contextsDistinct": true,
			"selfContained": true,
			"flowCoherent": true,
			"choicesFair": true,
			"difficultyCalibrated": true,
			"learnerCopyClean": true,
			"artBriefsSafe": true,
			"heroTeaserSafe": true,
			"checkedCalculations": ["short calculation audit, or an empty array"],
			"issues": [
				{
					"field": "definition.transferPromptLead",
					"category": "science",
					"evidence": "exact defect",
					"repair": "minimal required change"
				}
			]
		}
	]
}
```

Return exactly the eight assigned ids once each and no others.
Copy `assignmentEvidenceSha256` from the assignment's `evidenceSha256` field so the release gate can
prove that the review covers those exact curriculum, paper and candidate bytes.

Create exactly three verifiers with
`spawn_agent(fork_turns="none", model="gpt-5.6-sol", reasoning_effort="max")`. Their first turn may
be registration-only: it must contain no assignment evidence, candidate content or authoring
context, and must tell the agent not to begin review. Record all three tool-returned canonical task
names before any review begins, then freeze the complete dispatch ledger at
`tmp/science-challenges/science-500-v1/verification/dispatch-ledger.json`.
The collaboration response exposes `task_name` as the verifier identity; do not invent a separate
opaque identifier.

Create that ledger deterministically by copying the three exact tool-returned task names into this
command in allocation order:

```sh
pnpm run create:science-challenge-verifier-dispatch \
  --index=tmp/science-challenges/science-500-v1/verification/assignment-index.json \
  --output=tmp/science-challenges/science-500-v1/verification/dispatch-ledger.json \
  --created-at=2026-07-23T00:00:00.000Z \
  --verifier=/root/science_verify_001 \
  --verifier=/root/science_verify_002 \
  --verifier=/root/science_verify_003
```

Use the actual creation time and exact returned values; do not type aliases. The command requires
the canonical `science-001` through `science-051` assignment-index order, allocates the first,
second and third task names to rows 1-17, 18-34 and 35-51 respectively, validates the complete ledger,
and refuses to overwrite an existing frozen ledger.

The ledger contains one row per assignment, not one row per verifier. Each exact canonical task name
must appear on exactly 17 assignment rows, covering all 51 assignments. The three task names must be
unique. Reuse of the same exact task name across its assigned 17 rows is required; a fourth task
name, a duplicate name, or a 16/17/18 split fails validation.

After computing the final ledger's canonical SHA-256, send each registered agent a follow-up turn
containing that hash and its 17 assignment paths/hashes. Each verifier reviews those assignments
sequentially and writes one result file per assignment. `context: "empty"` attests that the agent
was originally spawned with `fork_turns="none"` and received no inherited authoring conversation;
the evidence-free registration turn does not invalidate that isolation. The aggregate and final
materializer require the ledger, raw assignment result files and their hashes. Claimed empty context
without matching dispatch provenance does not count as independent verification.

Do not transcribe those 51 follow-ups by hand. Once the complete ledger above exists, create the
deterministic work packets:

```sh
pnpm run create:science-challenge-verifier-packets \
  --index=tmp/science-challenges/science-500-v1/verification/assignment-index.json \
  --dispatch-ledger=tmp/science-challenges/science-500-v1/verification/dispatch-ledger.json \
  --output-root=tmp/science-challenges/science-500-v1/verification/verifier-packets \
  --review-root=tmp/science-challenges/science-500-v1/verification/reviews
```

The helper reads only the assignment index and frozen dispatch ledger. It does not open assignment
or candidate evidence, invoke an agent/model service, or read or write generation/staging. It
refuses a missing, stale, incomplete or tampered ledger; unsafe or reordered assignment paths; a
non-canonical ledger timestamp; output outside the ledger's verification root; and an existing
packet output directory. It builds the complete output in a new sibling staging directory and
publishes it with one rename.

The output contains `manifest.json`, one `verifier-NN/packet.json` for each registered canonical
task name, and `verifier-NN/wave-01.json` through `wave-17.json`. A packet binds its exact ordered 17
assignment ids, paths and hashes to the assignment-index hash and frozen dispatch-ledger hash. Each
wave file contains exactly the `target` and `message` fields accepted by `followup_task`, and names
only one assignment and its required review-result path.

For wave 1, send the exact `target` and `message` from each verifier's `wave-01.json`. Wait for each
verifier to write and report that one assignment result before sending that verifier its next wave.
Continue independently per verifier through wave 17; a slow verifier need not block another
verifier's next wave, but no verifier may have two assignment waves in flight. Never send the
overview `packet.json` to a verifier: it is the operator's ordered audit record and deliberately
lists all 17 rows. Never create packets before the final ledger is frozen, edit a packet, substitute
a task name, or reuse packet output after a repair cycle. A fresh verification cycle requires a
fresh ledger and a previously absent packet output directory.

The dispatch ledger uses this shape:

```json
{
	"schemaVersion": "science-challenge-verifier-dispatch-ledger/v1",
	"orchestrator": "codex-collaboration",
	"indexSha256": "canonical SHA-256 of assignment-index.json",
	"createdAt": "ISO timestamp",
	"dispatches": [
		{
			"assignmentId": "science-001",
			"assignmentPath": "tmp/.../assignments/science-001.json",
			"assignmentSha256": "copy from assignment-index.json",
			"orchestrator": "codex-collaboration",
			"taskName": "tool-returned canonical task name",
			"forkTurns": "none",
			"model": "gpt-5.6-sol",
			"reasoningEffort": "max"
		}
	]
}
```

There must be 51 dispatch rows in assignment-index order. A deterministic allocation is:

- verifier 1: assignments 1-17;
- verifier 2: assignments 18-34; and
- verifier 3: assignments 35-51.

The four collaboration slots are sufficient because the orchestrator occupies one slot and the
three registration turns occupy the other three. Let all registration turns finish, write and hash
the complete ledger, then trigger review follow-ups. Do not review while the ledger is incomplete,
do not use a per-batch ledger hash, and do not replace an agent after review starts: any identity
change changes the final ledger hash and invalidates every result file.

## Repair loop

Aggregate all 51 assignment results before repairing anything. If any challenge is rejected, feed
the complete hash-bound summary back to the authoring pipeline:

```sh
pnpm run generate:science-challenges \
  --repair-verification=tmp/science-challenges/science-500-v1/verification/summary.json
```

Only shards containing rejected challenges are regenerated. Independently accepted entries in the
same shard are required to remain unchanged; each rejected entry receives the verifier's exact
field, evidence and minimal repair. After any repair, discard the old aggregate as release evidence,
rebuild the assignment index, register a new three-verifier allocation and repeat the complete
51-assignment review. Repeat until the aggregate contains 408 acceptances and zero issues.

## Accepted release provenance archive

An accepted release must remain independently checkable after its ignored `tmp/` workspaces are
cleaned. Materialization therefore writes a tracked `provenance/` directory beside the accepted
release and binds its manifest hash from the release metadata. The archive is created and validated
before the final release JSON is written, using the already-computed plan, source, curriculum,
content-review, art-review, coverage and lineage hashes; it never depends on a hash of the final
release JSON and therefore has no self-hash cycle.

The entire release directory is built in a new same-filesystem staging directory. Its single
`runtime.json` projection is written inside that same tree; no generated runtime file is published
separately under `src/`. Its canonical hash is bound by both the accepted release metadata and the
durable provenance archive. The accepted release JSON is the final marker written there. A final
closed-world validation replays every sibling hash, exact file membership and the final provenance
manifest identity before one atomic rename publishes the complete tree. Existing release ids are
immutable. A failed copy, validation or sibling write therefore cannot strand a half-published
directory or a runtime/release split state that blocks a safe retry.

The application discovers tracked `data/challenges/releases/*/runtime.json` files at build time.
No placeholder release is needed while authoring. A present runtime must have a path-matching release
id, complete definition/identity/curriculum membership, valid reviewed light/dark visual records and
no generated id or route collision; otherwise the build fails. Accepted definitions join the live
catalog, reviewed visual mappings replace the old card/transfer art while preserving any existing
earned illustration, and the catalog-derived challenge sitemap includes every new route. Leaf pages
show the exact specification reference and official topic title retained in the runtime projection;
subject pages consolidate generated citations to one official specification link per subject rather
than rendering hundreds of footer links.

The tracked archive retains the generated content prompt instructions with their embedded official
input block replaced by its canonical SHA-256, plus final model messages, deterministic validations,
run and generation summaries, exact art-generation prompts and job metadata, content/art review
summaries, and raw review result payloads. The original source-rich content prompt remains an
external hash-only dependency. The archive also retains the release plan and strictly shaped source,
curriculum and assignment hash indices. Those indices may contain stable row identifiers, counts
and SHA-256 values only; they must not contain paper wording, mark-scheme text, specification
excerpts, assignment evidence, local source paths or verifier task names. Verifier task names are
represented only by their SHA-256 values.

The archive's `lineage.json` is a path-free projection of the accepted release lineage. It binds the
original lineage's canonical hash and replaces every ignored-workspace path with either a tracked
artifact reference or an external dependency id. Content candidates, validations, run summaries,
raw prompt hashes, final messages and event logs, plus art jobs, prompts, repair evidence and image
bytes, are rechecked through those references. A lineage hash copied into a manifest without these
artifact-level bindings is not sufficient release provenance.

Do not commit the full source snapshot, full curriculum evidence, source-rich verification
assignments, raw Codex event streams, intermediate image bytes or official source documents. The
archive manifest records each of those as an external dependency with a stable identifier, byte
hash, byte count and, for JSON evidence, canonical hash. Raw event streams additionally record their
validated JSONL event count. This preserves tamper evidence without committing licensed question
text or event records that can contain complete session context.

`validateScienceChallengeProvenanceArchive` must pass both during materialization and using only the
tracked release directory after the workspaces have been removed. It fails closed for a missing
artifact class, changed archived bytes, path traversal, a tracked JSONL/NDJSON event stream,
source-rich fields in a sanitized index, an external dependency without a valid hash, or an index
or external evidence hash that differs from the expected release bindings. Prospective releases
must not weaken these checks or treat a surviving `tmp/` directory as release evidence.
