# Product Journey Research Plan

Status: working draft for product research. This document does not authorize a UI rebuild, data
migration, new chain extraction, generated-question work, or deployment.

## Purpose

The immediate job is not to turn every idea into a screen. It is to discover a coherent student
journey and establish which decisions can be made from evidence, which require product taste, and
which require observation with GCSE students.

The current app is useful as an inventory of capabilities and failure modes. It is not the visual or
navigational baseline for the next product pass.

## Direction That Is Already Clear

- Start with GCSE, initially using subjects and exam routes we can validate well. Preserve a path to
  A level later without designing the first experience around it.
- Support both sustained preparation over a school year and short, immediate uses such as checking
  one answer or preparing close to an exam.
- Keep public entry concrete: a real, recognizable exam question should still be a strong discovery
  route.
- Make the returning experience action-first. Show a small, interesting, personalized question stream
  or one obvious next action rather than a dense control surface.
- Treat curiosity as an asset. A question can be the invitation; the interface does not need to
  explain the product before the student acts.
- Ground scope and correctness in the official exam-board specification, papers, mark schemes, and
  attributable examiner reports.
- Treat school materials as evidence of what has been taught, not as the authority for what is true or
  examinable.
- Keep `not yet covered` separate from weak performance. It must never count against the student.
- Preserve authentic past papers as scarce assessment assets. Routine practice should not silently
  consume questions from a paper the student intends to take under mock conditions.
- Show progress at two depths: a simple high-level view and an inspectable curriculum/evidence view.
  Progress must remain secondary to an obvious action.
- Any grade estimate must state its assessed scope, evidence strength, assistance level, and
  uncertainty. A narrow set of practice questions cannot support an unqualified whole-course grade.
- Keep runtime model use purposeful and visible at the moment it adds value. Curated content and
  deterministic product structure should carry as much of the experience as possible.
- Use `close the gap` as the canonical phrase. Student-facing copy should prefer plain action words
  such as `try`, `explore`, `practise`, `improve`, `continue`, and `method`.

## Promising Interaction Kernels

These are worth preserving as hypotheses and validating independently of the existing navigation:

1. **One paper-like question**
   - The question, source, diagram, marks, and response control feel like the real exam.
   - The student attempts it before seeing a model answer.
   - Checking explains exactly which mark-scoring links are present or absent.

2. **Recall cards, multiple choice, and true/false**
   - Support recognition, initial gap closing, and later retrieval.
   - Reveal a short explanation after commitment.
   - Let the student choose a plain two-way response such as `Review again` or `Had it`.
   - Later evidence can override self-report and resurface the same knowledge in a related form.

3. **Guided answer builder**
   - Break a difficult response into short, direct reasoning questions.
   - Give inline question-form guidance without immediately supplying the answer.
   - Show a compact method, then require a fresh complete response.
   - Use it in two distinct journeys:
     - on-demand help with the current question;
     - closing a gap identified from earlier evidence.

4. **Curriculum-specific reasoning chains**
   - The smallest reusable ordered method connecting a recognizable question cue to a mark-scoring
     conclusion across several surface-different questions.
   - Facts are inputs; the links express what to infer or do next.
   - A useful chain is specific, non-obvious for the target student, source-supported, transferable,
     and bounded by clear near-misses.

5. **English guided practice**
   - Preserve the current English Language concept as an on-demand answer-building hypothesis.
   - Treat the current English Literature implementation as separate and unvalidated.
   - Do not assume that one English sequence fits every paper, task shape, or subject.

## Existing Assets Worth Keeping

The next product pass should reuse capabilities, not inherit the current high-level UI:

- anonymous profile and answer persistence, followed by optional signed-in sync;
- answer drafts that survive sign-in, reconnection, navigation, and device interruption;
- exact board, course, tier, paper, series, question reference, and source links;
- OCR English Literature text selection as a precedent for school-specific taught scope;
- recall scheduling, due-first ordering, reverse recall, and short stack sizes;
- source-paper archives and the experimental renderer for tables, diagrams, equations, matching,
  labels, drawing, and other authentic response controls;
- question-level and link-level attempt evidence already stored in the personal database;
- transfer-distance labels and explicit near-miss boundaries;
- global journey analytics and model-call evidence, subject to the privacy work below.

The existing signed-in home, browse taxonomy, card-selection screens, static chain lists, and unused
confidence formula are not product foundations. They can be replaced.

## Foundations Missing From The Current Product

### A trustworthy test corpus

UX testing is invalid if the questions are malformed or the answers are untrustworthy. The live bank
currently contains examples of coarse topic mapping, wrong response shapes, weak model answers, OCR
debris, singleton chains, and trivial chains. Before testing broad navigation, create a small golden
set whose prompts, figures, controls, mark schemes, model answers, and source provenance have been
checked by a person.

### A canonical curriculum graph

The product needs versioned, leaf-level official specification statements with board, qualification,
course, tier, component, assessment objective, required practical, maths requirement, effective date,
and source provenance where applicable. Existing broad topic constants and cached PDFs are useful
inputs but are not yet this canonical layer.

### A structured evidence ledger

The student model should be derived from observations, not stored primarily as an editable model-written
story. Each observation needs:

- the exact question and curriculum/reasoning links;
- response and score;
- independent, hinted, guided, or answer-exposed status;
- attempt number and prior exposure;
- active time, time to first response, time before help, and retry time;
- grader, rubric, model, and content versions;
- uncertainty and any student challenge to the result.

A readable student summary can be generated from this ledger. It must remain possible to inspect why
the product believes something.

### Evidence states rather than a binary label

One miss is a hypothesis. Useful internal states include:

```text
not yet covered
not assessed
suspected gap
confirmed gap
successful with support
independent success
independent transfer
retained after delay
uncertain or contested
```

The exact student-facing wording needs testing. Recognition, a guided rewrite, an unseen question, a
timed question, and a delayed transfer attempt must not contribute equal evidence.

### A grade-estimate contract

Do not revive the current heuristic confidence percentage. A defensible estimate requires qualification
blueprint coverage, question difficulty and shape, assessment-objective balance, assistance exposure,
timing conditions, grader error, historical boundary variation, and a minimum evidence threshold.

At minimum, separate:

- demonstrated performance on covered scope;
- a cautiously modelled whole-course range, when evidence permits it;
- curriculum coverage and evidence confidence.

### Trust recovery

Every assessed item needs `Report a problem` or `This mark looks wrong`. A challenged result should not
silently change the student model. Source derivation must distinguish official wording, human-curated
material, and model-derived material. Examiner-report observations must be attributable to the exact
source.

### Access, privacy, and safeguarding

The target population includes minors. Before a longitudinal pilot, define age-appropriate consent,
data minimization, retention, deletion, parent/student expectations, and use of raw answers and model
traces. Timing must account for extra-time arrangements, rest breaks, dyslexia, assistive technology,
and other access needs. Copy and paste deterrents must not make the core experience unusable for
students who require accessibility support.

### Completion and return

Every session needs a meaningful ending: what was attempted, what changed, what remains uncertain, and
one optional next action. Current science, English, and constellation flows have places where work ends
without proof, loops back to the beginning, or provides no next action.

### Public value and the identity boundary

A student should not spend time writing an answer and only then discover that checking requires an
account. The public experience should complete one useful cycle before sign-in, potentially through a
static checklist when a model check is unavailable. Sign-in should add longitudinal evidence, sync,
personalized selection, and model-backed checking rather than retroactively withholding the first
result. Any boundary must be visible before the student commits substantial work.

### Response modes

Do not reduce every exam item to a generic textarea. Preserve source-faithful multiple choice, tables,
equation blanks, matching, diagrams, drawing, labels, calculations, and long-form responses. Research
handwriting or photo submission separately because it changes evidence quality, marking reliability,
and exam-mode behavior.

## Research Method

### What Codex can do independently

- audit source material, routes, schemas, and content quality;
- create the requirement and decision ledger;
- construct several coherent journey alternatives;
- build disposable prototypes with realistic content and state;
- instrument prototypes and summarize observed behavior;
- derive candidate curriculum mappings and reasoning chains for human review;
- identify contradictions, edge cases, and implementation consequences;
- recommend a direction after each study.

### Where product judgment is required

The product owner should decide among concrete, evidence-backed alternatives rather than approve every
small implementation choice. Human judgment is especially important for:

- which question feels worth opening;
- whether a screen feels calm, obvious, and credible;
- visual hierarchy, density, tone, and transitions;
- whether progress motivates or judges;
- how much explanation is enough;
- whether a conversational control layer feels powerful or intrusive;
- which trade-off best expresses the product's identity.

### What must be observed with students

Do not rely on preference interviews alone. Give students tasks, watch the first click, and note where
they pause, read, leave, ask for help, or distrust the content. Include at least:

- Year 10 students with substantial not-yet-covered scope;
- Year 11 students preparing over several months;
- a short-notice revision use case;
- an authentic full-paper use case;
- mixed current attainment and access needs.

For each prototype, ask what the student thinks will happen before they click. Measure time to first
meaningful action, successful completion, voluntary continuation, help use, and later independent
performance. Do not optimize only for clicks or immediate correctness.

### What needs subject and assessment expertise

- specification applicability and exclusions;
- mark-scheme interpretation and acceptable alternatives;
- reasoning-chain membership and transfer distance;
- grade-range methodology and calibration;
- full-paper validity and authentic timing;
- whether generated or adapted items match the intended standard.

## Recommended Research Order

### Phase 0: Build a trustworthy research kit

Goal: prevent content defects from contaminating every UX finding.

Work:

- select one primary route, recommended as AQA Combined Science Higher;
- add a small English Language set for subject-specific comparison;
- human-check roughly 30 to 50 varied questions and their complete answer packages;
- include recall, calculations, diagrams, four-to-six-mark explanations, and transfer pairs;
- mark authentic, adapted, and model-derived content explicitly;
- write the requirement ledger from this conversation and current-app audit.

Human gate:

- approve the golden content set and correct any misunderstood requirements;
- reject any example that would damage trust if shown to a student.

### Phase 1: Validate the interaction kernels

Goal: establish which parts really work before designing the system around them.

Test separately:

- one independent paper-like question and transparent check;
- flashcard, multiple-choice, reverse, and true/false interactions;
- the science guided answer builder;
- on-demand English Language guidance;
- the gap-closing version of guided practice;
- a reasoning chain followed by a fresh transfer question.
- the first public cycle and its sign-in boundary;
- representative structured controls rather than only typed paragraphs.

Critical evidence:

- Does the student know what to do without reading instructions?
- Does guidance improve a fresh complete response rather than only the current field?
- Can the student apply the method to a different question without support?
- Which words and visual cues feel credible or irritating?

Human gate:

- the product owner watches at least two sessions or recordings;
- keep, revise, or discard each kernel independently.

### Phase 2: Find the returning entry experience

Goal: solve `What should I do now?` without creating a control-heavy home screen.

Prototype with realistic history, but no production personalization backend:

1. one recommended question with a short peek at what follows;
2. a compact personalized stream of intriguing questions;
3. a short text instruction that configures scope and produces a question stream;
4. a minimal subject entry with one `Continue` action and optional detail.

Every candidate should support quick actions such as:

```text
another like this
harder
different topic
not covered yet
why this question?
```

Curriculum browsing remains a utility and escape hatch, not the default returning route.

Human gate:

- choose the primary interaction from observed behavior and product taste;
- explicitly decide what is visible before the first click and what stays behind detail.

### Phase 3: Define scope, evidence, and recommendation semantics

Goal: make personalization trustworthy before building progress UI.

Work:

- validate one complete qualification blueprint with teachers;
- define taught-scope selection and material-to-specification mapping;
- define evidence tiers, gap states, recurrence, transfer, and delayed retention;
- define the question-selection objective and diversity rules;
- define when the product abstains because evidence is insufficient;
- define the grade-range policy and calibration study.

The selection policy should balance exam value, student scope, evidence gain, due recall, reasoning
transfer, difficulty, novelty, and question appeal. It should avoid a repetitive stream optimized only
for predicted weakness.

Human gate:

- subject experts review applicability and exclusion decisions;
- assessment expertise approves the evidence and grade policy;
- no grade estimate ships before held-out human-marked responses and whole papers meet agreed
  calibration thresholds.

### Phase 4: Design progress as a drill-down from action

Goal: give both reassurance and detail without making progress the obstacle to practice.

High-level view:

- one next action;
- covered-scope performance and evidence strength;
- grade range only when justified;
- due recall or a gap worth closing;
- authentic-paper readiness and reserved-paper status.

Detailed view:

- official curriculum tree with `not yet covered`, unassessed, uncertain, developing, and strong
  evidence states;
- knowledge, reasoning/method, assessment-objective, and timing evidence;
- last independent proof and assistance history;
- exact questions supporting each claim;
- student controls to correct taught scope or challenge an assessment.

Human gate:

- Year 10 students must not interpret untaught scope as failure;
- students and parents must not interpret an uncertain range as a guaranteed grade;
- guided success must never look identical to independent success.

### Phase 5: Define authentic paper mode

Goal: preserve real papers while supporting credible exam-condition evidence.

Research:

- paper states: untouched/reserved, partly exposed, timed attempt, untimed attempt, marked, and answers
  revealed;
- exclusion of reserved-paper questions from ordinary recommendations;
- exact paper layout, timing, breaks, access arrangements, autosave, and recovery;
- full-paper grading, boundary provenance, and component-versus-qualification claims;
- copy/paste/text-selection deterrents and an experimental AI-facing screenshot cue;
- how generated/adapted practice is labelled and kept distinct from authentic papers.

Human gate:

- a reserved paper cannot be accidentally consumed through recommendations or source links;
- a student can distinguish authentic, adapted, and generated material at a glance;
- exam-mode timing and controls are tested with applicable access arrangements.

### Phase 6: Test a conversational control layer

Goal: discover where natural language meaningfully reduces configuration effort.

First define shared product actions such as:

```text
set exam route
set covered scope
set current focus
start a timed or untimed session
choose practice format
show progress evidence
reserve or start a paper
open the next recommended question
```

Both the ordinary UI and any conversational surface should call the same actions and update the same
state. Test natural-language configuration for complex intentions, for example:

```text
We have finished cell biology and bioenergetics but not ecology. Give me ten minutes on things I am
shaky on, with no Paper 2 questions.
```

The product should show its structured interpretation before acting when the request changes scope,
evidence, or paper state. Keep obvious frequent actions clickable.

Human gate:

- compare task time, correction rate, confidence, and preference against a well-designed clickable
  alternative;
- proceed only where conversation is materially better, not merely novel.

### Phase 7: Run the stronger semantic content pass as a parallel workstream

Goal: replace legacy chain hypotheses without blocking early UX research.

After the reasoning-chain rubric and golden set exist:

- audit source extraction and selectively redo unreliable paper items;
- derive reasoning chains again from original questions, mark schemes, examiner reports, and official
  specification evidence;
- separate recall, exact answer paths, reusable methods, and broad internal families;
- reconcile across papers and validate on held-out questions and near-misses;
- review student-facing wording with students and subject experts.

Question generation, especially diagram generation, remains a separate development thread.

### Phase 8: Run a longitudinal pilot

Goal: test the actual year-long promise rather than only immediate usability.

Run at least a half-term pilot after the core loop, evidence model, and privacy controls are credible.
Measure:

- return behavior and voluntary continuation;
- gap recurrence and delayed retention;
- independent transfer after guided work;
- curriculum coverage without penalizing not-yet-covered content;
- grade-range calibration against later authentic-paper results;
- whether recommendations become more useful with evidence;
- trust failures and challenged marks;
- value for Year 10, Year 11, and short-notice use.

Human gate:

- review session recordings and contested cases, not only aggregate analytics;
- decide whether the product has earned the right to broaden subjects, automate more selection, or
  make stronger progress claims.

## Journeys To Cover In The Later Flow Document

The final flow should not be one universal path. It must cover at least:

1. public question discovery without sign-in;
2. first successful answer check;
3. returning five-to-ten-minute session;
4. Year 10 selecting covered and not-yet-covered scope;
5. choosing a specific focus without browsing the whole bank;
6. on-demand help with one difficult question;
7. closing a gap after a graded attempt;
8. reasoning-chain transfer to a new context;
9. recall due after time has passed;
10. English Language guided practice;
11. authentic full-paper reservation, attempt, marking, and debrief;
12. short-notice revision;
13. school-material upload mapped to official scope;
14. progress and grade-evidence inspection;
15. challenging an incorrect question or mark;
16. optional natural-language control of the same journeys.

## Decision Cadence

At each phase, Codex should present:

- the evidence observed;
- two or three coherent alternatives, not a bag of components;
- a recommended direction and its trade-offs;
- a small realistic prototype;
- the exact human decision required;
- what remains reversible.

The product owner should not be asked to compensate for weak synthesis by reviewing every button.
Human taste should be concentrated at the moments where identity, hierarchy, tone, and emotional
response are genuinely at stake.

## Recommended Immediate Next Step

Do not redesign the complete app yet. First build Phase 0's golden research kit and requirement ledger,
then run a small set of observation sessions on the promising interaction kernels. In parallel, create
the four disposable returning-entry prototypes from Phase 2 using fake but realistic student history.

The first product-taste checkpoint should compare those entry prototypes alongside recordings of
students using the interaction kernels. That gives the product owner something concrete to judge while
keeping foundational architecture and content work evidence-led.
