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
