# OCR J352 English Literature study decks

This track produces an import-grade `standard-study-deck-v1` release for every selectable OCR J352 set text and poetry cluster. It is deliberately source-first: an absent reusable primary text becomes an explicit quotation withholding, never a remembered or silently corrected quotation.

The checked source plan contains 19 options, 25 source snapshots and 67 candidate cards:

- 32 plot cards
- 26 quotation cards, including six lawful partial poetry cards
- 9 poetry-analysis method cards

All 19 standard topic rows are planned `ready` because each has at least one complete useful mode. The supplemental mode matrix has 29 ready rows and 12 explicitly withheld rows.

The accepted `ocr-j352-literature-standard-v1` artifact contains all 67 cards and all 19 ready topic rows. Its immutable artifact hash is `f315f85ca91f288668a3ff54404bc4d52646cd9a7afb647b95df9c08e0fbdb84`. The base independent review accepted 66 cards and rejected one ambiguous Macbeth front. The first one-card repair fixed that front but failed closed on an inherited, insufficiently evidenced distractor. A second evidence-tight one-card repair passed a fresh generator and independent reviewer. `release.supplementalRuns` records the successful repair identities while leaving the base generator/reviewer provenance unchanged; the durable release directory retains both failed traces as audit evidence.

That accepted v1 was already in flight under the four-choice compiler contract, so all 67 reviewed cards retain four choices. The prospective v4 compiler accepts three or four: it uses four only when three distinct plausible misconceptions exist and uses three when a fourth would be contrived. This prospective rule does not mutate the accepted v1 artifact.

## Additive plot and quotation deepening

The first release establishes lawful breadth but is intentionally shallow at two plot cards and two quotations per reusable public-domain work. The additive deepening plan therefore adds 171 independently generated and reviewed cards without changing the accepted v1 release:

- 96 ordered plot-recall cards: six more events for each of the 16 prose and Shakespeare options;
- 72 exact quotation cards: six more quotations for each of the six public-domain novels and four Shakespeare plays, plus 12 edition-verified public-domain poetry lines;
- 3 quote-to-analysis method bridges, one per poetry cluster.

The work is split into 13 immutable releases of at most 18 cards. The master preflight downloads 25 source records and must validate all 171 exact anchors or approved excerpts before either of the two model slots starts. Every shard is hash-locked to that passed preflight and fails before model use if a source becomes unavailable or changes. The accepted 67-card v1 deck is supplied to the generator, independent reviewer and any targeted repair as immutable additive context, so surface rewording of an existing retrieval task is rejected while a genuinely different plot-versus-quotation task may share a source moment. Each shard then runs a generator, a fresh independent reviewer and up to two targeted repair rounds for only rejected or deterministically invalid cards. The aggregate audit requires exactly 171 planned identities, validates every release, and rejects any global card-id or board/subject/concept collision.

The rights boundary remains explicit. Modern primary-text quotations are withheld. Wikipedia CC BY-SA 4.0 excerpts are retained only for attributed plot evidence, never as primary-text quotations, and each retained excerpt is capped at 20 words. Poetry quotation completeness remains withheld because only edition-verified public-domain poems are included; the 12 lawful lines are useful partial cards, not a claim to cover every current anthology poem.

The deterministic source preflight passed on 2026-07-16: 19 topics, 171 evidence rows and 25 source records all passed exact anchor/excerpt validation, with a fail-closed source-manifest hash and zero model calls. The 13 shards also pass static command, identity and collision preflight. They are hash-bound into the prepared completion orchestrator and begin only after all 438 standard descendant targets are covered.

Poetry keeps two distinct coverage layers. In each additive poetry topic, quotation-mode provenance remains `withheld` with `cardCount: 4`, because four public-domain quotations are useful but do not make the current anthology complete. The independently reviewed method mode is `ready` with `cardCount: 1`. Together those five reviewed cards give the accepted shard a standard topic-level `ready` row with `cardCount: 5`, which lets the runtime surface the method card and all four lawful quotations. This does not weaken the rights claim: `coverage-mode-matrix.json` preserves the withheld quotation-completeness decision, while the standard artifact row satisfies the D1 published-target recount and the runtime's reviewed-ready coverage predicate. The focused test exercises this exact 4-withheld + 1-ready → 5-runtime-ready contract for all three poetry clusters.

The checked plans are [`ocr-j352-deepening-source-plan.json`](../data/study-cards/english-literature/ocr-j352-deepening-source-plan.json) and [`ocr-j352-deepening-shard-manifest.json`](../data/study-cards/english-literature/ocr-j352-deepening-shard-manifest.json). Durable preflight, queue and aggregate evidence is written under `docs/release-evidence/english-literature-deepening/`.

## Exact option matrix

`withheld (2 partial)` means full 15-poem quotation coverage is not claimed, while two edition-verified public-domain quotation cards may still be published alongside the ready method deck.

| OCR selectable option                     |           Plot |            Quotation |    Method | Planned cards |
| ----------------------------------------- | -------------: | -------------------: | --------: | ------------: |
| Anita and Me                              |      ready (2) |             withheld |         — |             2 |
| Never Let Me Go                           |      ready (2) |             withheld |         — |             2 |
| Animal Farm                               |      ready (2) |             withheld |         — |             2 |
| An Inspector Calls                        |      ready (2) |             withheld |         — |             2 |
| Leave Taking                              |      ready (2) |             withheld |         — |             2 |
| DNA                                       |      ready (2) |             withheld |         — |             2 |
| Great Expectations                        |      ready (2) |            ready (2) |         — |             4 |
| A Christmas Carol                         |      ready (2) |            ready (2) |         — |             4 |
| Pride and Prejudice                       |      ready (2) |            ready (2) |         — |             4 |
| The War of the Worlds                     |      ready (2) |            ready (2) |         — |             4 |
| The Strange Case of Dr Jekyll and Mr Hyde |      ready (2) |            ready (2) |         — |             4 |
| Jane Eyre                                 |      ready (2) |            ready (2) |         — |             4 |
| Love and Relationships                    | not applicable | withheld (2 partial) | ready (3) |             5 |
| Conflict                                  | not applicable | withheld (2 partial) | ready (3) |             5 |
| Youth and Age                             | not applicable | withheld (2 partial) | ready (3) |             5 |
| Romeo and Juliet                          |      ready (2) |            ready (2) |         — |             4 |
| The Merchant of Venice                    |      ready (2) |            ready (2) |         — |             4 |
| Macbeth                                   |      ready (2) |            ready (2) |         — |             4 |
| Much Ado About Nothing                    |      ready (2) |            ready (2) |         — |             4 |

## Rights and source policy

- The six nineteenth-century novels and four Shakespeare plays use exact Project Gutenberg public-domain text. Quotation answers must occur byte-for-byte in the downloaded edition and are never modernised or corrected.
- Modern-text plot cards use short, source-qualified excerpts from official OCR/Pearson teaching material or publisher synopses. These sources do not authorise primary-text quotation cards, so modern-text quotation modes remain withheld.
- `Anita and Me`, `An Inspector Calls` and `DNA` are not left empty: official OCR/Pearson resources ground two plot events for each.
- Each poetry cluster has two exact lines from retained public-domain poems in OCR's identified anthology edition. Separate post-2022 OCR teacher guides are hashed into the source manifest and checked for each cited poem title, confirming that it remains named in the updated cluster. Because current clusters also contain in-copyright poems, those lawful partial cards do not turn the quotation mode into a false full-coverage claim.
- Each poetry cluster also has three useful OCR-specification-backed method cards: evidence-supported personal response, language/form/structure analysis, and meaningful connections/contrasts. Administrative facts such as component numbers, dates and anthology counts are excluded.

The source plan, rights basis, exact locators and evidence anchors live in [`data/study-cards/english-literature/ocr-j352-source-plan.json`](../data/study-cards/english-literature/ocr-j352-source-plan.json).

## Commands

Validate scope and print the complete no-network coverage plan:

```sh
pnpm run generate:english-literature-study-deck
```

Download all 25 sources and verify all 67 card evidence rows plus the current-cluster membership anchors without model use:

```sh
pnpm run generate:english-literature-study-deck -- --prepare-sources --force
```

For a new release id, run the required `gpt-5.6-sol`/`max` generator and a separate independent reviewer, then write the durable release:

```sh
pnpm run generate:english-literature-study-deck -- --generate --release-id=ocr-j352-literature-standard-v2
```

Rebuild and verify the additive 171-card source plan:

```sh
pnpm run build:english-literature-study-deepening
```

Run only the no-model, fail-closed source preflight (safe while another model queue is active):

```sh
pnpm run run:english-literature-study-deepening -- --preflight-only
```

After the standard descendant-coverage queue is terminal, run the 13 additive shards with no more than two model processes. The runner first repeats the fail-closed 171-row source preflight and finishes with the aggregate collision audit:

```sh
pnpm run run:english-literature-study-deepening -- --max-concurrent=2
```

Validate the accepted artifact without D1 access:

```sh
pnpm run validate:study-cards -- --input=data/study-cards/releases/ocr-j352-literature-standard-v1/accepted-study-cards.json
```

The D1 operation remains a separate, reviewable step. A read-only preflight is the default; only `--write` mutates `QUESTION_DB`:

```sh
pnpm run import:study-cards -- --input=data/study-cards/releases/ocr-j352-literature-standard-v1/accepted-study-cards.json
pnpm run import:study-cards -- --input=data/study-cards/releases/ocr-j352-literature-standard-v1/accepted-study-cards.json --write
```

This release is append-only. A changed model output or source manifest requires a new independently reviewed release id; it does not overwrite an imported deck.
