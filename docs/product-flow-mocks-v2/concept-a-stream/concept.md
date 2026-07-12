# Concept A — The finite question stream

## Product thesis

Question Constellation should open like a very good content feed: the next worthwhile thing is already
there, its relevance is immediately obvious, and the student can act without configuring a session.
The crucial difference is that this stream has an honest boundary and an exam purpose.

The signed-in home is a short **question trail**: normally four items, explicitly labelled with the
estimated time and the point at which it ends. The question itself is the visual hero. Personalisation
orders a curated bank; it does not generate an infinite supply of novelty. Every item states its board,
course, tier, paper, source reference, marks, and whether it is authentic, adapted, or generated.

For Maya, the initial contract is:

> **4 questions · about 10 minutes · ends after 4**<br>
> Biology · only topics covered at school · reserved 2024 paper excluded

This makes the product as easy to start as a feed while avoiding streaks, points, random rewards,
countdown pressure, or bottomless scrolling. The stream is a route into the existing question → method
→ constellation → practice loop, not a replacement for it.

## Core product idea

### A finite, editorial queue

- One dominant item is shown at a time, with a restrained glimpse of the next item below it.
- The current position and endpoint remain visible: `1 of 4 · Ends after 4`.
- Completing, skipping, or replacing an item only changes the unattempted remainder of the queue.
- Reaching the end produces a quiet evidence summary and a real stopping point. Starting another trail
  is a deliberate secondary action.
- The default queue stays within one subject. A subject change begins a new trail rather than mixing
  unrelated subjects into the current one.

### Personalisation that can be inspected

The queue is assembled from four understandable inputs:

1. Maya's exam route: AQA GCSE Combined Science, Higher.
2. Her taught scope: Cell Biology, Organisation, Infection and Response, and Bioenergetics.
3. Her evidence: 14 checked questions and a recurring missing oxygen → respiration → energy link.
4. Her current intent: about ten minutes, with the 2024 paper kept as a fresh mock.

`Why this?` exposes those inputs in one sentence. It never claims certainty. For the opening question it
says:

> You usually know the facts. This checks whether you connect oxygen, aerobic respiration and energy in
> a longer explanation. Your reserved 2024 paper is not used.

Most value comes from curated prompts, static answer chains, model answers, mark checklists and common
weak answers. A runtime model is used only after the explicit `Check answer` action when available; the
static checklist remains a complete fallback.

## Visual and interaction language

- **Canvas:** warm paper white with a very quiet cream wash; no glassmorphism or decorative space art.
- **Ink:** deep blue-black for interface copy and near-black for exam-paper content.
- **Accent:** British racing green for primary actions and trustworthy evidence; muted amber only for a
  missing link or warning; cool blue for neutral source and scope information.
- **Typography:** a clear humanist sans serif for the product shell; an Arial-like exam face inside
  paper panels. Questions use the largest type on every screen.
- **Shapes:** modest 8–12px corners on product controls; square, ruled paper sheets for authentic exam
  material. Hairline borders do more work than shadows.
- **Motion:** a short vertical replacement when an item changes and a simple progress update. No card
  flinging, slot-machine motion, confetti, or celebratory particles.
- **Desktop:** a focused 720–820px stream with a narrow contextual rail for scope and evidence.
- **Mobile:** the same content order in one column. Controls wrap below the primary action; the endpoint
  stays in the sticky header. There is no separate mobile game metaphor.

## Complete primary journey

### 1. Signed-in home — `/`

The header contains the Question Constellation wordmark, search, and quiet links to `Recall`, `Progress`
and `Papers`. There is no feature grid.

The page opens with:

> **Maya, here are four worth trying.**<br>
> Biology · what you've covered · about 10 minutes

A compact status line says `1 of 4 · Ends after 4`. The first large card is:

- `AUTHENTIC QUESTION`
- `AQA · GCSE Combined Science · Higher · Biology Paper 1`
- `November 2021 · Q05.5 · 4 marks`
- `Explain why heart attack survivors get out of breath easily when they exercise gently.`
- Primary action: `Try question`
- Secondary controls: `Another like this`, `Harder`, `Different topic`, `Not covered yet`, `Why this?`

The next card peeks below the fold rather than competing at equal weight. It is the authentic three-mark
tobacco mosaic virus question from November 2021. A small `7 recall due` link is useful but does not
become a rival dashboard tile.

The opening question is selected because Organisation is covered and because it tests Maya's known
explanation gap. The card does not expose the answer chain before she acts.

### 2. Question destination — `/questions/8464b1h-nov21-05-5/practice`

The page becomes restrained and paper-like. A slim product header keeps `1 of 4 · about 8 min left`
visible, but the body resembles a clean exam page:

- source label `Authentic · AQA 8464/B/1H · November 2021 · Q05.5`;
- question number and `[4 marks]` aligned like a paper;
- the full prompt in large black type;
- a generous ruled answer area;
- primary action `Check answer`;
- secondary action `Use mark checklist`;
- a collapsed `Method hidden until you try` disclosure.

Drafts persist if Maya goes back. Opening the checklist is an explicit choice and never reveals the model
answer automatically.

### 3. Checked answer and method reveal — `/questions/8464b1h-nov21-05-5/chain`

The result leads with evidence, not a conversational verdict:

> **3 of 4 links found**<br>
> Close the gap: connect less oxygen to less aerobic respiration.

The student's exact phrases are highlighted against a static mark checklist. Present links use green;
the single missing bridge uses amber. The reusable method is now earned and shown as a compact chain:

> reduced delivery → less oxygen → less aerobic respiration → less energy → symptom or compensation

The method is labelled `Method`, not a branded thinking pattern. A short note explains its value:

> The context can change. The mark-scoring bridge stays the same.

Primary action: `Improve this answer`. `Show model answer` remains secondary. Transfer is previewed as
the next step but cannot start until the improved complete answer passes recheck.

### 4. Dynamic continuation and transfer

After the improved answer passes recheck, the transfer step opens a genuinely different,
non-reserved authentic question from the same constellation:

- `STRETCH · AUTHENTIC QUESTION · NON-RESERVED`
- `AQA · GCSE Combined Science · Higher · Biology Paper 1`
- `June 2019 · Q01.5 · 6 marks`
- `Some people who take beta blockers get out of breath when they exercise.`
- `Explain why beta blockers can have this effect during exercise.`

The method is collapsed to a one-line reminder rather than pre-filling the answer. The endpoint reads
`2 of 4 · Ends after 4 · about 5 min left`.

Below the question, the same continuation controls remain available:

- `Another like this` replaces the next unattempted item with a near question.
- `Harder` replaces it with a stretch or exam-transfer item.
- `Different topic` stays inside Biology and taught scope.
- `Not covered yet` removes the question without affecting evidence and opens the compact scope sheet.
- `Why this?` shows the relationship to the previous attempt and source-reservation status.

The controls operate the same queue as the optional natural-language field. They are not prompts to a
separate tutor.

### 5. Trail end

After item four, the stream stops on a quiet summary:

> **Trail complete**<br>
> 3 checked · 1 recall item reviewed · respiration gap closed once

`Done for now` is the primary action. `Another 5 minutes` is secondary and creates a new bounded trail.
No streak, score, league position, animation, or guilt copy appears.

## Subject and focus continuation

The active focus is always readable in one line: `Biology · covered topics · 10 min · fresh mock safe`.
Tapping it opens a bottom sheet on mobile or a popover on desktop. The sheet changes only the remainder
of the current trail and offers at most three top-level choices:

- subject;
- time (`5 min`, `10 min`, `15 min`);
- taught scope.

Difficulty and similarity are handled by the contextual controls on each question, not by a permanent
configuration panel. A changed setting produces a plain confirmation such as `Next 2 questions changed`.

## Recall launch — `/recall`

Recall starts with a recommendation rather than a filter form:

> **7 Biology recalls are due**<br>
> About 6 minutes · from topics covered at school

The first card preview is `What is the function of ribosomes?`, labelled `AQA GCSE Combined Science ·
Cell Biology · curated recall`.

Only two decisions are visible:

1. duration: `Quick 5` or `All 7`;
2. format: `Cards` or `Mixed`.

The default is `All 7 · Mixed`, so the primary action is simply `Start recall`. `Choose cards` expands the
existing detailed controls for a student who explicitly needs them; search, card kind, specification
reference and reverse mode are not on the first view. The session ends at the selected count.

## Progress and evidence — `/progress`

Progress answers four questions in plain language before showing any detailed table:

- **What has been checked?** `14 questions across 3 of 4 taught Biology topics.`
- **How strong is the evidence?** `Growing evidence · still thin in Infection and Response.`
- **What is the cautious range?** `Early working range: Grade 6–8.` The subcopy says `Not a predicted
grade; based only on checked work.`
- **What needs attention next?** `Long explanations: oxygen → respiration → energy.`

The target `8–8` is shown as context, not as a red deficit. There is no decorative line graph.

`View official topic evidence` drills into AQA specification rows. Each row distinguishes independent
transfer, guided gap-closing, recall-only evidence and no evidence yet. Counts link back to the exact questions
that created them.

`Not yet covered at school` is a separate neutral section containing Homeostasis, Inheritance and
Ecology. It has no warning colour, percentage gap, or downward arrow.

## Taught-scope adjustment

The scope sheet can be opened from `Not covered yet`, the focus line, or Progress. It asks one concrete
question:

> **What has your class covered in Biology?**

Four checked rows are grouped under `Covered`: Cell Biology, Organisation, Infection and Response,
Bioenergetics. Three unchecked rows are grouped under `Later at school`: Homeostasis, Inheritance and
Ecology. Copy below the groups says `Later topics are excluded from your stream and do not count against
progress.`

Marking a live question `Not covered yet` removes it from the queue, records no failure, and preselects
its topic in this sheet so the correction takes one tap.

## Optional natural-language control

The focus sheet includes a compact field labelled `Adjust this trail in your own words`. If Maya enters:

> We have not covered ecology. Give me ten minutes on Biology and avoid my reserved paper.

the product first shows a structured preview:

- `Subject: Biology`
- `Time: 10 minutes`
- `Exclude: Ecology`
- `Paper rule: keep 2024 Biology Paper 1 reserved`

Nothing changes until Maya taps `Apply to this trail`. Ambiguous changes remain editable as ordinary
controls. This is command interpretation, not a chat transcript.

## Authentic paper mode — `/papers`

The paper shelf makes freshness a first-class state:

- `June 2024 Biology Paper 1 · RESERVED · unseen · 1 h 15 min · 70 marks`
- `June 2023 Biology Paper 1 · EXPOSED · answers viewed`

Reserved questions are excluded from the stream, recall examples, search previews and method-transfer
recommendations. `Start fresh mock` opens a clean, paginated paper screen with a restrained timer and no
answer help. Pausing preserves the reserved state.

`Reveal answers` always triggers a clear warning:

> **Reveal answers and expose this paper?**<br>
> You can still practise it later, but it will no longer count as a fresh mock.

The safe primary action is `Keep paper fresh`; the destructive secondary action is `Reveal and mark as
exposed`. Once exposed, the state and timestamp are visible and never silently reversed.

## Important copy decisions

- Use `Try`, `Continue`, `Explore`, `Practise`, `Improve`, `Method`, `Why this?`, `Not covered yet` and
  `close the gap`.
- Say `four worth trying`, not `For you`; this is editorial selection, not a social feed.
- Say `Ends after 4`, not merely `4 remaining`; the endpoint is part of the trust contract.
- Say `Growing evidence` and `Early working range`, not `level`, `ability` or `prediction`.
- Say `Later at school`, not `missing`, `weak`, `behind` or `incomplete`.
- Never use `learner` or `learn` in student-facing copy.
- Keep provenance adjacent to every prompt. Authentic, adapted and generated items are never visually
  interchangeable.

## What this concept deliberately excludes

- Infinite scroll, swipe-to-dismiss mechanics, autoplay, streaks, XP, badges, leagues, confetti and
  variable rewards.
- A dashboard grid where Questions, Recall, Papers, Progress and Chat all compete as equal cards.
- A generic chatbot or a persistent conversational transcript.
- Curriculum taxonomy as the main starting surface.
- Model-generated questions mixed into authentic paper material without an explicit label.
- Automatic use of a reserved paper or automatic answer reveal.
- A single undifferentiated percentage called `coverage`.
- Treating `Not yet covered` as an error or lack of effort.
- The old standalone retained-chain or `/thinking-memory` UI.
- Mixed-subject items inside a trail unless the student deliberately starts a new subject trail.

## Board composition

`core-flow.png` shows four linked states: signed-in finite stream, paper-like attempt, checked method
reveal, and a different-context transfer with continuation controls.

`support-flow.png` shows the simplified recall launch, high-level progress with official evidence
drill-down, taught-scope adjustment with structured natural-language interpretation, and the reserved
versus exposed authentic-paper state with the reveal warning.
