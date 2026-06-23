# Cluster Mechanism And Learning Loop

This note responds to the designer feedback that the generated/design-screen
clusters feel more meaningful than the clusters shown in the PDF report.

The issue is not mainly visual. The issue is whether a cluster is deep enough to
create the product loop:

```text
attempt question -> diagnose missing link -> repair answer -> practise transfer -> save Thinking Memory
```

If a cluster cannot support that loop, it may be a reasonable taxonomy but it is
not a useful learning object.

## Source Material

Raw steering conversations and attached designer images are stored locally in:

```text
data/steering/chatgpt-shared-cluster-conversations/
```

The useful materials are:

- `conversation-extraction.md`: extracted text from the shared ChatGPT links.
- `raw-extraction.json`: structured extracted turns and image metadata.
- `attached-designer-images/`: the four downloaded generated UI images.

The direct image URLs on the shared ChatGPT pages returned 403, so the attached
PNG files are the visual source of truth for those screens.

## Bottom Line

The designer feedback is real, but it points to a layer mismatch.

The PDF contains some strong exact answer chains. For example:

- `thermal conductivity -> rate of energy transfer -> useful/unwanted transfer`
- `different-sized atoms -> distorted layers -> layers slide less easily -> harder alloy`
- `condition change -> active site changes -> substrate no longer fits -> reaction slows or stops`
- `heat crude oil -> hydrocarbons vaporise -> temperature gradient -> fractions condense`

Those are good candidates because a weak answer can be repaired by adding the
same missing links.

The weaker feeling comes when those exact chains are lifted into broad families
such as:

```text
changed input/property -> mechanism changes -> physical effect changes
changed condition/input -> mechanism changes -> output changes
follow the path -> identify transfer/process/loss -> explain outcome
```

Those families are useful internally, but they are too abstract as the main
student-facing cluster. They do not reliably answer:

```text
What exact missing link did the student skip?
What one chain should they remember?
Which nearby question practises the same repair?
```

The designer screens feel better because they operate at a more product-useful
level:

```text
reduced blood flow -> less oxygen -> less aerobic respiration -> less energy -> symptom/effect
```

That is not just a topic cluster. It is a reusable causal move with a missing
middle. A student can fail it, repair it, transfer it, and save it.

## What The Shared Conversations Add

The shared conversations consistently steer the product away from "question
bank" and toward "thinking navigation".

The strongest ideas are:

1. The product is not an answer generator. It is a system for choosing and
   sequencing questions that reveal and repair thinking.
2. The valuable unit is a learning episode, not just a correct/incorrect answer:
   first attempt, missing step, hint, repair, transfer, and later recurrence.
3. Thinking Memory should store earned reusable patterns, not generic notes.
4. A pattern should unlock many GCSE questions. The designer repeatedly pushed
   on whether the hierarchy should be `subject -> thinking move -> question
   family`, not only `subject -> question family -> thinking move`.
5. Practice should give fresh questions using the same logic, not simply repeat
   the examples shown on the cluster page.

That is why the generated images feel compelling. They show:

- a named thinking chain,
- grouped question examples by transfer distance,
- "what stays the same",
- a saved Thinking Memory object,
- and a CTA to practise new questions using the same pattern.

## Extra Lens From The Pitch

The `constellations-pitch.pdf` artifact adds a useful framing from the
engineering version of the idea.

Its core claim is that AI tools can improve output while weakening the human
learning loop. The old learning middle was:

```text
read -> try -> fail -> debug -> rewrite -> remember
```

The pitch calls Constellations an apprenticeship layer: it captures real work,
detects the knowledge at risk, asks the user to rebuild the key idea, drills the
fragile skill, and saves the retained pattern.

For GCSE Question Constellation, the equivalent is:

```text
read question -> try answer -> miss a link -> repair chain -> try transfer -> remember
```

That reframes the cluster problem. A good cluster is not just a set of similar
questions. It is the apprenticeship loop for one reasoning move.

The cluster must identify:

- the knowledge or reasoning at risk,
- the rebuild prompt,
- the fluency drill,
- the transfer question,
- and the retained memory object.

For the blood-flow example:

- Knowledge at risk: oxygen is not the final explanation; it must connect to
  aerobic respiration and energy.
- Rebuild prompt: explain the chain from reduced delivery to symptom without
  looking at the model answer.
- Fluency drill: fill the missing middle link in a new circulation context.
- Transfer question: damaged alveoli or beta blockers change the surface story
  but preserve the same oxygen -> respiration -> energy chain.
- Retained memory object: "When delivery is reduced, link it to less oxygen,
  then less aerobic respiration, then less energy or a symptom."

This also gives the product a measurable standard: one week later, can the
student reconstruct the chain and apply it to a fresh question? If not, the
cluster did not create Thinking Memory.

## The Real Failure Mode

The product fails if "cluster" means any of these:

- questions on the same topic,
- questions with similar wording,
- questions under the same broad method family,
- questions whose answers can be summarized by a vague reasoning schema,
- or questions that are connected only after a teacher explains the connection.

The product works if "cluster" means:

```text
a small set of real exam questions where the same ordered missing links repair weak answers
```

The difference matters because the learning loop needs a stable repair object.

For example, this family is too broad for the learner:

```text
changed condition/input -> mechanism changes -> output changes
```

It can contain enzyme pH, chemistry collision rate, and gas pressure. Those are
all legitimate science explanations, but a student cannot save one concrete
answer chain that repairs all three. The mechanisms differ too much.

This chain is the right depth:

```text
pH/temperature condition changes -> enzyme active site changes -> substrate no longer fits -> reaction slows or stops
```

This chain is also the right depth:

```text
reduced delivery/gas exchange -> less oxygen reaches cells -> less aerobic respiration -> less energy or compensation
```

Both can support a common weak answer, a checklist, a transfer ladder, and a
Thinking Memory entry.

## Real Data Already Supports The Better Pattern

The strongest evidence is that the real semantic-chain data already contains a
chain close to the designer's generated example:

```text
bio-chain-delivery-oxygen-respiration-energy-symptom
```

Title:

```text
Delivery problem -> less oxygen reaches cells -> less aerobic respiration -> symptom or compensation
```

Canonical chain:

```text
reduced delivery or gas exchange -> less oxygen to cells -> less aerobic respiration -> less energy or compensating response
```

Supporting real questions include:

- Heart attack survivors get out of breath during gentle exercise.
- A leaking heart valve affects a person.
- Damaged alveoli cause faster breathing during exercise.
- Beta blockers can make people get out of breath during exercise.
- CHD can cause a heart attack.

The stored chain also has a useful exclusion rule:

```text
Heart structure, blood-vessel comparison, and statin/stent evaluation are excluded because they do not require the oxygen-to-respiration-to-symptom reasoning chain.
```

This is exactly the kind of boundary a learning cluster needs. It says not only
"what belongs" but also "what looks related but should not be grouped".

So the answer is not to abandon real-data clusters. The answer is to promote the
right real-data layer to the learner-facing product and demote broad families to
internal navigation.

## Proposed Object Model

Use four separate objects instead of asking one "cluster" object to do every
job.

```text
question
  -> exact answer chain
      -> learning cluster / thinking move
          -> internal chain family tags
```

### Question

The concrete exam item: prompt, source, figure, marks, metadata, mark scheme,
model answer, and learner attempts.

### Exact Answer Chain

The ordered scoring links for one question or a very tight set of questions.
This is mark-scheme grounded and should stay precise.

Example:

```text
Force A increases -> swimmer accelerates -> drag / Force B increases -> forces balance -> higher constant velocity
```

### Learning Cluster / Thinking Move

The learner-facing reusable object. It should normally contain 3 to 6 real
questions with the same missing-link repair.

Example:

```text
reduced delivery -> less oxygen -> less aerobic respiration -> less energy -> symptom/effect
```

This is what the learner can save into Thinking Memory.

### Internal Chain Family Tags

Broad method tags such as:

```text
trace path through system -> explain transfer/loss/effect
condition changes -> mechanism changes -> output changes
```

These are useful for taxonomy, search, audit, and recommendations. They should
not usually be the first thing a learner sees.

## Good Cluster Acceptance Test

A cluster is publishable only if it passes these checks.

### 1. Same Weak Answer Test

Can one common weak answer describe the usual failure?

Good:

```text
Mentions oxygen or chest pain but skips respiration and energy.
```

Weak:

```text
Needs more detail.
```

If the common weak answer cannot be specific, the cluster is probably too broad.

### 2. Same Repair Test

Can the same repair instruction improve answers across the cluster?

Good:

```text
Add the middle links: less oxygen -> less aerobic respiration -> less energy released.
```

Weak:

```text
Explain the mechanism better.
```

### 3. Transfer Ladder Test

The cluster should contain a clear progression:

```text
start -> near -> stretch -> exam transfer
```

Every step should preserve the same hidden chain while changing the surface
context.

### 4. Excluded Neighbor Test

The cluster must name nearby questions that are excluded and why.

This prevents broad topic drift. For the blood-flow chain, statin/stent
evaluation may be nearby Biology content, but it is not the same oxygen ->
respiration -> energy chain.

### 5. One Memory Sentence Test

The learner should be able to save the pattern in one sentence.

Good:

```text
When delivery is reduced, link it to less oxygen, then less aerobic respiration, then less energy or a symptom.
```

Weak:

```text
Think about biological systems and effects.
```

### 6. Mark-Scheme Evidence Test

Every link in the chain needs mark-scheme evidence from at least two member
questions, or the cluster must stay review-gated.

### 7. Practice Loop Test

The cluster should support this exact UI loop:

```text
try answer -> find included/missing links -> rewrite -> try a new transfer question -> save pattern
```

If the cluster cannot support link-level feedback, it is not ready for the
main product loop.

## What To Change In The Pipeline

Current risk:

```text
extract exact chains -> group into broad chain families -> show family as product cluster
```

Recommended pipeline:

```text
extract exact chains
-> identify same-missing-link clusters
-> generate learner-facing thinking move
-> assign transfer ladder
-> add excluded-neighbor boundaries
-> validate against mark-scheme evidence
-> publish as constellation / Thinking Memory candidate
-> keep broad families as internal tags
```

### Step 1: Keep Exact Chains

Do not weaken the exact chains. They are the mark-scheme anchor.

### Step 2: Add A "Learning Cluster" Pass

For each exact chain, ask:

```text
Which other real questions would be repaired by the same missing middle links?
```

This is stricter than embedding similarity and stricter than family assignment.

### Step 3: Generate The Learner-Facing Pattern

Use an LLM to translate the grounded chain into student language:

```text
use_when
common_weak_answer
memory_sentence
what_stays_the_same
near_misses
```

But require the LLM to stay inside the member-question evidence.

### Step 4: Validate With A Cluster Rubric

Score each candidate from 0 to 3 on:

- same weak answer,
- same repair instruction,
- evidence for each link,
- transfer distance,
- excluded-neighbor clarity,
- student-readable memory sentence.

Only publish clusters above a threshold. Everything else can remain internal.

### Step 5: Review Fewer, Better Clusters

Do not try to publish every generated chain. A better first product may have 20
excellent clusters than 200 shallow ones.

Teacher review should focus on:

- whether the chain is exam-faithful,
- whether the transfer questions really share the same scoring logic,
- whether the memory sentence is teachable,
- and whether excluded neighbors are correct.

## UX Implication

There is no single hierarchy that should win everywhere.

For public acquisition and SEO:

```text
subject -> concrete question -> answer chain -> constellation
```

That keeps the first experience exam-specific and recognizable.

For an in-app first-time training surface:

```text
subject -> thinking move -> question families
```

This matches the designer steering: one thinking move can unlock many GCSE
questions.

For Thinking Memory:

```text
subject filter -> saved thinking moves -> questions used -> next transfer
```

That means the current doctrine can stay: concrete questions first for public
entry. But the cluster mechanism should still produce pattern-first memory
objects.

## Example: Better Biology Cluster Card

Title:

```text
Blood flow and respiration
```

Thinking move:

```text
delivery problem -> less oxygen -> less aerobic respiration -> less energy -> symptom or compensation
```

Use when:

```text
A question asks what happens when blood flow, gas exchange, or oxygen delivery is reduced.
```

Common weak answer:

```text
Mentions blood flow, oxygen, or breathlessness but skips respiration and energy.
```

What stays the same:

- Follow the full causal chain.
- Link oxygen to aerobic respiration.
- Link cell energy change to the final symptom, damage, or compensation.

Start / near / stretch:

- `start`: heart attack survivors get out of breath easily.
- `near`: CHD can cause a heart attack.
- `near`: leaking heart valve affects oxygenated blood delivery.
- `stretch`: alveoli damage causes faster breathing during exercise.
- `stretch`: beta blockers reduce cardiac output during exercise.

Near misses:

- Heart structure recall.
- Blood-vessel comparison.
- Statin/stent treatment evaluation.

Those may be Biology circulation questions, but they do not train this exact
oxygen -> respiration -> energy chain.

## Example: Better Physics Cluster Card

Title:

```text
Drag, resultant force, and terminal motion
```

Thinking move:

```text
driving force/weight changes -> resistive force changes -> resultant force changes -> forces balance -> constant or terminal velocity
```

Common weak answer:

```text
Mentions drag or terminal velocity but skips the resultant-force link.
```

Why this works:

The swimmer, aeroplane, stone, and parachute questions look different, but the
repair is the same: do not jump from drag to constant speed. Explain how the
resistive force changes the resultant force first.

This is the level of depth the cluster needs.

## Recommendation

Adopt this rule:

```text
The learner-facing cluster is not the broad chain family. It is the smallest reusable chain that can repair the same missing links across several real questions.
```

Then update the generation/review process so that every publishable cluster has:

- exact chain text,
- common weak answer,
- link-level feedback checklist,
- transfer ladder,
- excluded near misses,
- memory sentence,
- and source evidence for each link.

Broad families should remain useful, but mostly as internal tags. The product
value comes from small, memorable, evidence-backed thinking moves that students
can earn and reuse.
