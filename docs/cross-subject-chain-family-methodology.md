# Cross-Subject Chain Family Methodology

This document defines how to create cross-subject chain families across Biology,
Chemistry, and Physics.

The approach that worked best was not a strict hierarchy. Cross-subject families
should be treated as overlay tags that reveal deep scientific thinking moves
across subjects. A cross-subject family may pull from several within-subject
families, and an exact chain may later carry more than one cross-subject tag.

## Why This Is Not A Strict Hierarchy

Within-subject families are already method-shaped, but they are still affected
by each subject's content.

For example:

- Physics has `pick the relationship -> rearrange -> calculate`.
- Chemistry has `amount relationship -> convert, scale, or calculate`.
- Biology has `quantitative relationship -> convert, compare, or calculate`.

These clearly share a cross-subject thinking move. But other cases are not
one-to-one. A Biology practical chain may belong to both:

- `measurement/error/control -> valid result`
- `change condition/input -> mechanism changes -> output changes`

So the cross-subject layer should be a graph of reusable thinking moves, not a
tree.

## Approach That Worked

Three approaches were considered:

1. Roll up within-subject families directly.
2. Force one strict hierarchy across subjects.
3. Identify deep scientific thinking moves across exact chains and subject
   families.

The third approach worked best.

Direct rollup was too shallow. It produced labels such as `calculation`,
`practical`, `data`, and `recall`, which are useful but not deep enough.

Strict hierarchy was too brittle. Many chains have legitimate secondary fits.
Forcing one parent hides useful transfer.

Deep thinking moves gave a small, stable set of cross-subject families that
students can recognize across very different content.

## Target Shape

Use this structure:

```text
question
  -> exact answer chain
      -> subject chain family
      -> cross-subject chain family tags
```

Subject families answer:

```text
What method is this chain using within this subject?
```

Cross-subject families answer:

```text
Where else in science does this same thinking move appear?
```

## Sizing Guidance

Aim for 12-15 cross-subject families across all three sciences.

Use fewer only if the result stays expressive. Use more only if a new family
names a genuinely different thinking move.

The current draft uses 13 families:

- 12 deep scientific thinking families
- 1 utility recall family

The recall family is needed for coverage, but should not be foregrounded as the
main product value.

## Selection Criteria

A cross-subject family should be accepted only if it satisfies most of these:

- It appears in at least two subjects.
- It can be phrased as an ordered thinking move.
- It pulls examples from different topics or domains.
- It explains a recurring weak-answer failure.
- It is more specific than `calculation`, `practical`, or `data`.
- It is broader than one formula, one apparatus, one disease, or one reaction.

Good names:

- `change condition/input -> mechanism changes -> output changes`
- `structure/arrangement -> property/function`
- `evidence/test/observation -> inference`
- `conserve/balance counted things -> complete outcome`

Weak names:

- `Physics equations`
- `Chemical tests`
- `Biology practicals`
- `Rates`
- `Energy`

## Cross-Subject Family Types

The current useful types are:

- Relationship and conversion calculation.
- Rate, time, gradient, fraction, and change.
- Input or condition changes causing output changes.
- Structure or arrangement causing property or function.
- Pathways and systems causing transfer, loss, safety, or effect.
- Evidence, tests, or observations supporting inference.
- Conservation, balancing, and counted-quantity reasoning.
- Representation mapped to real meaning.
- Measurement, error, control, and validity.
- Opposing processes, feedback, and balance.
- Energy availability or barrier controlling feasibility/rate.
- Exposure, selection, intervention, and risk/population outcomes.
- Cue-based exact recall.

## Assignment Policy

Each exact chain should have:

- one primary subject family
- zero or more cross-subject family tags

Prefer one primary cross-subject tag for product surfaces, but allow secondary
tags internally. Secondary tags are useful for transfer recommendations and
review.

Do not require every chain to have a deep cross-subject tag. Some exact recall
chains only belong in the recall utility family.

## Review Workflow

For each review pass:

1. Load the subject family drafts and active exact chain IDs.
2. Ignore topic labels at first.
3. Propose 12-15 cross-subject thinking moves.
4. Check whether each family has examples from at least two subjects.
5. Mark one-subject families as local and reject them unless they are expected
   to recur later.
6. Look for overbroad families that collapse into `calculation`, `data`, or
   `practical`.
7. Look for over-specific families that are just topics.
8. Record secondary fits instead of forcing a strict tree.

Independent reviewer prompt:

```text
You are reviewing cross-subject science chain families.

Your results will be judged on diversity of ideas, so be happy to challenge the
current taxonomy. Do not optimize for agreement. Look for deep scientific
thinking moves that cross Biology, Chemistry, and Physics.

Do not group by subject, topic, formula name, apparatus, or exam-paper wording.
Prefer families that explain a recurring weak-answer failure across subjects.

Return:

1. 12-15 candidate cross-subject families
2. families that are secretly just topics
3. families that are too broad to teach a method
4. families that are too specific and should merge
5. chains or subject families that should have multiple cross-subject tags
6. proposed name changes that make the thinking move clearer
```

## Acceptance Checklist

Before accepting a cross-subject taxonomy:

- The family set is small enough to be memorable.
- Each family is method-shaped and phrased as a thinking move.
- Most families pull examples from at least two subjects.
- Topic names appear only inside examples or metadata.
- The model allows secondary tags.
- Recall is labelled as a utility family, not a deep transfer family.
- Exact answer chains remain visible underneath family tags.
- The data file separates family definitions from examples and notes.

## Failure Modes

Avoid:

- A subject-first hierarchy.
- A topic atlas pretending to be a thinking taxonomy.
- One giant `calculation` or `practical skills` bucket without method detail.
- Strict parent assignment that hides legitimate secondary fits.
- Cross-subject families that are just syllabus headings.
- Treating recall chains as equally deep transfer examples.
