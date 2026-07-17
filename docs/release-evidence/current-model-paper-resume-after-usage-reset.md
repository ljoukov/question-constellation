# Current-model paper import: usage-reset handoff

Observed on 2026-07-17 UTC. This handoff covers the final Physics import and the three OCR English
papers that still need current-model gates. It is deliberately a stop-and-resume document: none of
the three English candidates is approved by the evidence below.

## Historical quota incident (resolved)

The operator confirmed on 2026-07-17 UTC that the Codex quota was refreshed. The earlier failed
start remains preserved at
`tmp/current-model-paper-cohort/retry-runs/ocr-j352-01-qp-jun24/codex-solvability/events.jsonl`:

- thread: `019f6e4d-0caf-7c23-846d-4b9350a6524c`
- event count: 4
- provider message: `You've hit your usage limit ... try again at Jul 22nd, 2026 9:15 PM.`
- no model report was produced, so this is not a content verdict

The provider message is historical and is no longer an active release blocker. The next real paper
command is the availability check; if it returns another provider-limit response, preserve that
attempt and stop. Before the original handoff was written, two independent process sweeps found no
active or queued `codex exec`, paper pipeline, phase runner, retry loop, waiting shell, PID file, or
lock file.

## Physics terminal pass

`aqa-8464p1h-qp-jun24` is complete and remotely verified:

- extraction: exact reused 28-question / 70-mark candidate
- chains: passed, 14 reused and 14 created; thread
  `019f6e3b-7f8d-7101-932f-9b1f3dc0bdca`
- solvability: 28 passed, 0 failed; thread
  `019f6e48-56df-7fe3-acaa-8d3c62aa3da3`
- D1 import: passed in write mode for 28 questions
- remote D1 re-query: 28 distinct refs, 70 marks, all 28 published, zero review flags, zero
  missing ready overlays, mark-scheme rows, checklists, or primary chains
- source documents: both `aqa-8464p1h-qp-jun24` (`question_paper`) and
  `aqa-8464p1h-ms-jun24` (`mark_scheme`) are present
- remote assets: 8 required asset rows, 7 distinct delivered R2 keys, zero missing deliveries;
  every remote object byte-matches its audited local file

Terminal artifact hashes:

| Artifact                  | SHA-256                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| production import summary | `7d6d22b2de2fdca923d209fc7a6278507b16261353fca182098ad4a693ef6b9a` |
| solvability summary       | `26f057179bf21308ee5ef46af27aff4c3b8ae35adf3aba3cdb2f6e7209715b30` |
| solvability report        | `657d6ac420cccbf27d5769b9630eda22291f4ad2722dcd77559b3daf5360ef99` |
| import-ready paper        | `b001d4ada5f32ea8b596bd0f5553a34b9524e95ac3dac283e7e2f93be200169f` |

Remote/local R2 hashes, in Figure 1 through Figure 7 order:

1. `e243cd0e74379c43d19c06353e9130f05c93cabaea20800b9f076b4f798ad830`
2. `9e7f006ac96082aad29e7ff8d1f88ba1abbbf7b0f8fa46f3fb35f74da8f92c0c`
3. `c7b7473c29fd452e0c018182e2c3c251dea8fbf45c454fd6b698211e6251e02e`
4. `d287594ad7184193fc5c1a48aa3202d7c5bd6f4d917beb03055cd6c8523d72aa`
5. `6fed10533ca402b5ff9b824fd6b0aaf20f41f769972fc8940d680f4d3de2aa0f`
6. `b3dc8ef4cd24ac4a2c1501fd16e845c511773d209f63e5fce46298dd91945f92`
7. `f424e69988aac2b8e8c9a372bf46a4d8875a7d1ac59b3e3eb25dd59879774d39`

## Exact blocked-paper matrix

| Source document        | Audited retained scope                                                                                       | Current-model terminal state                                                                                                                                                                                                                                                                                                                       | Repair already made                                                                                                                                                                                                                                                             | Remote D1 state at handoff                                                                                                                                                 | Required next phase                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ocr-j352-01-qp-jun24` | 23 questions / 680 marks from 24 / 720; only `17.1` (40 marks) is withheld                                   | Extraction judge passed at 1.00; chains passed for all 23; R2 upload and strict pre-solvability audit passed. The pre-fix solvability run failed 2 of 23 (`05.1a`, `05.1b`) because broad prefix matching put both page assets under each page-specific label. The post-fix launch hit the account limit before model work and produced no report. | Learner-context media selection now prefers exact usable label/id matches and uses fuzzy matching only as fallback. Both `05.1a` and `05.1b` now assemble exactly the two _Leave Taking_ pages plus _Shameless_. Focused regression and the full 14-case extraction suite pass. | Older 2026-07-01 import has 23 published rows / 680 marks and no full-paper approval. Those legacy rows are not a post-fix current-model pass.                             | Fresh solvability over the corrected contexts, then strict D1 replacement import only if all 23 pass.                                                                                                  |
| `ocr-j351-01-qp-jun24` | 5 questions / 84 marks from 8 / 120; copyright drops are `02.0`, `03.0`, `04.0` (36 marks)                   | Extraction judge passed at 0.98 with no repairs; all 5 chains reused. The pre-fix solvability run passed 3 and failed `01.1b` and `01.1c` because the shared Text 1 bundle was repeated across cumulative prior context. No post-fix model verdict exists.                                                                                         | Exact copied support blocks are now shown once across cumulative subparts while distinct prompts, response controls, labels, and assets remain. Focused regressions and the full 14-case extraction suite pass.                                                                 | Older 2026-07-01 import has only 4 published rows / 44 marks (`01.1a`, `01.1b`, `01.1c`, `05.0`) and no full-paper approval. It is missing the current candidate's `06.0`. | Fresh solvability over contexts rebuilt by the fixed assembler, then strict D1 replacement import only if all 5 pass.                                                                                  |
| `ocr-j351-02-qp-jun24` | 2 questions / 80 marks from 7 / 120; copyright drops are `01.1a`, `01.1b`, `02.1`, `03.1`, `04.1` (40 marks) | The live current-model extraction summary passes deterministically for exact refs `05.1` and `06.1`; the latest outer production summary stopped before a usable independent-judge result. No current-model judge, chain, or solvability pass exists.                                                                                              | The exact publishable subset and original 7-question source snapshot are preserved; no manual relabelling or approval was applied.                                                                                                                                              | Older 2026-07-01 import has only one published 40-mark row, legacy ref `05.0`, and no full-paper approval.                                                                 | Reuse the exact extraction if its content-addressed gate accepts it; otherwise rerun that phase. Then run a fresh independent extraction judge, chains, solvability, and strict D1 replacement import. |

There are no `question_paper_sitting_reviews` rows for any of these three source documents. Their
existing July 1 question rows therefore must not be treated as full-paper approval or as evidence
that the current-model candidate passed its remaining gates.

## Preserved failure and phase evidence

### `ocr-j352-01-qp-jun24`

- live extraction-judge report:
  `c9716fbc09204c37d4b48c26f7690ccbf11e590c30327c5fb3ed71bb5a73d91e`
- live chain-reconciled paper:
  `c53ffbbeccd7111ec2b69d6a7d641acb0d30d2078d722fec7783b2ea05d0587e`
- live import-ready paper:
  `4b05f22a5fbf3a414171bf72931d9ac41971ef2ac9403b1acb613e9278b52be1`
- pre-fix failure archive:
  `tmp/current-model-paper-cohort/retry-runs/ocr-j352-01-qp-jun24/failed-solvability-media-crossmatch-20260717/`
- archived failed report:
  `6522d3416b2f8ac1afbbe79fdfae06dd9c6161de7b0221a95ede103d7ebc4caf`
- archived failed summary:
  `0badf7935dbfaf5bc33ee59ce6254a06f01704318288925ae26ea200e62d4fc7`
- latest cap-failed production summary:
  `47dec82574a26cc56fd34a806ad2794f13c82478c8c60c2f77996512df550f96`

### `ocr-j351-01-qp-jun24`

- live extraction-judge report:
  `4bbff68561bac7028ded4df45a24689cb3087f9e10f57eb4cc599042b24689fa`
- live chain-reconciled paper:
  `372e3c662b0b96e771cb8e497c42b102e329813db64b98d209b5232240f8556b`
- live import-ready paper:
  `4c54370fc0b786ff23ea9a0b1f65dfab85e636c8a33fc4d5e8aeb1ca18fdfbf9`
- pre-fix failure archive:
  `tmp/current-model-paper-cohort/retry-runs/ocr-j351-01-qp-jun24/failed-solvability-20260717T040016Z/`
- archived failed report:
  `bc63b07806bce613fb7337323a811801c03d55f1a2b8f6c09bcf4a191323b0d4`
- archived failed summary:
  `1fe3afa3fea4f094c6a12d9b3b54b2fee7dadcf4e84be5bf66862658ef0197b0`
- latest failed production summary:
  `9f1ae10e7da1dd9040f74e42da7c09a789b89474250a30b822dfc6e48eff11d6`

### `ocr-j351-02-qp-jun24`

- exact retained extraction (2 / 80):
  `53e17bc8104f9f1b187888936604feda58a0ecfa18f674a0bb865ad4114b461b`
- exact original normalized extraction (7 / 120):
  `b6027845019b6942b4ecd716eccea7a149f8ac0d35020f9614eddc85b863255d`
- live passed extraction summary:
  `7996f53c0835600f4ec26d46d803b77d5348606bd1bf04e5da16f35efbea26dc`
- latest outer production summary:
  `082bf35b403091f5970f3d590e72b5f7d65c9c7ef80d4be3d19360c2ca65dd21`

## Safe resume rules

1. The operator has confirmed a quota refresh. Use exactly one paper command as the live
   availability check; stop if the provider returns another limit response.
2. Run exactly one paper command at a time. Do not wrap these commands in a queue or retry loop.
3. Keep `--resume-passed-phases` and `--reuse-existing-extraction`. Do not add `--force` and do not
   manually edit or relabel a phase summary.
4. Keep `--cohort-lock=data/release/selective-paper-cohort-lock.json`. The pipeline must hash the
   exact question paper, mark scheme and support inputs against that lock before it may reuse or
   start any model phase. Cohort IDs also auto-load the canonical lock, stage verified read-only
   snapshots, preserve support-document identity, and revalidate each fresh phase output before its
   next consumer.
5. If a command fails, preserve its work directory unchanged and stop. Do not launch the next paper.
6. Treat a paper as imported only when the production summary is `passed`, the solvability report
   passes every retained question, `importReady.importMode` is `write`, and a fresh remote D1 query
   exactly matches the retained refs and marks.

Run from `/home/yaroslav_volovich/projects/question-constellation-release`.

### Resume `ocr-j352-01-qp-jun24`

```sh
node scripts/run-codex-production-import-pipeline.mjs \
  --question-paper=data/ocr-gcse-english-literature/question-papers/OCR-J352-01-QP-JUN24.PDF \
  --mark-scheme=data/ocr-gcse-english-literature/mark-schemes/OCR-J352-01-MS-JUN24.PDF \
  --source-document-id=ocr-j352-01-qp-jun24 \
  --cohort-lock=data/release/selective-paper-cohort-lock.json \
  --mark-scheme-document-id=ocr-j352-01-ms-jun24 \
  --work-root=tmp/current-model-paper-cohort/retry-runs/ocr-j352-01-qp-jun24 \
  --board=OCR \
  --qualification=GCSE \
  '--subject=English Literature' \
  '--subject-area=English Literature' \
  '--paper-label=Exploring modern and literary heritage texts' \
  --component-code=J352/01 \
  '--series=2024 - June series' \
  --year=2024 \
  '--question-paper-title=Question paper - Exploring modern and literary heritage texts' \
  '--mark-scheme-title=Mark scheme - Exploring modern and literary heritage texts' \
  --question-paper-url=https://www.ocr.org.uk/Images/727830-question-paper-exploring-modern-and-literary-heritage-texts.pdf \
  --mark-scheme-url=https://www.ocr.org.uk/Images/727832-mark-scheme-exploring-modern-and-literary-heritage-texts.pdf \
  --run-id=codex-production-batch-ocr-j352-01-qp-jun24 \
  --supporting-document=data/ocr-gcse-english-literature/examiner-reports/OCR-J352-01-ER-JUN24.PDF \
  --existing-chains=tmp/current-model-paper-cohort/retry-runs/existing-chain-contexts/english-literature.json \
  --allow-unpublishable-source-drops \
  --resume-passed-phases \
  --reuse-existing-extraction \
  --import \
  --skip-chain-illustrations
```

### Resume `ocr-j351-01-qp-jun24`

```sh
node scripts/run-codex-production-import-pipeline.mjs \
  --question-paper=data/ocr-gcse-english-language/question-papers/OCR-J351-01-QP-JUN24.PDF \
  --mark-scheme=data/ocr-gcse-english-language/mark-schemes/OCR-J351-01-MS-JUN24.PDF \
  --source-document-id=ocr-j351-01-qp-jun24 \
  --cohort-lock=data/release/selective-paper-cohort-lock.json \
  --mark-scheme-document-id=ocr-j351-01-ms-jun24 \
  --work-root=tmp/current-model-paper-cohort/retry-runs/ocr-j351-01-qp-jun24 \
  --board=OCR \
  --qualification=GCSE \
  '--subject=English Language' \
  '--subject-area=English Language' \
  '--paper-label=Communicating information and ideas' \
  --component-code=J351/01 \
  '--series=2024 - June series' \
  --year=2024 \
  '--question-paper-title=Question paper - Communicating information and ideas' \
  '--mark-scheme-title=Mark scheme - Communication information and ideas' \
  --question-paper-url=https://www.ocr.org.uk/Images/727556-question-paper-communicating-information-and-ideas.pdf \
  --mark-scheme-url=https://www.ocr.org.uk/Images/727658-mark-scheme-communication-information-and-ideas.pdf \
  --run-id=codex-production-batch-ocr-j351-01-qp-jun24 \
  --supporting-document=data/ocr-gcse-english-language/examiner-reports/OCR-J351-01-ER-JUN24.PDF \
  --supporting-document=data/ocr-gcse-english-language/supporting-documents/OCR-J351-01-INSERT-JUN24.PDF \
  --existing-chains=tmp/current-model-paper-cohort/retry-runs/existing-chain-contexts/english-language.json \
  --allow-unpublishable-source-drops \
  --resume-passed-phases \
  --reuse-existing-extraction \
  --import \
  --skip-chain-illustrations
```

### Resume `ocr-j351-02-qp-jun24`

```sh
node scripts/run-codex-production-import-pipeline.mjs \
  --question-paper=data/ocr-gcse-english-language/question-papers/OCR-J351-02-QP-JUN24.PDF \
  --mark-scheme=data/ocr-gcse-english-language/mark-schemes/OCR-J351-02-MS-JUN24.PDF \
  --source-document-id=ocr-j351-02-qp-jun24 \
  --cohort-lock=data/release/selective-paper-cohort-lock.json \
  --mark-scheme-document-id=ocr-j351-02-ms-jun24 \
  --work-root=tmp/current-model-paper-cohort/retry-runs/ocr-j351-02-qp-jun24 \
  --board=OCR \
  --qualification=GCSE \
  '--subject=English Language' \
  '--subject-area=English Language' \
  '--paper-label=Exploring effects and impact' \
  --component-code=J351/02 \
  '--series=2024 - June series' \
  --year=2024 \
  '--question-paper-title=Question paper - Exploring effects and impact' \
  '--mark-scheme-title=Mark scheme - Exploring effects and impact' \
  --question-paper-url=https://www.ocr.org.uk/Images/727558-question-paper-exploring-effects-and-impact.pdf \
  --mark-scheme-url=https://www.ocr.org.uk/Images/727659-mark-scheme-exploring-effects-and-impact.pdf \
  --run-id=codex-production-batch-ocr-j351-02-qp-jun24 \
  --supporting-document=data/ocr-gcse-english-language/examiner-reports/OCR-J351-02-ER-JUN24.PDF \
  --supporting-document=data/ocr-gcse-english-language/supporting-documents/OCR-J351-02-INSERT-JUN24.PDF \
  --existing-chains=tmp/current-model-paper-cohort/retry-runs/existing-chain-contexts/english-language.json \
  --allow-unpublishable-source-drops \
  --resume-passed-phases \
  --reuse-existing-extraction \
  --import \
  --skip-chain-illustrations
```
