# Chain Family Methodology

This document defines how to group exact answer chains into learner-facing chain
families. The purpose is to make transferable thinking visible without reducing
the product to topic lists.

The exact answer chain remains the primary learning object. A chain family is a
secondary organizing layer: it names a repeated method of thought that appears
across several exact chains.

## Object Model

Use this conceptual hierarchy:

```text
question
  -> exact answer chain
      -> chain family
```

A question is the concrete exam item, including prompt, required context,
assets, mark checklist, and model answer.

An exact answer chain is the ordered mark-scoring reasoning for that question
or a small set of questions. It should stay close enough to the mark scheme that
a weak answer can be repaired by adding missing links.

A chain family is a reusable thinking move that may contain several exact answer
chains. It should help a learner notice that different-looking questions are
asking them to use the same method of thought.

## What A Chain Family Is

A chain family is method-shaped. Its name should normally be an ordered phrase:

```text
input changes -> mechanism -> output changes
evidence/result -> inference -> conclusion
choose relationship -> rearrange -> calculate
error/control choice -> valid measurement
```

Good family names are verbs and links, not nouns:

- `change an input/property -> predict the output/effect`
- `trace a path through a system -> explain transfer, loss, or safety`
- `measurement choice/error/control -> valid result`
- `evidence/test result -> identify substance, component, or process`

Weak family names are usually topics:

- `Electricity`
- `Rates of reaction`
- `Inheritance`
- `Radioactivity`
- `Ecology`

Topic labels can be kept as metadata for filters, search, and audit. They must
not be the grouping rule.

## Required Properties

Each chain family must have:

- `id`: stable slug, such as `physics-family-change-input-effect`
- `name`: learner-facing method name
- `method_pattern`: short ordered pattern using `->`
- `description`: what reasoning habit the family trains
- `topic_coverage`: topic labels represented by member chains
- `chain_ids`: exact answer chains assigned to the family
- `fit_rationale`: why the member chains share a thinking move
- `review_status`: `draft`, `reviewed`, or `needs_review`
- `review_notes`: known doubts, merge candidates, or local-topic residue

Each exact answer chain should have:

- one primary chain family
- optional secondary family only when the chain genuinely trains two methods
- a short `why_fit` note
- a confidence score or review flag when the family assignment is uncertain

Do not allow family assignment to replace exact chain assignment. A learner
should still be able to open the exact chain and see the ordered links that earn
marks.

## Sizing Guidance

The useful number of visible chain families is much smaller than the number of
exact chains.

Target ranges:

- Per subject: 8-15 visible chain families.
- Internal review layer: up to 20-25 if needed.
- Exact answer chains: often 100-180 per full GCSE subject.

Do not force exactly 12-15 families. If the current data supports only 8-10
clean families, keep the taxonomy smaller. Add a new family only when it names a
new method of thought, not just a new topic.

A strong family normally has at least three exact chains. A one-chain or
two-chain family should be marked provisional unless it clearly represents a
method that will recur as more papers are processed.

## Cross-Topic Preference

Prefer families that cross topics within a subject. That is where the product
becomes distinctive: the learner sees the same thinking move reappear in
different content.

Use this review scale:

```text
strong: spans three or more topic areas and the method works independently of content
medium: spans two topic areas or has a very clear reusable method
local: mostly one topic, but still names a method rather than a topic
weak: mostly one topic and named like a topic
```

Local families are allowed when the method is genuinely specific, but they
should be reviewed later. Many local families can be dissolved into broader
method families after more chains are available.

## Grouping Rules

Group chains together when they share the same method of thought. Do not group
them only because they share:

- topic label
- specification section
- command word
- mark value
- formula name
- apparatus words
- exam year or paper
- text embedding similarity

The test is:

```text
Would the same missing thinking link explain a weak answer in these chains?
```

If yes, they probably belong in the same family. If no, keep them separate even
when the topic vocabulary is similar.

## Common Family Types

These method types are useful starting points, especially for science subjects:

- `choose relationship -> rearrange -> calculate`
- `read rate/gradient/area/time -> infer quantity`
- `recall/name rule, object, category, or relationship`
- `change input/property -> predict output/effect`
- `trace path through system -> explain transfer/loss/safety`
- `test/evidence/result -> identify or infer`
- `balance/conserve counted quantities before and after`
- `measurement/error/control choice -> valid result`
- `data pattern -> supported conclusion`
- `intervention/exposure -> biological or chemical outcome`
- `particle or structure feature -> macroscopic property`
- `condition or signal -> response -> restored function or symptom`
- `condition or resource -> rate/growth/population effect`
- `representation/equation/symbol -> complete or interpret correct form`

These are prompts for review, not fixed categories. The family should be named
from the chains in front of the reviewer.

## Recall And Calculation Chains

Pure recall chains and single-equation calculation chains are valid exact
chains, but they are not rich reasoning chains. They should usually be grouped
into method families that make their role clear:

- recall/name/identify
- choose relationship/rearrange/calculate
- read graph/table/calculate rate
- balance equation or conserve particles/charge/mass

Do not create a separate visible family for every formula. For example,
`V = IR`, `p = mv`, and `E = Pt` are different exact chains, but they may share
the family `choose relationship -> rearrange -> calculate`.

## Review Workflow

For each subject:

1. Load all active or draft exact answer chains.
2. Read chain id, title, canonical chain text, topic metadata, and support
   count.
3. Propose two or three alternative family taxonomies.
4. Choose the smallest taxonomy that remains method-shaped.
5. Assign every exact chain to one primary family.
6. Mark chains that feel topic-local, too thin, or forced.
7. Run three independent reviewer passes.
8. Consolidate reviewer disagreements into merge/split notes.
9. Update the methodology if the subject reveals a new recurring method type.

Independent reviewer prompt:

```text
You are reviewing answer-chain families for one GCSE science subject.

Your results will be judged on diversity of ideas, so be happy to propose
alternative groupings and challenge the existing taxonomy. Do not optimize for
agreement. Look for:

- families that are secretly just topics
- families that are too broad to teach a reusable thinking move
- families that are too specific and should merge into a method family
- exact chains assigned to the wrong family
- missing cross-topic thinking moves
- local-topic families that should be marked provisional

Return:

1. the best alternative family names
2. merge proposals
3. split proposals
4. chains whose assignment is questionable
5. any new methodology rule suggested by this subject
```

If parallel reviewers are available, run three per subject with this prompt and
compare disagreement explicitly. Diversity is useful; the final taxonomy should
not simply average the reviewers.

## Acceptance Checklist

Before accepting a subject taxonomy:

- Every active exact answer chain has a primary family.
- Family names are method-shaped and use ordered reasoning language.
- Broad topics appear only as metadata.
- The taxonomy has roughly 8-15 visible families unless there is a documented
  reason to go outside that range.
- Single-topic families are marked as local or provisional.
- Formula chains are not split into separate families merely because the
  formula differs.
- Recall chains are clearly labelled as recall/name/identify style.
- Practical and data chains are separated by thinking move, not by apparatus.
- Merge and split doubts are documented.
- Reviewers considered alternative taxonomies rather than only confirming the
  first draft.

## Failure Modes

Avoid these patterns:

- Topic list disguised as chain families.
- One family per exact chain.
- One giant generic family such as `science reasoning`.
- Mixing exact chains when the mark-scoring route differs.
- Hiding exact chains under broad families so learners cannot see the missing
  links.
- Treating a formula name as a family when the method is just calculation.
- Creating residual topic buckets for chains that were hard to classify.

When in doubt, preserve the exact chain and mark the family assignment for
review.

## Lessons From Initial Subject Drafts

The first Physics, Chemistry, and Biology drafts suggest these additional rules:

- Physics currently reads cleaner as fewer than 12 families. Do not inflate the
  taxonomy merely to hit a target count.
- Chemistry needs `particle/structure -> property` and
  `representation/equation/symbol -> complete or interpret` as explicit method
  families; otherwise bonding, equations, and state symbols become topic bins.
- Biology needs to separate `condition/signal -> body response` from
  `condition/resource -> rate/growth/population effect`; combining them creates
  an overbroad biology bucket.
- Subject taxonomies should keep one primary family per exact chain, while notes
  may record secondary fits for review.
