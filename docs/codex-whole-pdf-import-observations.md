# Codex Whole-PDF Import Observations

Date: 2026-06-29

This note preserves the side-conversation conclusions about Codex whole-PDF import runs, OCR versus visual inspection, and how those observations should inform the production extraction workflow.

## User Direction Captured

The desired benchmark is whole official PDF import, not one-question or parent-question-only extraction. The agent should start from the official question-paper and mark-scheme PDFs and should not be helped by pre-fed `question-paper.txt`, `mark-scheme.txt`, full OCR dumps, or other large text extracts that would hide the actual PDF-to-JSON problem.

The workflow should observe Codex on enough full papers across Biology, Chemistry, and Physics before overfitting to one extraction strategy. Codex should be allowed to discover useful workflows, then the stable parts of those workflows should be captured in prompts and small helper scripts so future runs do not need to dynamically invent the same operations.

The target product workflow is broader than question extraction. It should cover:

- PDF-to-structured-question JSON extraction.
- Separate answer-chain reconciliation, reuse, update, and generalization.
- Agentic checking of generalized chains against source questions when needed.
- Extraction judging, chain reconciliation checks, solvability judging, strict audit, and D1 import dry-run.
- Safe D1 replacement/import only after the new data is known not to conflict with previous imported data.

The user explicitly questioned whether a custom bounded harness is needed at all if direct Codex runs are faster or better, and asked for comparison against whole-paper Codex rollouts before settling on a production workflow.

## Observed Whole-PDF Codex Results

Historical true PDF-only Codex baselines were found under `/tmp/qc-codex-pdf-baselines-20260628`.

| Paper                 |                  Output | Completed Commands | Failed Commands | Agent Messages | Token Usage                                                        |
| --------------------- | ----------------------: | -----------------: | --------------: | -------------: | ------------------------------------------------------------------ |
| Biology P1 Nov 2020   | 46 questions, 100 marks |                 13 |               1 |             17 | input 1,953,808; cached 1,587,328; output 39,734; reasoning 10,045 |
| Chemistry P1 Nov 2020 | 43 questions, 100 marks |                 44 |               4 |             28 | input 2,476,964; cached 2,182,784; output 35,273; reasoning 9,675  |
| Physics P1 Nov 2020   | 41 questions, 100 marks |                 31 |               0 |             36 | input 3,740,954; cached 3,227,392; output 34,739; reasoning 12,688 |

Prompted whole-paper Codex baselines were found under `/tmp/qc-codex-prompted-baselines-20260628`.

| Paper                 |                  Output | Completed Commands | Failed Commands | Token Usage                                                       |
| --------------------- | ----------------------: | -----------------: | --------------: | ----------------------------------------------------------------- |
| Biology P1 Nov 2020   | 46 questions, 100 marks |                 40 |               4 | input 1,399,015; cached 1,176,704; output 29,512; reasoning 7,837 |
| Biology P2 Nov 2020   | 43 questions, 100 marks |                 36 |               2 | input 3,492,832; cached 3,031,040; output 27,809; reasoning 5,396 |
| Chemistry P1 Nov 2020 | 43 questions, 100 marks |                 66 |               7 | input 1,673,756; cached 1,491,200; output 34,832; reasoning 7,243 |
| Chemistry P2 Nov 2020 | 47 questions, 100 marks |                 60 |               6 | input 4,178,204; cached 3,804,160; output 40,665; reasoning 9,080 |
| Physics P1 Nov 2020   | 41 questions, 100 marks |                 55 |               2 | unavailable in trace                                              |
| Physics P2 Nov 2020   | 38 questions, 100 marks |                 53 |               0 | input 1,925,301; cached 1,756,416; output 32,980; reasoning 8,029 |

These numbers show that a 20-step cap is too small for a whole-paper agentic extractor. Whole-paper Codex runs commonly required roughly 30 to 65 shell/tool actions, and the lower-count Biology baseline still depended on broad shell access and efficient PDF utilities.

The historical `tmp/codex-benchmark-whole-paper-20260628` artifact is not equivalent to a true PDF-only production run because the prompt was given precomputed `question-paper.txt`, `mark-scheme.txt`, and page PNGs. It remains useful as a reference for expected JSON quality and latency, but not as proof of PDF-to-JSON extraction from official PDFs.

The copied historical benchmark under
`/home/yaroslav_volovich/projects/questions-constellation/tmp/codex-benchmark-whole-paper-20260628`
contains `codex-events.jsonl`, but no separate original rollout JSONL for thread
`019f0fec-9133-78e2-a113-bf614ba9b6c5` was found locally. The observable sequence was:
read slices of precomputed `question-paper.txt` and `mark-scheme.txt` with `sed`, list the
pre-rendered page PNGs and PDFs with `rg --files`, check text lengths with `wc -l`, write
`codex-output.json`, then validate JSON syntax/counts with `python3 -m json.tool`. It used 11
command actions, 0 failed actions, and 549,045 input / 396,032 cached / 26,422 output / 558
reasoning tokens, producing 46 questions and 100 marks. This is a useful quality target, but it is
not a production PDF-only trace because the core text and page images were pre-fed.

## Production SDK Wrapper Result

The production path now launches Codex through `@openai/codex-sdk` from clean prepared work
directories. The Biology Paper 1 November 2020 run started from the official question-paper and
mark-scheme PDFs, not pre-fed text dumps.

| Phase                             | Artifact                                                                           | Wall time |      Commands/actions | Failed actions | Token usage                                                        | Outcome                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------- | --------: | --------------------: | -------------: | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Codex PDF extraction              | `tmp/codex-sdk-extraction/aqa-84611h-qp-nov20/normalized-extraction-v5.json`       |  500.567s |                    51 |              3 | input 1,371,023; cached 1,202,176; output 21,831; reasoning 3,637  | 46 questions, 100 marks, deterministic validation passed            |
| Codex answer-chain reconciliation | `tmp/codex-sdk-chain/aqa-84611h-qp-nov20-v7-source-repaired/chain-reconciled.json` |  557.425s |                    41 |              0 | input 1,407,819; cached 1,218,560; output 27,717; reasoning 11,011 | 32 reused, 14 created, 0 updated, 0 review; chain validation passed |
| Solvability judge                 | `tmp/codex-sdk-import-ready/aqa-84611h-qp-nov20/final-solvability-v7-audit.json`   |  893.195s |    46 LLM judge calls |              0 | prompt 212,340; response 15,481; thinking 52,850; total 280,671    | 46/46 passed                                                        |
| D1 import                         | `tmp/codex-sdk-import-ready/aqa-84611h-qp-nov20/final-import-v7-audit.json`        |      8.2s | 554 insert statements |              0 | n/a                                                                | targeted write passed; 46-question post-write coverage              |

The raw SDK extraction was faster than the prompted Biology P1 Nov20 Codex baseline (624.23s) and
substantially better than the old chunk extractor, but the independent solvability audit found
real learner-facing context defects that the deterministic extraction validator did not catch:
Q01 investigation/Table 1 context, Q06.1 age/gender controlled-factor setup, and Q07 mAbs definition
context. The final v7 artifact repairs those fields from the official PDF and then passes strict
audit, solvability, D1 dry-run, and D1 write. This is the intended safety pattern: Codex may produce
a mechanically valid whole paper, but import still waits for learner-facing solvability and D1
replacement checks.

Follow-up render/import-fix run on the same Biology Paper 1 November 2020 whole paper used the same
official PDFs and Codex subscription path, then repaired only defects found by independent judging
and downstream import checks:

| Phase                                   | Artifact                                                                                                     | Wall time |            Commands/actions | Failed actions | Token usage                                                        | Outcome                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------: | --------------------------: | -------------: | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Codex PDF extraction                    | `tmp/codex-sdk-extraction/aqa-84611h-qp-nov20-renderfix-v12/normalized-extraction.json`                      |  585.272s |                          46 |              2 | input 1,691,858; cached 1,432,064; output 23,889; reasoning 4,238  | 46 questions, 100 marks, mechanical validation passed                                |
| Targeted Codex repair                   | `tmp/codex-extraction-repair/aqa-84611h-qp-nov20-renderfix-v12-to-v15/repaired-normalized-extraction.json`   |  103.976s |                          22 |              2 | input 299,143; cached 264,704; output 4,495; reasoning 814         | repaired Table 1 units and response-line counts; Q07.1 = 7 and Q07.3 = 16 preserved  |
| Independent extraction judge            | `tmp/codex-extraction-judge/aqa-84611h-qp-nov20-renderfix-v15/judge-report.json`                             |  201.065s |                          39 |              0 | input 1,066,391; cached 913,920; output 7,330; reasoning 1,208     | pass, score 0.98, 46 refs checked, 0 required repairs                                |
| Codex answer-chain reconciliation       | `tmp/codex-sdk-chain/aqa-84611h-qp-nov20-renderfix-v15/chain-reconciled-normalized.json`                     |  617.405s |                          38 |              0 | input 1,122,847; cached 1,017,344; output 26,277; reasoning 11,663 | 32 reused, 14 created, 0 updated, 0 review; chain validation passed                  |
| Strict audit / solvability / D1 dry-run | `tmp/codex-sdk-import-ready/aqa-84611h-qp-nov20/renderfix-v15-fresh-import-audit.json`                       |       n/a | 46 judge calls plus dry-run | 0 failed calls | n/a                                                                | mechanical audit passed; solvability 46/46; replacement `safeToReplace: true`        |
| R2 upload                               | `tmp/codex-extraction-repair/aqa-84611h-qp-nov20-renderfix-v12-to-v15/assets/`                               |      8.4s |                  11 uploads |              0 | n/a                                                                | all referenced assets uploaded under `images/papers/aqa-84611h-qp-nov20/`            |
| D1 import                               | `tmp/codex-sdk-import-ready/aqa-84611h-qp-nov20/renderfix-v15-fresh-import/chain-reconciled-normalized.json` |      5.8s |       588 insert statements |              0 | n/a                                                                | targeted write passed; 46 overlays, 155 mark rows, 77 checklist rows, 44 chain links |
| Deployed route crawl                    | `tmp/public-route-checks/aqa-84611h-qp-nov20-renderfix-v15.json`                                             |   64.425s |             237 HTTP routes |              0 | n/a                                                                | all question, practice, chain, constellation, and image routes returned 200          |

The first deployed route crawl proved route health, not public-visible multi-paper coverage.
Follow-up route reporting must use the same visibility rules as the public chain pages. For the
Biology Nov20 v15 import, the corrected report at
`tmp/public-route-checks/aqa-84611h-qp-nov20-renderfix-v15-visible.json` shows 44 public-visible
chains, two public multi-question chains within the same paper, and zero public multi-paper chains.
Seven imported chain ids have raw links across multiple papers but only one public-visible question,
because the other linked questions are draft/review-blocked or otherwise hidden from the public
chain route.

The v15 run exposed three production-path fixes:

- Treat non-positive PDF `pageCount` values as missing and recompute from the official PDF in the
  normalizer.
- Clear import-ready output directories before writing so stale JSON cannot contaminate strict
  audit or D1 dry-run/import.
- Do not require a fake model answer or answer key for `asset-canvas`/`drawing-box` responses when
  mark-scheme rows and checklist rows provide the grading evidence.

It also added `scripts/check-public-question-routes.mjs`, which queries D1 and crawls the deployed
`constellation.eviworld.com` routes after import. This caught the class of "open question" failures
that row-count-only import checks cannot prove absent.

## Humanities And Computing Canary

AQA GCSE Computer Science Paper 2 June 2024 was used as the first non-science-whole-paper canary on
2026-07-01. The run started from official PDFs in
`data/aqa-gcse-history-geography-computer-science/` and examiner-report evidence; whole text dumps
were not supplied as prompt inputs.

| Phase                                   | Artifact                                                                                                                                                                         | Wall time |  Actions/calls | Failed actions | Token usage                                                       | Outcome                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | -------------: | -------------: | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Codex PDF extraction                    | `tmp/codex-humanities-canary-subscription-v8/aqa-computer-science-2024-june-paper-2-computing-concepts-qp/raw/aqa-computer-science-2024-june-paper-2-computing-concepts-qp.json` |  765.148s |             68 |              2 | input 2,137,304; cached 1,867,264; output 36,553; reasoning 4,389 | 38 questions, 90 marks, deterministic validation passed              |
| Independent Codex extraction judge      | `tmp/codex-humanities-canary-subscription-v8/aqa-computer-science-2024-june-paper-2-computing-concepts-qp/extraction-judge/judge-report.json`                                    |  252.157s |             42 |              2 | input 924,378; cached 642,048; output 10,868; reasoning 3,015     | pass, score 0.98, 38 refs checked, 0 required repairs                |
| Codex answer chains                     | `tmp/codex-humanities-chain-rerun-v1/chain-reconciled/aqa-computer-science-2024-june-paper-2-computing-concepts-qp.json`                                                         |  421.364s |             19 |              0 | input 441,319; cached 377,344; output 22,407; reasoning 9,520     | chain validation passed; style repairs then passed independent judge |
| Chain style judge                       | `tmp/codex-humanities-chain-rerun-v1/codex-chains/chain-style-judge.json`                                                                                                        |       n/a |      5 batches |              0 | prompt 24,356; response 349; thinking 2,379; total 27,084         | passed, 0 issues                                                     |
| Strict audit / solvability / D1 dry-run | `tmp/codex-humanities-chain-rerun-v1/import-ready-final-solvability-audit.json`                                                                                                  |       n/a |      38 judges |              0 | prompt 106,855; response 11,547; thinking 24,696; total 143,098   | audit passed, solvability 38/38, 38 kept, 0 dropped, `safeToReplace` |
| D1 canary write                         | `tmp/codex-humanities-chain-rerun-v1/import-ready-final-solvability/aqa-computer-science-2024-june-paper-2-computing-concepts-qp.normalized.json`                                |    8.147s | 580 statements |              0 | n/a                                                               | 38 questions, 38 overlays, 141 mark rows, 69 checklist rows          |
| R2 upload and deployed crawl            | `tmp/public-route-checks/aqa-computer-science-2024-june-paper-2-computing-concepts-qp-after-r2.json`                                                                             |   73.262s |     200 routes |              0 | n/a                                                               | 0 failed routes after 10 referenced assets were uploaded to R2       |

This canary confirmed that the Codex production path can handle a whole Computer Science paper with
SQL/code, fixed-response answers, level descriptors, and exact binary/logic notation through D1
dry-run. It also exposed importer-level fixes: recompute missing/non-positive page counts from the
official PDF, normalize string level marks, allow reusable calculation constants such as base 16 in
chain handles, and treat fixed-response prose like `A and E` as duplicate answer-key evidence rather
than a reason to drop the question.

The run did not prove cross-paper chain reuse. It had no existing-chain context, so all 38 chain ids
were created new. A production batch should either provide D1/exported existing-chain context to each
chain run or perform a later Codex chain consolidation pass before claiming multi-paper reuse.

The first route crawl for the canary failed 10/200 routes, all image assets. The question, practice,
chain, and constellation routes already returned 200, but the PNGs had not been uploaded because the
manual canary write bypassed the production pipeline's R2 upload phase. After
`scripts/upload-r2-images.mjs` uploaded the 10 referenced assets, the second crawl passed 200/200.
This is an operational requirement: official-PDF extraction, strict audit, and D1 write are not
enough for route health when the paper references local image assets.

AQA GCSE Computer Science Paper 2 June 2022 was then run as an identity-safe follow-up on
2026-07-02, using official PDFs only:

| Phase                                 | Artifact                                                                                                                                                                                        | Wall time | Actions | Failed | Token usage                                                       | Outcome                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------: | -----: | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Codex PDF extraction                  | `tmp/codex-humanities-cs-identity-safe-v3/work/aqa-computer-science-2022-june-paper-2-computing-concepts-qp/raw/aqa-computer-science-2022-june-paper-2-computing-concepts-qp.json`              |  879.575s |      54 |      1 | input 2,742,139; cached 2,447,872; output 41,778; reasoning 5,480 | 45 questions, 90 marks, deterministic validation passed                                |
| Independent Codex extraction judge    | `tmp/codex-humanities-cs-identity-safe-v3/work/aqa-computer-science-2022-june-paper-2-computing-concepts-qp/extraction-judge/judge-report.json`                                                 |  243.256s |      33 |      0 | input 1,211,551; cached 934,912; output 10,466; reasoning 2,597   | pass, score 1.00, 45 refs checked, 0 required repairs                                  |
| Codex answer-chain reconciliation     | `tmp/codex-humanities-cs-identity-safe-v3/work/aqa-computer-science-2022-june-paper-2-computing-concepts-qp/chain-reconciled/aqa-computer-science-2022-june-paper-2-computing-concepts-qp.json` |  559.805s |      31 |      0 | input 1,050,747; cached 932,352; output 28,940; reasoning 12,521  | 9 reused, 34 created, 2 updated, 0 review                                              |
| Strict audit / D1 dry-run             | `tmp/codex-humanities-cs-identity-safe-v3/work/aqa-computer-science-2022-june-paper-2-computing-concepts-qp/import-ready-strict-media-fix-audit.json`                                           |       n/a |     n/a |      0 | n/a                                                               | 45/45 kept, 0 audit errors/warnings, D1 dry-run passed with 595 planned SQL statements |
| Codex solvability v2                  | `tmp/codex-solvability-cs2022-v2/codex-solvability-summary.json`                                                                                                                                |  322.605s |      34 |      2 | input 769,266; cached 671,744; output 15,482; reasoning 5,208     | failed 44/45: Q11.0 used raw literal alternatives such as `119 or 77`                  |
| Alias-fixed strict audit / D1 dry-run | `tmp/codex-humanities-cs-identity-safe-v3/work/aqa-computer-science-2022-june-paper-2-computing-concepts-qp/import-ready-alias-fix-audit.json`                                                  |       n/a |     n/a |      0 | n/a                                                               | 45/45 kept, 0 audit errors/warnings, D1 dry-run passed with 595 planned SQL statements |
| Codex solvability v3                  | `tmp/codex-solvability-cs2022-v3-alias-fix/codex-solvability-summary.json`                                                                                                                      |  263.114s |      24 |      0 | input 709,143; cached 562,176; output 13,148; reasoning 4,502     | passed 45/45 after alias normalization                                                 |

The first strict import-ready subset kept only 39/45 questions because the deterministic validator
warned that Figure 2/Figure 3/Figure 4 references lacked media assets. That was too conservative:
Codex had already preserved Figure 2's string and Figure 4's SQL source data as learner-visible
structured blocks, and Q17.3 still had a real response-surface asset. The validator now accepts
structured source-data blocks as satisfying a referenced Figure/Table dependency while continuing
to require concrete assets for true diagram/image response surfaces.

The same run also forced response-rendering support for per-field labelled answer areas. Q01.2 uses
four visible working lines plus one hexadecimal answer line, and Q04.1 has two separately labelled
three-line answer fields. The import path now preserves those `labeled-lines.fields` through
normalization, D1 import JSON, server data loading, grading parsing, and the Svelte renderer.

The Codex SDK solvability judge found a defect that strict mechanical validation missed: Q11.0
encoded accepted Unicode alternatives as raw strings such as `119 or 77`. Those are not
machine-checkable fixed-response keys. The production prompt, helper validator, shared import
normalizer, subset builder, and D1 importer now require/preserve canonical `correctAnswer` values
with `aliases`, and the alias-fixed import-ready artifact passed 45/45 solvability.

The source-identity audit over the AQA History/Geography/Computer Science manifest found 61 safe
rows and 39 visible-series mismatches: 2 Computer Science, 6 Geography, and 31 History. Its artifacts
are `tmp/aqa-humanities-cs-source-identity-audit.json` and
`tmp/aqa-humanities-cs-identity-safe-manifest.json`. Batch import should run only the identity-safe
subset unless a mismatch is manually audited and passed with `--allow-visible-source-mismatch`.

AQA GCSE Geography Paper 1 June 2022 was then used as a response-rendering canary on 2026-07-02.
The run started from the official PDFs and examiner report under
`data/aqa-gcse-history-geography-computer-science/`, with no pre-fed `question-paper.txt` or
`mark-scheme.txt` prompt inputs. The previous v10 canary extracted the whole paper but failed
learner-facing solvability on four refs: `03.6`, `04.1`, `04.6`, and `05.6`.

| Phase                               | Artifact                                                                                                                                                                                                        | Wall time | Actions | Failed | Token usage                                                       | Outcome                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------: | -----: | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| v10 Codex PDF extraction            | `tmp/codex-humanities-geography-v10/work/aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp/raw/aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp.json`              | 1556.097s |     121 |      2 | input 7,066,663; cached 6,594,560; output 61,444; reasoning 6,914 | 40 questions, 103 marks, deterministic validation passed                        |
| v10 independent extraction judge    | `tmp/codex-humanities-geography-v10/work/aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp/extraction-judge/judge-report.json`                                                            |  294.178s |      56 |      0 | input 1,166,412; cached 968,192; output 13,582; reasoning 3,294   | pass, score 0.99, 0 required repairs                                            |
| v10 answer-chain reconciliation     | `tmp/codex-humanities-geography-v10/work/aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp/chain-reconciled/aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp.json` |  485.276s |      30 |      1 | input 1,226,515; cached 1,131,008; output 25,097; reasoning 6,973 | 40 created, chain validation passed                                             |
| v10 Codex solvability               | `tmp/codex-humanities-geography-v10/work/aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp/codex-solvability/solvability-report.json`                                                     |  401.668s |      13 |      0 | input 1,035,749; cached 830,464; output 16,275; reasoning 8,186   | failed 36/40: `03.6`, `04.1`, `04.6`, `05.6`                                    |
| v11 Codex PDF extraction            | `tmp/codex-humanities-geography-v11/work/aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp/raw/aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp.json`              | 1063.793s |      57 |      2 | input 4,251,594; cached 3,913,728; output 44,132; reasoning 6,350 | 40 questions, 103 marks, deterministic validation passed                        |
| v11 independent extraction judge    | `tmp/codex-humanities-geography-v11/work/aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp/extraction-judge/judge-report.json`                                                            |  399.386s |      47 |      0 | input 1,748,557; cached 1,489,408; output 14,040; reasoning 2,268 | pass, score 1.00, 40 refs checked, 0 required repairs                           |
| v11 answer-chain reconciliation     | `tmp/codex-humanities-geography-v11/work/aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp/chain-reconciled/aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp.json` |  476.687s |      23 |      1 | input 1,045,315; cached 950,784; output 23,884; reasoning 9,737   | 40 created, chain validation passed; style judge intentionally skipped          |
| v11 stale import-ready solvability  | `tmp/codex-humanities-geography-v11/work/aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp/codex-solvability/solvability-report.json`                                                     |  475.779s |      47 |      1 | input 2,624,957; cached 2,292,736; output 19,953; reasoning 6,065 | failed 39/40: import-ready normalized `04.1` graph plotting into `choice-table` |
| v11 fixed strict audit / D1 dry-run | `tmp/codex-humanities-geography-v11-fixed-import-ready/prepare-import-ready-summary.json` and `tmp/codex-humanities-geography-v11-fixed-import-ready/d1-import-dry-run.json`                                    |       n/a |     n/a |      0 | n/a                                                               | 40/40 kept, 0 dropped, strict audit passed, D1 dry-run planned 614 statements   |
| v11 fixed Codex solvability         | `tmp/codex-humanities-geography-v11-fixed-import-ready/codex-solvability/solvability-report.json`                                                                                                               |  428.708s |      25 |      3 | input 1,591,435; cached 1,318,912; output 15,647; reasoning 5,464 | passed 40/40                                                                    |

This canary exposed two importer defects that should stay as permanent gates. First, diagram-required
written responses must use a diagram-capable response surface. The extractor now prompts
Q03.6/Q04.6/Q05.6-style questions as `drawing-box` plus visible line evidence, and deterministic
validators emit `diagram_response_surface_missing` when such prompts are normalized to plain
`lines`. Second, import-ready normalization must not convert graph plotting, diagram, image, grid,
or cross-section responses into `choice-table` merely because the source data are also present as a
structured table. Table data can be context; the learner response surface remains the graph/image
canvas. `choice-table` normalization is now reserved for genuine ring/circle/select/tick/shade a
table value or cell prompts.

## July 2026 Humanities Batch Status

Remote D1 inventory on 2026-07-06 shows that the manifest-backed AQA humanities/computing import is
incremental, not all complete:

| Subject          | Manifest papers | D1 question-paper docs | D1 questions | D1 marks | Remaining |
| ---------------- | --------------: | ---------------------: | -----------: | -------: | --------: |
| Computer Science |               6 |                      6 |          228 |      520 |         0 |
| Geography        |              15 |                     15 |          507 |     1437 |         0 |
| History          |              79 |                     26 |          122 |     1088 |        53 |

The most recent Geography Paper 2 reruns were full official-PDF-to-D1 writes, not manual JSON
patches.

| Paper                       |                                                                                          Extraction |                                                                                   Extraction judge |                                                                                       Chain run |                                                                                              Solvability | Import and route result                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------: | -------------------------------------------------------------------------------------------------: | ----------------------------------------------------------------------------------------------: | -------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geography Paper 2 June 2020 | 1167.270s; 92 commands; 3 failed; input 5,335,953; cached 5,030,912; output 50,334; reasoning 6,249 | 364.370s; 60 commands; 3 failed; input 1,194,701; cached 1,070,080; output 15,094; reasoning 3,090 | 487.262s; 17 commands; 0 failed; input 653,196; cached 569,344; output 25,335; reasoning 12,753 |       491.089s; 22 commands; 0 failed; input 1,792,018; cached 1,538,048; output 18,741; reasoning 6,283 | 40 kept, 0 dropped, D1 write passed; route crawl `tmp/public-route-checks/aqa-geography-2020-p2-v52.json` passed 196/196 routes, including 16 assets                                                          |
| Geography Paper 2 June 2021 |  953.021s; 62 commands; 1 failed; input 4,341,709; cached 3,868,160; output 40,203; reasoning 4,186 |     332.229s; 60 commands; 0 failed; input 687,401; cached 569,344; output 14,347; reasoning 2,663 | 580.322s; 32 commands; 0 failed; input 982,692; cached 885,248; output 30,273; reasoning 14,142 | retry 540.950s; 26 commands; 2 failed; input 1,686,041; cached 1,472,000; output 20,943; reasoning 8,419 | final strict audit passed 40/40 and D1 write passed after compact figure asset normalization; route crawl `tmp/public-route-checks/aqa-geography-2021-p2-v49.json` passed 202/202 routes, including 16 assets |

The 2020 Paper 2 run fixed concrete importer/prompt defects: Q01.5 and Q02.4 answer-line counts
are 12, Q01.6 renders the complete Figure 3 pictogram source, and Q02.6/Q02.7 include all required
Figure 7b tourism-opinion evidence. The 2021 Paper 2 run exposed a deterministic import bug where a
single asset such as `figure-10ab.png` satisfies references to both Figure 10a and Figure 10b; the
normalizer now expands compact multi-letter figure suffixes before deciding that an asset is
missing.

Recent AQA History 2020 reruns used whole official PDFs, not pre-fed text dumps. Each run passed
official source-identity preflight, Codex PDF extraction, independent Codex extraction judging,
separate Codex answer-chain reconciliation with D1 existing-chain context, strict audit, Codex
solvability, D1 conflict checks, D1 write, and a deployed route crawl.

| Paper                              |                                                                                         Extraction |                                                                                   Extraction judge |                                                                                        Chain run |                                                                                         Solvability | Import and route result                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------: | -------------------------------------------------------------------------------------------------: | -----------------------------------------------------------------------------------------------: | --------------------------------------------------------------------------------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| History 2020 P1B A First World War | 455.930s; 54 commands; 0 failed; input 1,420,843; cached 1,155,072; output 18,764; reasoning 2,778 |      198.001s; 35 commands; 0 failed; input 542,606; cached 395,264; output 8,386; reasoning 1,558 |   233.120s; 28 commands; 1 failed; input 923,712; cached 771,584; output 10,623; reasoning 4,241 |        100.559s; 10 commands; 1 failed; input 185,051; cached 92,672; output 3,964; reasoning 1,541 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p1b-a-fww-after-import.json` passed 22/22 routes including 2 assets       |
| History 2020 P1B C East-West       | 359.474s; 46 commands; 0 failed; input 1,630,350; cached 1,394,688; output 16,437; reasoning 1,774 |   255.834s; 43 commands; 1 failed; input 1,138,099; cached 949,248; output 11,674; reasoning 3,532 |   234.071s; 24 commands; 1 failed; input 828,878; cached 752,640; output 11,792; reasoning 4,895 |        84.378s; 12 commands; 0 failed; input 192,561; cached 145,408; output 3,892; reasoning 1,305 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p1b-c-east-west-after-import.json` passed 20/20 routes                    |
| History 2020 P1B D Asia            | 386.555s; 61 commands; 0 failed; input 1,653,944; cached 1,461,248; output 18,790; reasoning 2,737 |      170.686s; 22 commands; 0 failed; input 541,613; cached 404,992; output 7,626; reasoning 2,110 |   229.075s; 23 commands; 1 failed; input 788,125; cached 714,240; output 10,386; reasoning 4,457 | rerun 119.506s; 19 commands; 2 failed; input 190,669; cached 143,360; output 5,495; reasoning 1,687 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p1b-d-asia-after-import.json` passed 20/20 routes                         |
| History 2020 P2A A Health          | 415.217s; 51 commands; 0 failed; input 1,370,248; cached 1,168,384; output 17,736; reasoning 1,309 |      145.878s; 20 commands; 1 failed; input 469,131; cached 351,744; output 6,124; reasoning 1,415 |   260.440s; 23 commands; 1 failed; input 702,798; cached 629,760; output 13,042; reasoning 6,325 |         113.015s; 18 commands; 1 failed; input 331,839; cached 231,936; output 4,912; reasoning 897 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2a-a-health-after-import.json` passed 21/21 routes including 1 asset     |
| History 2020 P2A B Power           | 560.914s; 50 commands; 0 failed; input 1,797,026; cached 1,600,512; output 18,420; reasoning 2,497 |      172.983s; 15 commands; 0 failed; input 569,240; cached 413,184; output 5,576; reasoning 1,126 |   253.248s; 29 commands; 0 failed; input 743,907; cached 677,376; output 12,397; reasoning 5,770 |      186.344s; 32 commands; 10 failed; input 332,199; cached 232,960; output 8,379; reasoning 1,580 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2a-b-power-after-import.json` passed 21/21 routes including 1 asset      |
| History 2020 P2A C Migration       | 427.088s; 55 commands; 3 failed; input 1,565,851; cached 1,311,232; output 19,166; reasoning 2,896 |      202.893s; 19 commands; 1 failed; input 869,368; cached 666,112; output 7,261; reasoning 1,459 |   200.713s; 18 commands; 0 failed; input 388,446; cached 311,296; output 10,218; reasoning 4,639 |       136.816s; 20 commands; 2 failed; input 229,239; cached 152,064; output 6,101; reasoning 1,948 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2a-c-migration-after-import.json` passed 21/21 routes including 1 asset  |
| History 2020 P2B A Norman England  | 418.460s; 41 commands; 0 failed; input 1,683,352; cached 1,538,048; output 20,108; reasoning 2,728 |      214.556s; 39 commands; 0 failed; input 785,664; cached 643,072; output 8,936; reasoning 1,580 |   247.682s; 24 commands; 1 failed; input 584,828; cached 505,344; output 12,548; reasoning 4,507 |       104.924s; 15 commands; 1 failed; input 237,646; cached 179,200; output 4,572; reasoning 1,357 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2b-a-norman-after-import.json` passed 20/20 routes                       |
| History 2020 P2B B Medieval        | 362.820s; 56 commands; 0 failed; input 1,368,946; cached 1,181,184; output 16,991; reasoning 3,084 |      163.963s; 22 commands; 0 failed; input 902,806; cached 701,952; output 6,438; reasoning 1,472 |   247.200s; 28 commands; 2 failed; input 896,924; cached 805,376; output 11,474; reasoning 4,452 |       121.355s; 14 commands; 1 failed; input 308,066; cached 258,048; output 5,108; reasoning 1,282 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2b-b-medieval-after-import.json` passed 20/20 routes                     |
| History 2020 P2B C Elizabethan     | 480.343s; 68 commands; 0 failed; input 1,976,642; cached 1,777,664; output 22,496; reasoning 3,401 |      182.461s; 35 commands; 0 failed; input 577,886; cached 487,936; output 7,895; reasoning 1,956 |    219.614s; 20 commands; 0 failed; input 729,341; cached 607,232; output 9,989; reasoning 4,308 |       123.778s; 26 commands; 1 failed; input 243,127; cached 187,392; output 5,650; reasoning 1,299 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2b-c-elizabethan-after-import.json` passed 20/20 routes                  |
| History 2020 P2B D Restoration     | 362.901s; 52 commands; 0 failed; input 1,408,949; cached 1,233,408; output 17,296; reasoning 2,150 |      120.281s; 23 commands; 0 failed; input 353,675; cached 278,016; output 5,154; reasoning 1,058 |   210.881s; 19 commands; 1 failed; input 613,623; cached 552,960; output 10,339; reasoning 3,954 |       122.377s; 19 commands; 4 failed; input 231,496; cached 185,856; output 5,205; reasoning 1,327 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2b-d-restoration-after-import.json` passed 20/20 routes                  |
| History 2021 P1A A America         | 377.754s; 53 commands; 0 failed; input 1,211,222; cached 1,069,056; output 18,859; reasoning 2,308 |      202.044s; 29 commands; 0 failed; input 793,661; cached 621,568; output 8,784; reasoning 2,575 |   276.969s; 22 commands; 3 failed; input 480,694; cached 389,120; output 14,293; reasoning 6,941 |       160.125s; 25 commands; 2 failed; input 267,292; cached 209,920; output 7,654; reasoning 2,448 | 6 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1a-a-america-after-import.json` passed 30/30 routes                      |
| History 2021 P1A B Germany         | 406.752s; 42 commands; 0 failed; input 1,432,953; cached 1,235,968; output 18,363; reasoning 1,866 |      154.245s; 21 commands; 1 failed; input 496,328; cached 347,136; output 6,610; reasoning 1,559 |   276.690s; 26 commands; 1 failed; input 672,542; cached 602,624; output 13,756; reasoning 6,186 |       137.917s; 23 commands; 3 failed; input 314,851; cached 251,392; output 6,417; reasoning 1,309 | 6 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1a-b-germany-after-import.json` passed 30/30 routes                      |
| History 2021 P1A C Russia          |   420.136s; 51 commands; 0 failed; input 1,174,612; cached 993,280; output 20,646; reasoning 2,361 |      173.337s; 31 commands; 1 failed; input 713,996; cached 574,976; output 7,770; reasoning 1,857 | 308.445s; 35 commands; 1 failed; input 1,067,863; cached 993,792; output 15,040; reasoning 6,669 |       132.365s; 23 commands; 2 failed; input 295,119; cached 257,536; output 5,651; reasoning 1,002 | 6 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1a-c-russia-after-import.json` passed 30/30 routes                       |
| History 2021 P1B B Inter-war Years | 474.789s; 41 commands; 0 failed; input 2,296,029; cached 1,982,976; output 19,486; reasoning 4,310 |      227.056s; 29 commands; 3 failed; input 927,799; cached 693,760; output 9,324; reasoning 3,027 | 294.059s; 27 commands; 0 failed; input 1,118,899; cached 945,664; output 14,100; reasoning 6,704 |         385.312s; 16 commands; 2 failed; input 211,833; cached 154,112; output 4,298; reasoning 712 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1b-b-inter-war-after-import.json` passed 20/20 routes                    |
| History 2021 P1A D America         | 449.833s; 52 commands; 0 failed; input 1,627,161; cached 1,448,960; output 20,880; reasoning 2,276 |     236.855s; 24 commands; 1 failed; input 709,775; cached 539,648; output 10,369; reasoning 4,979 |   283.831s; 28 commands; 0 failed; input 724,002; cached 628,736; output 13,930; reasoning 5,891 |       160.342s; 18 commands; 2 failed; input 333,999; cached 274,944; output 7,134; reasoning 2,799 | 6 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1a-d-america-1920-after-import.json` passed 30/30 routes                 |
| History 2021 P1B A First World War | 467.827s; 57 commands; 1 failed; input 1,767,117; cached 1,522,688; output 19,372; reasoning 2,930 |     232.786s; 34 commands; 1 failed; input 921,707; cached 790,016; output 10,480; reasoning 3,434 |   269.642s; 28 commands; 1 failed; input 977,633; cached 896,000; output 12,709; reasoning 5,751 |       184.458s; 22 commands; 3 failed; input 374,641; cached 306,176; output 6,228; reasoning 1,425 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1b-a-fww-after-import.json` passed 22/22 routes including 2 assets       |
| History 2021 P1B C East-West       | 810.032s; 65 commands; 1 failed; input 5,086,386; cached 4,459,008; output 23,773; reasoning 3,973 |      216.935s; 41 commands; 0 failed; input 940,932; cached 810,496; output 9,242; reasoning 2,172 | 259.965s; 32 commands; 0 failed; input 1,007,168; cached 919,040; output 12,043; reasoning 4,892 |       144.766s; 21 commands; 7 failed; input 230,587; cached 157,696; output 6,606; reasoning 1,543 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1b-c-east-west-after-import.json` passed 22/22 routes including 2 assets |
| History 2021 P1B D Asia            | 376.820s; 43 commands; 0 failed; input 1,445,142; cached 1,255,936; output 17,223; reasoning 2,535 |   228.867s; 44 commands; 5 failed; input 1,062,437; cached 936,960; output 10,148; reasoning 3,122 |   253.576s; 19 commands; 0 failed; input 563,478; cached 430,592; output 12,284; reasoning 6,419 |       131.831s; 20 commands; 4 failed; input 299,766; cached 257,024; output 5,383; reasoning 1,182 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1b-d-asia-after-import.json` passed 20/20 routes                         |
| History 2021 P2A A Health          | 477.568s; 59 commands; 0 failed; input 1,647,510; cached 1,410,048; output 19,485; reasoning 3,518 |     306.145s; 30 commands; 4 failed; input 887,402; cached 772,608; output 11,220; reasoning 3,207 |   205.837s; 19 commands; 1 failed; input 429,106; cached 367,104; output 10,236; reasoning 3,813 |          77.810s; 11 commands; 2 failed; input 151,506; cached 109,056; output 3,385; reasoning 611 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p2a-a-health-after-import.json` passed 21/21 routes including 1 asset     |
| History 2021 P2A B Power           | 466.758s; 64 commands; 0 failed; input 1,758,292; cached 1,546,240; output 21,964; reasoning 4,512 |  241.991s; 37 commands; 0 failed; input 1,215,539; cached 1,059,328; output 9,949; reasoning 2,985 |   268.333s; 35 commands; 1 failed; input 821,485; cached 679,936; output 13,125; reasoning 5,345 |       127.618s; 16 commands; 1 failed; input 321,778; cached 262,144; output 5,491; reasoning 1,690 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p2a-b-power-after-import.json` passed 20/20 routes                        |
| History 2021 P2A C Migration first | 463.692s; 66 commands; 0 failed; input 1,955,610; cached 1,769,472; output 21,221; reasoning 3,616 | 295.219s; 55 commands; 5 failed; input 1,317,186; cached 1,105,920; output 12,759; reasoning 3,161 |                                                                                              n/a |                                                                                                 n/a | Blocked before D1 by independent judge: response lines were 46/49/48/91 instead of 47/48/47/97; guardrails added before rerun                            |
| History 2021 P2A C Migration rerun |     291.481s; 34 commands; 1 failed; input 865,297; cached 690,176; output 13,894; reasoning 1,283 |      156.080s; 21 commands; 0 failed; input 344,135; cached 216,576; output 5,163; reasoning 1,318 |   217.725s; 23 commands; 1 failed; input 888,137; cached 807,424; output 10,329; reasoning 3,232 |       144.349s; 18 commands; 0 failed; input 240,178; cached 209,920; output 5,354; reasoning 1,805 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p2a-c-migration-after-import.json` passed 20/20 routes                    |
| History 2021 P2B A Norman          | 419.050s; 50 commands; 0 failed; input 1,619,904; cached 1,346,560; output 19,520; reasoning 3,374 |      152.026s; 34 commands; 0 failed; input 591,039; cached 482,816; output 6,800; reasoning 1,250 |   267.166s; 29 commands; 1 failed; input 807,302; cached 558,592; output 13,667; reasoning 6,584 |         130.709s; 25 commands; 3 failed; input 346,422; cached 266,752; output 5,895; reasoning 772 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p2b-a-norman-after-import.json` passed 20/20 routes                       |

The independent judge caught real answer-line defects before import. Asia initially undercounted
Q02.0 and Q04.0; Health initially undercounted every response box. A later v17 batch failed Power,
Migration, and Norman before D1 for the same Paper 2 answer-book family. The production extractor
prompt, helper validation, and extraction judge now include source-specific rendered-page guardrails
for these fragile answer books. History 2020 Paper 2 Section A options use `49/52/52/101` lines for
`01.1`-`04.1`; Section B options use `48/50/49/98`. History 2021 Paper 1 Section A options use
America `22/23/50/23/50/76`, Germany `22/24/50/24/51/76`, and Russia `22/24/51/23/51/73` for the
six answer-all questions. The v18 rerun from official PDFs confirmed the 2020 Paper 2 counts and
passed extraction judge, chain reconciliation, solvability, strict audit, D1 write, and deployed
route crawls for Power, Migration, and Norman. The v20 first run failed before D1 on the same class
of issue for 2021 Section A: America Q06.1 was 74 instead of 76; Germany Q03.1/Q05.1/Q06.1 were
47/48/72 instead of 50/51/76; Russia Q02.0/Q03.0/Q05.0/Q06.0 were 23/50/50/72 instead of
24/51/51/73. After the source-specific prompt/helper/judge guardrails were added, a fresh `--force`
rerun from the official PDFs passed extraction judge, chain reconciliation, solvability, strict
audit, D1 write, and deployed route crawls for all three papers. The follow-up v21 run then caught
two more real defects before import: Option D America passed extraction and extraction judge but
failed solvability because learner-visible context generation dropped `keyItems` containing the
complete Interpretation A/B text; First World War passed extraction but failed the independent judge
because answer-line counts were `14/57/37/70` instead of `21/76/51/102`. The shared context builder
now preserves `keyItems`, and the extractor, helper validator, and extraction judge include the
2021 P1A D and P1B A guardrails. The rerun in `tmp/codex-history-batch-v21-rerun/` passed all
gates, D1 writes, and route crawls. The next v22 batch imported Health and East-West but correctly
blocked Asia before D1 because broad crops produced `17/70/46/93` lines instead of
`22/77/51/103`. The extractor prompt, deterministic helper validator, independent judge prompt, and
regression tests now include 2021 Section B Option B/C/D line-count guardrails: Option B
`22/77/52/103`, Option C `22/76/52/102`, and Option D `22/77/51/103`. A targeted rerun in
`tmp/codex-history-batch-v22-asia-rerun/` passed extraction, extraction judge, chain reconciliation,
solvability, strict audit, D1 write, and route crawl. The next v23 batch imported 2021 Power and
Norman and their deployed route crawls passed `20/20`, but it correctly blocked 2021 Migration
before D1 because the independent judge found response-line counts `46/49/48/91` instead of
`47/48/47/97`. The extractor prompt, deterministic helper validator, independent judge prompt, and
regression tests now include the source-specific Migration guardrail: Q01.1 `20 + 27 = 47`, Q02.1
`21 + 27 = 48`, Q03.1 `20 + 27 = 47`, and Q04.1 `18 + 27 + 27 + 25 = 97`. The forced rerun in
`tmp/codex-history-batch-v23-migration-rerun/` then passed extraction, independent judge, chain
reconciliation, solvability, strict audit, D1 write, and a deployed `20/20` route crawl. After this
write, D1 held History `29` papers, `134` questions, and `1208` marks. The follow-up v19 Section B run
exposed an import-ready normalizer bug, not a source-extraction bug: reused D1 chain definitions can omit
`answerChain.reviewNotes`, while the strict D1 audit schema requires an array. The shared import
normalizer now converts missing or scalar chain review notes to arrays before subset building.
Medieval and Elizabethan were rerun through the same production path with cached official-PDF
extractions and then passed strict audit, Codex solvability, D1 write, and route crawls. The route
crawls also confirmed the public multi-paper visibility fix: `hist-chain-factor-weigh-judgement`
is visible on 12 papers and the Section B `Convincing View` chain is visible on 4 papers, with no
raw multi-paper chain collapsing to a single public question.

The batch runner now has an explicit `--d1-existing-chains` mode. It builds subject-specific D1
chain-context files using `scripts/build-existing-chain-context.mjs --d1` and passes them into each
paper's separate Codex answer-chain run. This does not replace the later need for cohort-level chain
consolidation, but it prevents the default production batch from importing valid questions with no
awareness of already published chains.

An earlier missing Geography run failed before model execution because the Codex subscription hit a
usage limit; `codex doctor` confirmed ChatGPT auth was configured and no stored API key was used.
After the limit reset, the later Geography and History reruns above proceeded through the SDK path.

## OCR And Visual Inspection Conclusion

The JSONL rollouts did not show explicit `view_image` or image-view tool events. Codex appears to have used a hybrid workflow:

- `pdftotext` or the selectable PDF text layer for most printed question and mark-scheme text.
- `pdfimages`, rendered page images, contact sheets, and image metadata for figures, tables, layout, and answer-line checks.
- Visual inspection of rendered pages/contact sheets where the trace summaries mention it.
- `tesseract` only in some cases, notably Chemistry Nov 2020, for text inside embedded figures that was missing from `pdftotext`.

Therefore it is not accurate to say, based only on the observed JSONL, that Codex extracted all text by looking through `view_image`. It also is not safe to make OCR the source of truth.

Recommended source hierarchy:

1. Use the PDF text layer for exact printed question and mark-scheme text.
2. Use rendered pages and contact sheets for layout, table structure, figure placement, and answer-line checks.
3. Extract embedded images and inspect them visually for diagram labels, graph labels, and figure-only text.
4. Use OCR only as a fallback hint for small labels or raster-only text, and require visual or mark-scheme corroboration before accepting OCR-derived content.

Tesseract is useful as a helper but risky as an authority. It can silently corrupt subscripts, units, chemical formulae, inequalities, minus signs, table structure, axis labels, and line breaks.

Formulae and equations deserve especially strong visual handling. Chemistry equations, ionic formulae, state symbols, subscripts, superscripts, charges, physics formulae, units, and rearranged equations are often better recovered or verified through rendered-page or embedded-image vision than through OCR or plain text extraction alone.

## Workflow Lessons To Prompt Explicitly

Codex should be told to consider multiple extraction routes rather than one rigid recipe:

- Check whether the PDF has selectable text before using OCR.
- Extract embedded images because figures and tables may already be present as PDF image objects.
- Render page images/contact sheets to understand layout, response areas, figure placement, and table boundaries.
- Use visual inspection for formulae, graph labels, diagrams, and cases where text extraction loses layout.
- Prefer rendered-page or embedded-image vision for chemistry equations, physics formulae, and any notation where subscripts, superscripts, charges, state symbols, units, or fractions matter.
- Use geometry tools such as PyMuPDF, `mutool`, or rendered-page checks for answer-line counts instead of OCR.
- Validate JSON mechanically before finishing.
- Check question count, duplicate refs, parent mark totals, total paper marks, and known fragile line counts.
- Keep PDF extraction separate from answer-chain generation and reconciliation.
- Do not put worked numeric solutions into answer-chain fields.
- Run chain reconciliation, solvability checks, strict audit, and import dry-run after extraction before touching D1.

Each accepted extracted fact should ideally carry enough provenance to distinguish:

- PDF text layer.
- Mark-scheme text.
- Rendered page visual inspection.
- Embedded image visual inspection.
- OCR fallback.
- Agent inference from source evidence.

## Implications For The Custom Agentic Harness

The current bounded `@ljoukov/llm` harness is not tool-equivalent to Codex if it only exposes narrow page-text, image, crop, partial-validation, and submit tools. Codex benefited from broad shell access, ad hoc scripts, PDF utilities, embedded-image extraction, rendered contact sheets, geometry checks, and JSON validation loops.

If a custom harness is kept, it should either expose first-class narrow versions of the successful Codex operations or accept that it may be slower and less capable. Important missing or weaker capabilities include:

- Embedded image extraction and inspection as a normal path, not an afterthought.
- Contact-sheet creation and viewing.
- Selectable-text checks at page or ref scope.
- Geometry-based answer-line and table checks.
- Supporting insert/data-sheet lookup where present.
- Mechanical whole-paper validation with actionable failures.
- Enough max steps for whole-paper extraction, likely well above 20.

The decision point remains empirical: compare direct Codex whole-paper runs, prompted Codex whole-paper runs, and the custom harness on the same papers with the same downstream checks. If direct or lightly prompted Codex is consistently better, the production path may be to run Codex with a well-specified workflow and helper scripts rather than rebuild a weaker harness.
