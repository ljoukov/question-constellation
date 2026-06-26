---
name: question-constellation-extraction
description: Import, repair, and independently verify Question Constellation GCSE question/answer-chain extraction data with golden checks, chain-quality audits, D1 import gates, and separate reviewer-thread feedback.
---

# Question Constellation Extraction

Use this skill when working in the `question-constellation` repo on exam-paper extraction, Physics
vision JSON, answer-chain repair, D1 imports, chain-quality audits, or independent reviewer-thread
verification.

## Source Of Truth

Before changing extraction behavior, read:

1. `AGENTS.md`
2. `docs/product-methodology.md`
3. `docs/product-flows.md`
4. `docs/extraction-spec.md`

The product object is a reusable answer chain. A chain is not a worked solution to one question.
Prompt-specific numeric values may appear in `modelAnswer`, `markChecklist`, `markSchemeItems`, and
`commonWeakAnswers`; they must not appear in reusable `answerChain` title, canonical text, summary,
or steps.

## Fast Acceptance Checks

Run these before any model extraction or import:

```sh
node scripts/test-answer-chain-golden.mjs
node scripts/audit-answer-chain-specificity.mjs --fail-on-blocking
```

The golden test is deterministic and should pass. The audit may fail when existing generated data
still needs repair; treat that as work to do before importing, not as a reason to weaken the audit.

## Extraction And Repair Commands

Extract Physics paper JSON from source PDFs:

```sh
pnpm run extract:physics-vision -- --paper=<source_document_id>
pnpm run extract:physics-vision -- --all
```

Repair missing or over-specific answer chains:

```sh
pnpm run repair:physics-vision-chains -- --paper=<source_document_id> --specificity
pnpm run repair:physics-vision-chains -- --all --specificity
```

Dry-run first when inspecting scope:

```sh
pnpm run repair:physics-vision-chains -- --all --specificity --dry-run
```

Import after the audit is clean:

```sh
pnpm run import:physics-vision -- --paper=<source_document_id> --dry-run
pnpm run import:physics-vision -- --paper=<source_document_id>
pnpm run import:physics-vision -- --all
```

Do not import around a failed specificity gate. Repair the JSON or hold the affected paper back.

## Golden Data Workflow

Golden fixtures live in:

```text
tests/golden/answer-chain-quality.json
```

Use them to lock down the chain-quality contract:

- Good generic calculation chains must pass.
- Worked one-question solution chains must fail.
- Numeric model answers and checklist evidence are allowed when the chain is generic.
- Known numeric recall facts may produce review warnings without blocking.

When a new failure mode appears, add a minimal golden case before changing the audit rule. The test
should explain whether the example is allowed, warning-only, or blocking.

## Independent Reviewer Thread

Use a separate Codex thread or sub-agent after extraction/repair and before import. The reviewer
must not be the same thread that generated the JSON.

Reviewer prompt:

```text
Use the question-constellation-extraction skill.

Review the generated answer-chain data only. Do not edit files.

Run:
node scripts/test-answer-chain-golden.mjs
node scripts/audit-answer-chain-specificity.mjs --json

Sample at least:
- 10 blocking findings, if any
- 10 warning findings, if any
- 10 passing calculation chains

For each sampled question, inspect the prompt, markSchemeItems, markChecklist, modelAnswer, and
answerChain in the JSON. Decide whether the answerChain is a reusable reasoning/method pattern or a
worked solution to that one question.

Report:
- sourceDocumentId
- sourceQuestionRef
- chainId
- accept / repair / uncertain
- exact fields that should change
- why

Do not import to D1 and do not edit files.
```

The main extraction thread should then apply repairs, rerun the golden test and audit, and only then
run the import.

## Review Standard

Accept an answer chain only if changing the numbers or context in the question would leave the chain
valid. For example:

Good:

```text
Convert the extension or compression into metres.
Substitute the known values into E_e = 1/2 ke^2.
Calculate the elastic potential energy and give the correct unit.
```

Bad:

```text
Substitute k=8500 and e=0.012.
Calculate E_e=0.612.
```

If in doubt, keep the exact worked values in `modelAnswer` or `markChecklist` and rewrite the chain
as the reusable method.

## Install This Skill Locally

From the repo root:

```sh
ln -sfn "$(pwd)/skills/question-constellation-extraction" \
  "$HOME/.codex/skills/question-constellation-extraction"
```

Start a new Codex thread and say:

```text
Use the question-constellation-extraction skill and import/verify the Physics files.
```

New threads should then load this `SKILL.md` before acting.
