# Concept C: Command Bar, Question Canvas

## Product thesis

Question Constellation is a question-first app with a compact command layer, not a chat product.
Every capability is represented as a structured product action: start a session, change subject,
adjust difficulty, mark a topic not covered, open progress, protect a paper, reveal a method, or
choose another question. The same actions are available through ordinary buttons and menus.

The command bar is useful when several settings belong in one sentence:

> We have not covered ecology. Give me ten minutes on Biology and avoid my reserved paper.

The app translates that sentence into a small, inspectable plan. It never replies as a tutor, keeps
no chat transcript, and does not compete visually with the question. Important changes to covered
scope or authentic-paper state wait for confirmation. Reversible changes such as `Harder` or
`Another like this` happen immediately and offer Undo.

The result is “headless” in the product sense: navigation and state changes share one action model,
while the visible interface remains calm, direct, and exam-specific.

## Design principles

1. **A question owns the canvas.** The largest object on home, subject continuation, and practice is
   a real-looking question, not a feature card or progress chart.
2. **Click first for frequent actions.** `Continue`, `Another like this`, `Harder`, `Different topic`,
   `Not covered yet`, `Why this?`, `Check answer`, and `Use mark checklist` stay visible near the work.
3. **Command when intent spans settings.** The command bar is best for combinations of subject,
   available time, taught scope, question source, and difficulty.
4. **Interpret before consequential action.** Scope changes, paper reservation, answer reveal, and
   mock start show a structured interpretation with `Apply` or `Cancel`.
5. **No conversation chrome.** There is no assistant avatar, message history, typing indicator,
   generic `Ask anything`, or free-form tutoring pane.
6. **Evidence is qualified.** Performance is separated from assessed scope and evidence strength.
   `Not yet covered` is neutral and excluded from the working grade range.
7. **Authentic papers are scarce.** Adapted and generated practice can be used freely; a reserved
   authentic paper remains sealed until Maya deliberately starts a mock.

## Shared shell and command behavior

### Persistent shell

- Compact header: Question Constellation, current subject/session, `Progress`, `Papers`, avatar.
- Main region: one focused route surface.
- Subtle command capsule fixed at the bottom on desktop and mobile:
  `⌘K  Tell Constellation what you want…`
- The capsule is visually secondary. `/` or `⌘K` focuses it; Escape closes it.
- Contextual placeholder examples change without changing the tool:
  - Home: `Ten minutes on Biology`
  - Question: `Another like this, but harder`
  - Progress: `Show gaps in Organisation`
  - Papers: `Start my reserved mock`

### One action model

Clickable controls and commands resolve to the same actions:

- `start_session(subject, minutes, scope, source_policy)`
- `next_question(similarity, difficulty, topic_policy)`
- `set_topic_state(topic, covered | not_yet_covered)`
- `show_selection_reason(question)`
- `open_method(question)`
- `start_recall(subject, minutes, mode, due_only)`
- `open_progress(subject, topic)`
- `reserve_paper(paper)` / `start_mock(paper)` / `reveal_paper_answers(paper)`

The UI never displays this technical notation. It displays a short interpretation card with human
labels such as `Biology`, `10 minutes`, `Taught topics only`, and `Reserved paper protected`.

### Interpretation rules

- Reversible navigation applies immediately: `Harder`, `Different topic`, `Five true/false`.
- Scope changes show the affected official topic and explain:
  `Future selection changes. Past results stay unchanged.`
- A command cannot silently expose a reserved paper. It can only open the paper confirmation.
- Ambiguity produces one compact choice row, not a conversation. Example:
  `Biology scope: Taught topics only / All topics`.
- Requests for an answer become product actions such as `Use mark checklist` or `Show method after
attempt`; the command layer does not answer the exam question.
- After Apply, the interpretation collapses into a one-line session receipt and then disappears.

## Complete Maya journey

### 1. Signed-in home — `/`

Maya sees an immediate recommendation within two seconds:

- Header: `Good afternoon, Maya` and `About 10 minutes?`
- Dominant paper card:
  - `AUTHENTIC QUESTION · November 2021 · Q05.5`
  - `AQA GCSE Combined Science · Higher · Biology Paper 1 · 4 marks`
  - `Explain why heart attack survivors get out of breath easily when they exercise gently.`
  - Primary action: `Continue with this question`
  - Secondary: `Why this?`
- A narrow continuation stream below, not an equal-weight grid:
  - `7 recall items due · 6–8 min`
  - `Transfer: oxygen → respiration → energy · 4 min`
  - `Reserved mock · AQA Biology Paper 1, June 2024`
- The current session policy is a quiet line:
  `Biology · taught topics · non-reserved question · reserved paper protected`.

`Why this?` opens a small evidence sheet:

> This uses Organisation, which your profile says has been covered. Two recent answers skipped the
> respiration → energy link. It is an authentic November 2021 question; your reserved 2024 paper
> stays sealed.

The sheet offers `Try it`, `Another like this`, and `Different topic`.

### 2. Optional compound command — global command layer

Maya types:

> We have not covered ecology. Give me ten minutes on Biology and avoid my reserved paper.

The interface shows no bot reply. It shows:

- **Session:** Biology · 10 minutes
- **Scope:** Taught topics only · Ecology → Not yet covered
- **Question source:** Adapted and generated practice
- **Protected:** AQA Biology Paper 1, June 2024 remains reserved
- Buttons: `Apply plan`, `Edit`, `Cancel`

Applying starts a session and adds a compact timer/progress indicator to the shell. The same plan can
be made through the duration, subject, scope, and source controls; command entry is optional.

### 3. Subject continuation — `/subjects/biology`

The session continues without setup. A large question occupies the page; a slim action row remains
available:

- `Another like this`
- `Harder`
- `Different topic`
- `Not covered yet`
- `Why this?`

`Not covered yet` removes the question from the active session and opens one confirmation naming the
official specification topic. It never creates a wrong answer or lowers progress.

`Why this?` always identifies four things: selection evidence, official topic, material provenance,
and whether a reserved paper is affected.

### 4. Question destination — `/questions/8464b1h-nov21-05-5`

The shell quietens and the question becomes a clean HTML exam page:

- Provenance badge: `AUTHENTIC QUESTION`
- Source reference `AQA 8464/B/1H · November 2021 · Q05.5` and full exam metadata remain visible.
- The chain and model answer are hidden before action.
- Main response field resembles answer lines rather than chat composition.
- Primary: `Check answer`
- Secondary: `Use mark checklist`
- Support is collapsed behind `Need a hint?`.

The command capsule remains available but subdued. `Show me the answer` does not reveal it; it offers
the existing guarded actions `Use mark checklist` and `Show method after attempt`.

### 5. Checked answer and close-the-gap step — `/questions/8464b1h-nov21-05-5/result`

Feedback is checklist-first:

- `2 / 4 marks`
- `You linked reduced blood flow to less oxygen.`
- `Close this gap: connect less oxygen → less aerobic respiration → less energy.`
- The reusable method appears only now:
  `reduced delivery → less oxygen → less aerobic respiration → less energy → symptom`
- Primary: `Improve this answer`
- Secondary: `See model answer`

The improved answer is checked again. Transfer stays locked until the improved answer passes that
recheck. Before then, a secondary preview is labelled `NEXT · AFTER A SUCCESSFUL RECHECK`; it may
show the transfer question, but it cannot start it. Passing records same-question improvement, which
does not by itself mean the method is secure.

### 6. Method transfer — `/methods/delivery-oxygen-respiration-energy`

After the successful recheck, the method page unlocks. It is compact and concrete:

- `Use when delivery or gas exchange is reduced.`
- `What stays the same` names the oxygen, respiration, energy, symptom links.
- `Common missed link` identifies respiration → energy.
- A visibly different next question is labelled `STRETCH · ADAPTED`:
  `Explain why damaged alveoli can make a person breathe faster during exercise.`
- Primary: `Try the transfer question`

The method is not labelled mastered after the rewrite. It can become `Applied` after independent
transfer and only `Mastered` after later retention evidence.

### 7. Session end

At about ten minutes, the app finishes the current item rather than interrupting it. The completion
sheet contains only:

- `3 questions checked`
- `1 gap closed`
- `Transfer still to prove` or `Transfer applied`
- `Continue for 5 minutes` / `Finish`

There is no streak celebration or generic score animation.

## Support journeys

### Recall launch — `/recall/biology`

The dense configuration screen is replaced by a decisive launch:

- `7 due in Biology`
- Estimated time: `6–8 minutes`
- Default mix: flashcards and MCQ, prioritising due items in covered topics
- Primary: `Start quick review`
- One optional choice: `Flashcards / Mixed / True or false`
- Small link: `Choose a topic`

A command such as `Five true/false on Cell Biology` applies immediately because it is reversible and
shows a one-line receipt. The first card uses the real prompt:

> A higher temperature always increases the rate of an enzyme-controlled reaction.

The reverse shows `False`, a short explanation, and `Review again` / `Had it`.

### Progress summary — `/progress`

Progress is a destination, not the home screen. The top section answers four questions:

- **Working range:** `6–7 in assessed Biology content`
- **Assessed scope:** `3 of 4 taught topics`
- **Evidence strength:** `Moderate · 14 checked questions`
- **Target:** `8–8`

A note is always adjacent:

> This is not a whole-course prediction. Homeostasis, Inheritance and Ecology are marked Not yet
> covered and do not lower the range.

The subject list shows one calm row per subject. Selecting Biology opens official curriculum detail.

### Official curriculum evidence — `/progress/biology`

Rows follow the AQA specification order and separate state from evidence:

- Cell Biology — `Strong evidence`
- Organisation — `Gap to close: respiration → energy`
- Infection and Response — `Building evidence`
- Bioenergetics — `Limited evidence`
- Homeostasis and Response — `Not yet covered`
- Inheritance, Variation and Evolution — `Not yet covered`
- Ecology — `Not yet covered`

Each taught row can disclose checked questions, independent versus supported attempts, recall due,
transfer distance, and latest evidence. Not-yet-covered rows contain no empty progress bars or red
states.

### Taught-scope adjustment — `/scope`

Scope is editable from `Not covered yet`, profile, progress, or command interpretation. The default
view is a short summary, not a curriculum browser:

- **Covered at school:** Cell Biology, Organisation, Infection and Response, Bioenergetics
- **Not yet covered:** Homeostasis, Inheritance, Ecology

`Review all AQA topics` opens the detailed list only on request. Applying scope changes future
selection while preserving prior answers and provenance.

### Authentic-paper state — `/papers`

Paper cards use explicit source state:

- `RESERVED · FRESH MOCK`
- `AQA 8464/B1H · Biology Paper 1 · June 2024`
- `75 minutes · answers hidden · no questions used in practice`
- Primary: `Start timed mock`
- Secondary: `Change reservation`

Starting the paper opens a confirmation:

> Starting exposes the questions. The paper can still be paused, but it will no longer count as a
> fresh mock. Answers stay sealed until you choose Reveal answers.

Exam mode then removes the command capsule and ordinary recommendations. It uses paper-like HTML,
a restrained timer, question navigator, save state, and `Finish paper`. `Reveal answers` has a second
explicit warning because it permanently changes the paper to `EXPOSED · REVIEW`.

## Mobile behavior

- The same routes and hierarchy are used; there is no separate mobile navigation model.
- The question fills the width and the action row becomes a horizontally scrollable set of plain
  controls.
- The command capsule sits above the safe area. When opened, it becomes a half-height sheet with the
  input, interpretation, and confirmation actions.
- Question metadata wrap into two readable lines rather than tiny chips.
- Progress curriculum rows become disclosure rows; not-yet-covered labels remain fully visible.
- Exam mode uses a bottom question navigator and keeps the timer in the paper header.

## Copy decisions

- Use `close the gap`, never broken-object language.
- Use `Working range`, not `Predicted grade`, until evidence is broad enough.
- Use `Assessed scope`, not `Coverage`, for the portion actually tested.
- Use `Not yet covered`, never `weak`, `missing`, or `0%`, for untaught topics.
- Use provenance labels consistently: `AUTHENTIC`, `ADAPTED`, `GENERATED`.
- Use `Why this?` to explain recommendation logic and source policy in student language.
- The command placeholder says `Tell Constellation what you want`, not `Ask AI`.

## Deliberate exclusions

- No generic tutor chat, assistant persona, chat transcript, or answer-generating conversation.
- No feature grid or curriculum heatmap on signed-in home.
- No abstract reasoning taxonomy as the first destination.
- No model answer or full method before an attempt unless Maya deliberately chooses the static mark
  checklist path.
- No automatic scope change, paper exposure, or mock start from natural language alone.
- No mixing not-yet-covered topics into routine sessions.
- No heavy planner, streak economy, points, badges, social feed, or celebratory gamification.
- No claim of mastery from self-report, same-question rewrite, or one successful attempt.
- No restored `/thinking-memory` route; earned method evidence appears inside Progress and the next
  transfer action.
