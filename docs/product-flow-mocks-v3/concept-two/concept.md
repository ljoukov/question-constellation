# Concept Two: Electric Paper

Electric Paper treats Question Constellation as a premium science publication that happens to be an operational iPad app. Cream exam sheets sit on a deep aubergine workspace; acid-lime, periwinkle, and coral behave like spot inks. Paper grain, registration marks, and crisp depth make each question feel tangible, while the app bar, session rail, touch targets, and status changes remain conventional enough to build and use.

This direction is intentionally not a poster, generic SaaS shell, card dashboard, or public-service form. The expressive layer is concentrated in type, colour, paper, and transition states. Navigation and actions stay stable.

## Final review set

### 1. Returning home

![Returning home with a finite four-question trail](01-home-final.png)

- Persistent subject, Recall, Progress, Papers, and profile navigation.
- A finite `0 / 4` trail with a clear end after about ten minutes.
- One active exam question and practical peeks at the next three.
- One primary action: `START QUESTION`.
- Only topics already covered at school are included.

### 2. Recall launch

![Seven due Biology cards with one simple format choice](05-recall-final.png)

- The screen opens with the useful state: seven Biology cards due, about six minutes.
- Covered-at-school scope is visible without becoming another filter.
- One three-way format control offers `MIXED`, `CARDS`, or `TRUE OR FALSE`.
- A real Cell Biology item is previewed while its answer remains hidden.
- `Choose topic` and `More options` stay quiet. The only primary action is `START REVIEW`.

### 3. Exact question attempt

![Exact AQA Biology question and answer canvas](02-attempt-final.png)

- The exam paper remains the dominant object.
- The answer canvas is sized for iPad typing and keeps the reasoning chain hidden.
- One primary action: `CHECK ANSWER`.
- The June 2019 table retains the source-paper `X`; it is not silently replaced with the answer from the preceding calculation.

### 4. Close one gap, then recheck

![Improve the answer before recheck](03-improve-recheck-final.png)

- `3 OF 4 LINKS FOUND` is explicitly a reasoning-link count, not a mark score.
- The missing oxygen-to-respiration-to-energy link is concrete and visually local.
- The student's revised clause is highlighted in their own answer.
- `TRANSFER` stays locked. The only primary action is `RECHECK ANSWER`.

### 5. Recheck passes, transfer opens

![Successful recheck and unlocked transfer](03b-recheck-passed-final.png)

- The sequence rail proves that recheck passed before transfer became available.
- All four links are now held.
- The next authentic question is previewed with its source and mark value.
- One primary action: `TRY TRANSFER QUESTION`.

### 6. Biology evidence

![Curriculum evidence and protected full paper](04-progress-final.png)

- Evidence is shown as a curriculum atlas rather than a widget dashboard.
- The working range is deliberately qualified by scope and sample size.
- The three visible evidence counts total the stated 14 checked answers.
- A later-at-school area is neutral and excluded from the range.
- The June 2024 full paper is visibly unopened and kept for a real mock.

## Flow logic

```text
finite home trail
  -> exact question attempt
  -> explicit answer check
  -> one missing reasoning link
  -> improve the same answer
  -> recheck
  -> transfer unlocks only after the recheck passes
  -> progress evidence updates

home recall route
  -> seven due Biology cards
  -> choose one format, or keep Mixed
  -> start review
```

The flow never jumps from feedback straight to a new question. The student must make the missing link explicit in the same answer first. The chain is therefore earned through action rather than revealed as a note to read.

## Content and trust decisions

- Attempt question: AQA Combined Science Higher, Biology Paper 1, June 2019, Q01.5, 6 marks.
- Source table values: heart rate `68 / 150 / 52 / 88`; stroke volume `80 / 120 / X / 98`; cardiac output `5440 / 18000 / 2800 / 8624`.
- The link count is separate from the six-mark result.
- Transfer preview: AQA June 2018, Q02.2, 3 marks, on CHD and heart attack.
- Progress evidence: 14 checked answers across Organisation, Bioenergetics, and Cell Biology.
- Homeostasis is shown as later at school and is not counted.
- The reserved June 2024 paper remains unopened.
- Recall launch: seven due Biology cards, about six minutes, with a ribosome-function item from covered Cell Biology content.

## Buildable design system

### Layout

- Base artboard: iPad landscape, 4:3. The mock images are `1448 x 1086`.
- Stable 72px top navigation area with large safe margins.
- Home uses a narrow session rail plus one active workspace, not a grid.
- Attempt and feedback screens use one dominant content surface and one action surface.
- Every state has one unmistakable primary action.

### Visual tokens

- Canvas: near-black aubergine.
- Paper: warm cream with restrained fibre grain.
- Primary spot ink: acid lime.
- Secondary spot ink: electric periwinkle.
- Gap and current-step ink: hot coral.
- Display type: narrow, high-impact grotesk for short status phrases only.
- Reading and control type: plain sans serif, with serif italic reserved for short annotations.

### Interaction

- Paper sheets lift by a few pixels on touch; they do not wobble or behave like game cards.
- The orbital line may draw forward as the student advances through the four-question trail.
- Recheck changes the missing strip from coral to lime, then unlocks the transfer stage.
- Recall format changes in place; it does not open a configuration wall.
- The protected-paper seal should open only through an explicit full-mock flow.
- Motion should be brief and physical: paper shift, ink fill, line draw. No celebration confetti.

## Review set

The folder contains only the reviewed final images. The `-final` suffix records where factual or
interaction QA required a second generation pass.
