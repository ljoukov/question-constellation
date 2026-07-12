# Recommended Complete Product Flow

This is the synthesis recommended after reviewing the three independent concepts. It specifies the
journey to prototype next; it is not an instruction to implement the current production app yet.

## Product Shape

Question Constellation has two modes with one shared account and evidence model.

### Explore and practise

- Warm, editorial, and action-first.
- Opens on a finite trail of worthwhile questions.
- Uses questions to lead into checking, gap closing, reasoning methods, recall, and transfer.
- Gives direct controls without requiring curriculum navigation.

### Authentic paper mode

- White, restrained, and deliberately paper-like.
- Uses source-faithful HTML controls, figures, tables, and answer areas.
- Keeps help, recommendations, and command controls outside the exam surface.
- Tracks whether a paper is reserved, exposed, attempted, or marked.

## Global Shell

### Desktop

Header:

```text
Question Constellation | Biology | Search | Recall | Progress | Papers | Maya
```

- `Biology` opens the subject switcher without leaving the current trail until a new subject is
  chosen.
- Search is a utility for a known paper, topic, mark value, or exact question.
- Recall, Progress, and Papers are destinations, not competing home cards.
- Profile retains the current subject/board/tier controls and adds covered scope.
- `Adjust` or `⌘K` opens optional natural-language control. No command input is permanently visible on
  a question page.

### Mobile

- Compact wordmark, subject/session state, and profile/menu.
- No dense bottom navigation over the answer area.
- The current question and primary action remain above utility navigation.
- `Adjust` opens a half-height sheet; it is not a chat tab.

## Primary Returning Journey

```text
sign in
  -> finite question trail
      -> paper-like attempt
          -> transparent check
              -> improve and recheck, when needed
                  -> method earned
                      -> independent transfer
                          -> trail continues or ends
                              -> progress evidence updates
```

Recall can enter before or after a question when a short fact is the current barrier. Authentic paper
mode is a deliberate separate branch.

## 1. Sign-In And Profile

Keep the existing profile concept because it serves a real purpose:

- subjects;
- exam board;
- Combined or Separate Science;
- Higher or Foundation tier;
- English texts/modules where applicable;
- target grade as context;
- covered at school versus later at school.

Do not require the full profile before first public value. Ask only for missing information when it
changes what can be selected safely.

Covered scope can be set in three ways:

1. direct topic choices;
2. a short natural-language statement;
3. later, school-material upload mapped to official specification statements.

Every interpretation is shown before saving. Untaught topics are excluded by default and do not lower
progress.

## 2. Signed-In Home: Finite Question Trail

Primary copy:

```text
Maya, here are four worth trying.
Biology · covered topics · about 10 minutes
1 of 4 · Ends after 4
```

Layout:

- one dominant real question card;
- a compact `Up next` list of two or three intriguing items;
- a small `7 cards due` row if relevant;
- no subject grid, feature grid, or progress chart;
- no infinite scroll.

Current card:

```text
AUTHENTIC QUESTION
AQA · GCSE Combined Science · Higher · Biology Paper 1
November 2021 · Q05.5 · 4 marks

Explain why heart attack survivors get out of breath easily
when they exercise gently.

[Try question]  [Why this?]
```

Selection controls:

- `Another like this`
- `Harder`
- `Different topic`
- `Not covered yet`
- `Why this?`

On mobile, keep `Another`, `Not covered yet`, and `Why this?` visible. Put the remaining controls under
`Change`.

`Why this?` explains:

- official topic;
- evidence used;
- expected time;
- source/provenance;
- confirmation that reserved papers are excluded.

The trail should mix value, not just weakness:

- one question that closes a known gap;
- one transfer question;
- one confidence-building question;
- one question selected for scope or curiosity;
- recall only when genuinely due or useful.

## 3. Focus And Scope Sheet

Open from the trail header, `Not covered yet`, Progress, or `Adjust`.

First view:

```text
Biology · 10 minutes · covered topics · reserved mock protected
```

Allow one-tap changes to subject and time. Show detailed specification topics only after `Change
covered scope`.

Optional text input:

```text
We have not covered ecology. Give me ten minutes on Biology
and avoid my reserved paper.
```

Structured interpretation:

```text
Subject       Biology
Time          10 minutes
Scope         Covered topics only
Ecology       Later at school
Paper rule    June 2024 paper remains reserved

[Apply] [Edit] [Cancel]
```

This is app control, not tutoring. Do not retain a conversational transcript.

## 4. Paper-Like Question Attempt

The stable destination screen remains simple.

Header:

- `1 of 4 · about 8 minutes left` for an ordinary trail;
- exact source and provenance;
- no visible grade or progress analytics.

Body:

- faithful prompt, image, table, diagram, or extract;
- authentic response control rather than a universal textarea;
- generous answer space;
- no chain or model answer before the student acts.

Actions:

```text
[Check answer]  [Use mark checklist]
Need a hint?
```

- `Check answer` is the explicit model action when available.
- `Use mark checklist` must provide useful public value without model access.
- Opening help changes the assistance status recorded with the attempt.
- Active time, time to first response, help exposure, and retries are recorded as evidence but do not
  need to be visible during ordinary practice.

## 5. Transparent Check Result

Lead with the student's evidence, not a chat verdict.

```text
3 of 4 links found

✓ reduced delivery
✓ less oxygen
✓ less aerobic respiration
○ less energy -> symptom or compensation

Close the gap: add what happens to energy release.
```

The primary action depends on the evidence.

### Complete independent answer

```text
[Try a transfer question]
```

### Missing reasoning link

```text
[Improve this answer]
Transfer unlocks after the improved answer passes recheck.
```

### Missing short fact

```text
[Review this fact] [Try another question]
```

The review may be a card, MCQ, or true/false item. It should not force a long guided sequence for a
one-mark fact.

### Student cannot structure the answer

```text
[Build it step by step]
```

Open the guided answer builder on demand. This is not automatically labelled as a persistent gap.

### Contested result

```text
[This mark looks wrong]
```

The contested result remains visible but does not silently change progress evidence.

## 6. Guided Answer Builder And Gap Closing

The same interaction pattern serves two entry contexts:

1. help with the current question;
2. closing a gap identified from previous evidence.

Flow:

```text
3–8 short reasoning questions
  -> inline question-form guidance
      -> compact method reminder
          -> fresh complete response
              -> recheck
```

Rules:

- Every short field asks one useful reasoning question.
- Correct responses receive a concise confirmation.
- A weak response receives a more focused question, not the answer.
- Repeated attempts become more guided without changing the success criterion.
- The student must still compose a complete answer.
- Transfer remains locked until that complete answer passes recheck.

English Language uses task-specific stages rather than a science causal chain, but the shell,
continuity, evidence states, and completion behavior remain consistent.

## 7. Method Earned And Transfer

After a successful independent answer or improved recheck, show the reusable method.

```text
METHOD
Use when delivery or gas exchange is reduced.

reduced delivery
  -> less oxygen
  -> less aerobic respiration
  -> less energy
  -> symptom or compensation

The context changes. The mark-scoring bridge stays the same.
```

Do not make a chain taxonomy the next decision. Put one new question directly underneath:

```text
STRETCH · AUTHENTIC · NON-RESERVED
June 2019 · Q01.5 · 6 marks

Some people who take beta blockers get out of breath when they exercise.
Explain why beta blockers can have this effect during exercise.

[Try transfer question]
```

Available secondary controls:

- another like this;
- harder;
- different topic;
- not covered yet;
- why this?

The method becomes `Applied` after independent transfer and only `Mastered` after later retention
evidence. The student does not need to see those internal state names after every question.

## 8. Trail End

Stop at the promised endpoint.

```text
Done for now

3 questions checked
1 gap closed
1 transfer applied independently
7 minutes of active work

[Finish]  [Another 5 minutes]
```

No streak guilt, leaderboard, confetti, or automatic next session. The main progress model updates in
the background.

## 9. Recall Launch

Replace the current configuration surface with a recommendation.

```text
7 Biology cards are due
About 6 minutes · from topics covered at school

What is the function of ribosomes?

Format   [Mixed] [Cards] [True or false]

[Start review]
Choose a topic
```

- Default to due items in covered scope.
- Keep one format decision visible.
- Put topic, card type, reverse mode, search, and custom count behind `Choose a topic` or `More
options`.
- End at the promised count.
- Preserve the existing flip, explanation, swipe/buttons, and two-way self-report interaction.

## 10. Progress

Progress is a destination, never the signed-in landing page.

Top row:

```text
Working range       Assessed scope       Evidence strength       Target
6–7                 3 of 4 taught        Moderate                8–8
```

Adjacent qualification:

```text
Not a whole-course prediction. Later-at-school topics do not lower this range.
```

Topic rows:

```text
Cell Biology                    Strong evidence
Organisation                    Gap to close: respiration -> energy
Infection and Response          Building evidence
Bioenergetics                   Limited evidence

LATER AT SCHOOL
Homeostasis and Response
Inheritance, Variation and Evolution
Ecology
```

Each assessed row can disclose:

- official specification statements;
- exact supporting questions;
- independent versus supported work;
- last evidence date;
- transfer distance;
- recall due;
- timing conditions;
- contested results.

No empty red bars or zero percentages appear for later-at-school topics.

## 11. Papers

Paper shelf:

```text
RESERVED · FRESH MOCK
AQA 8464/B1H · Biology Paper 1 · June 2024
75 minutes · answers sealed · no questions used in practice
[Start timed mock]

EXPOSED · REVIEW
AQA 8464/B1H · Biology Paper 1 · June 2023
answers viewed · used in practice
[Open for practice]
```

Reserved questions are excluded from:

- trail recommendations;
- transfer questions;
- search previews that reveal content;
- model examples;
- recall examples;
- method pages.

Before exposing a reserved question or answer:

```text
Reveal this reserved paper?
It will no longer count as a fresh mock.

[Keep it reserved]  [Reveal and mark exposed]
```

The safe action is visually primary.

## 12. Authentic Paper Attempt

Exam mode removes ordinary recommendation and command UI.

Show:

- clean HTML paper pages;
- official question numbering and mark values;
- timer and access-arrangement state;
- question navigator;
- autosave and reconnect state;
- `Finish paper`;
- no hints, answer chains, or progress indicators.

Copy/paste and text-selection deterrents belong only in applicable independent modes. They are not
proof of independence and must not block required accessibility support.

After submission:

- mark per question;
- show official paper score;
- use official boundaries only where the exact component/session supports the claim;
- distinguish paper outcome from whole-qualification prediction;
- offer question-level gap closing after the authentic result is recorded.

## 13. English Language

English questions enter from the same finite trail or search utility.

For a simple task:

- show the existing one-step paper-like answer screen.

For a task that benefits from staged support:

- open the existing multi-step English destination;
- preserve question-specific stage names, goals, criteria, and hints;
- keep later stages locked until the active stage passes;
- require a final composed answer;
- end with a next question or `Done for now`, not a disabled completion button;
- write evidence into the same progress ledger as Science, qualified by assistance level.

Do not automatically apply the English Language flow to English Literature until the Literature
experience has been tested separately.

## 14. Public And Search Journey

Public acquisition remains concrete:

```text
search/social/teacher link
  -> exact public question
      -> try or inspect static mark checklist
          -> method and related questions
              -> optional sign-in for saved progress and model checking
```

Public method and topic pages can remain indexable, but they are search/reference surfaces rather
than the primary signed-in navigation.

The first sign-in boundary must be visible before substantial work if a requested action requires an
account. Drafts survive the transition.

## 15. Complete Navigation Model

Primary returning destinations:

```text
Home trail
Recall
Progress
Papers
Profile
```

Utilities:

```text
Search
Adjust / command sheet
Source documents
Report a problem
```

Objects such as answer chains, constellations, curriculum nodes, and evidence records remain central
to the system without becoming five more navigation tabs.

## Design Rules For Implementation

- One dominant object per screen.
- One visually primary action per state.
- Real question copy is larger than product copy.
- Prefer rows and sheets to repeated card grids.
- Use warm editorial paper surfaces; avoid glass effects, neon, mascots, and generic AI gradients.
- Preserve exam-response geometry and prevent layout shift.
- Keep provenance adjacent to the question.
- Make destructive paper exposure actions visually secondary.
- Never present later-at-school scope as failure.
- Never present guided success as equivalent to independent transfer.
- Never reveal the next method step before the student has acted unless they explicitly request help.
- Keep the optional command layer structured, reversible, and absent from exam mode.
