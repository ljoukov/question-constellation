# Challenge authoring and solvability

Challenges are reviewed views over GCSE science knowledge and exam-marking moves. They are not a
free-standing generated quiz bank. Read `docs/subject-content-workflow.md`,
`docs/product-methodology.md`, and `docs/product-flows.md` before changing the catalogue.

## Content contract

Each challenge contains two complete contexts:

1. a showdown, diagnosis, and smallest-sufficient improvement for the opening question; and
2. a different-context transfer task that uses the same scoring move.

Both contexts must be answerable from what the learner can actually see. Keep numbers, conditions,
units, and comparison directions in the prompt. Do not refer to a diagram, graph, image, figure,
photograph, table, or drawing that the stage does not render. Do not ask the learner to draw, sketch,
plot, shade, or label because the challenge renderer has no drawing canvas.

The deterministic gate in `src/lib/challenges/contentValidation.test.ts` rejects unseen visual
references and unsupported drawing tasks.

## Rare visual-dependent transfers

Use a visual only when reading the visual is itself the assessed skill and a text equivalent would
change the task. In that case:

1. Write a challenge-illustration spec following `docs/challenge-illustrations/README.md`. Treat the
   transfer prompt as a teaser: list allowed evidence and forbid answer leakage.
2. Run `pnpm generate:challenge-illustration -- generate --spec=<spec>`.
3. Accept only a dark/light pair that passes the image, theme, mobile-crop, and usage judges.
4. Publish both files under `static/product/challenges/` and wire the pair to the challenge's
   `transferArt` definition with useful alt text and intrinsic dimensions.
5. Inspect the actual transfer stage at desktop and phone widths. The prose and alt text must still
   identify the task without relying on colour alone.

Adding decorative card art does not satisfy a visual-dependent transfer. The transfer stage renders
only `transferArt`.

## Curriculum grounding

Every published challenge id must resolve to one exact reviewed entry in
`src/lib/server/challengeCurriculum.ts`. Reuse an existing reference only when the new challenge tests
the same specification statement. A new topic needs its own exact specification code, section,
official deep link, expected heading, and source text. Never add a subject-wide fallback.

Keep internal paper ids optional. If a challenge cites imported question ids, both ids must already
belong to the same reviewed answer-chain family. Hand-authored contexts without those ids still need
the exact curriculum reference and all deterministic catalogue checks.

## Quality checks

Before browser review, run:

```sh
pnpm run test:challenges
pnpm run check
pnpm run build
```

The challenge tests enforce unique routes, complete stages, one correct choice per stage, plausible
choice-length balance, balanced showdown answers, curriculum coverage, artwork pairs, and transfer
solvability. Then play representative starter, standard, and stretch rounds for every changed subject
on desktop and a narrow phone viewport. Complete and deliberately miss every stage, verify feedback,
restart a round, and confirm that no prompt depends on content outside the rendered frame.
