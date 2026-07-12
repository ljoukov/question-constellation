# Independent Concept Comparison

Three concepts were developed from the same student state, real question anchors, and product
constraints. Their initial design work was isolated. Cross-concept changes happened only after the
first boards were complete and were limited to production QA: source accuracy, reserved-paper safety,
gap-closing order, and mobile extensions.

Use the `v2` board where one exists. The original boards remain available to show what inspection
caught.

## Concept A: Finite Question Stream

Files:

- [Written flow](concept-a-stream/concept.md)
- [Core flow, reviewed](concept-a-stream/core-flow-v2.png)
- [Supporting flows, reviewed](concept-a-stream/support-flow-v2.png)
- [Mobile flow](concept-a-stream/mobile-flow.png)

Best ideas:

- The signed-in home is a finite stream: `4 questions · about 10 minutes · Ends after 4`.
- The question is immediately visible and worth clicking; product explanation is unnecessary.
- A glimpse of the next question creates curiosity without an infinite feed.
- `Another like this`, `Harder`, `Different topic`, `Not covered yet`, and `Why this?` give direct
  control over selection.
- The session has a trustworthy stopping point.
- Recall launch is decisive: due count, time, format, start.

Risks:

- Five continuation controls can become busy on narrow screens; some should move behind `Change` or
  appear after an item is skipped.
- The functional navy-and-green style is clear but less distinctive than Concept B.
- A feed metaphor needs diversity rules so it does not become a stream of predicted weaknesses.
- The visible grade range needs the same evidence qualification used in Concept C.

Inspection findings:

- The first render offered transfer before the improved answer passed recheck.
- It also used a question from Maya's reserved 2024 paper.
- The reviewed board corrects both: improvement is required first, and the transfer is a non-reserved
  authentic June 2019 beta-blocker question.

## Concept B: The Next Stretch

Files:

- [Written flow](concept-b-path/concept.md)
- [Core flow](concept-b-path/core-flow.png)
- [Supporting flows](concept-b-path/support-flow.png)
- [Mobile flow](concept-b-path/mobile-flow.png)

Best ideas:

- The strongest visual identity: an editorial exam/revision aesthetic rather than a generic web app.
- One calm `Your next 10 minutes` action is impossible to miss.
- The route line shows recent work, current action, recall due, and later scope without becoming a
  dashboard.
- `Later at school · waiting, not overdue` is the clearest emotional treatment of untaught content.
- The mobile gap-closing screen explicitly locks transfer until the improved answer is rechecked.
- `My path` combines cautious range, evidence strength, assessed scope, and current focus well.

Risks:

- The path can feel assigned rather than exploratory if it is the only home behavior.
- The permanent route rail consumes useful desktop width and may become decorative across long-term
  use.
- It underplays the user's observation that students enjoy seeing a small list of interesting
  questions.
- `Close the gap` as the home-card headline may overemphasize deficiency; the question can stand on
  its own.

## Concept C: Command Bar, Question Canvas

Files:

- [Written flow](concept-c-command/concept.md)
- [Core flow, reviewed](concept-c-command/core-flow-v2.png)
- [Supporting flows](concept-c-command/support-flow.png)
- [Mobile flow](concept-c-command/mobile-flow.png)

Best ideas:

- The clearest expression of a headless product: clicks and natural language resolve to the same
  structured actions.
- Compound intent becomes easy: subject, duration, covered scope, question source, and paper
  protection in one sentence.
- Important changes produce a structured plan, not a chat response.
- The progress screen best separates working range, assessed scope, evidence strength, and target.
- Authentic-paper state is explicit and consequence-aware.
- The support board shows that the same control layer can configure recall, scope, progress, and
  papers without becoming a tutor conversation.

Risks:

- A command capsule on every screen can look like an invitation to ask for answers.
- Persistent command UI competes with the exam-paper surface and occupies valuable mobile space.
- `Tell Constellation what you want` may still be read as generic chat unless the interaction is
  carefully constrained.
- Frequent simple actions are faster to click; natural language should not replace them.

Inspection findings:

- The first core render made transfer primary before the answer had been improved.
- The reviewed board makes `Improve this answer` primary and labels transfer as the next step after a
  successful recheck.
- The provenance label was corrected from adapted to the authentic November 2021 source.

## Recommended Synthesis

No concept should be implemented unchanged.

Use Concept A as the interaction model for signed-in home:

- a finite trail of three to five worthwhile questions;
- one dominant current question;
- a compact `Up next` list;
- an explicit endpoint and time estimate;
- contextual control over what comes next.

Use Concept B as the visual and emotional language:

- warm editorial paper treatment;
- serif exam prompts with restrained sans-serif interface copy;
- calm evidence states;
- `Later at school` separated from assessed scope;
- a subtle journey indicator, not a permanent decorative rail.

Use Concept C as the application architecture and optional advanced control:

- every action callable through the same structured command model;
- a summon-only command sheet through `Adjust` or a keyboard shortcut;
- no persistent command capsule inside question or exam mode;
- structured interpretation and confirmation for consequential changes;
- ordinary buttons for frequent actions.

Use the strongest shared support patterns:

- Concept A's simple recall launch;
- Concept C's qualified progress header and official topic rows;
- Concept B's `Later at school` language;
- Concept B/C reserved-paper warnings;
- all three concepts' paper-like single-question destination;
- the reviewed rule that improvement and recheck precede transfer.

## What The Final Home Should Not Be

- a grid of subjects, tools, and equal-weight cards;
- a curriculum tree before the student has a reason to open it;
- an infinite feed;
- a dashboard of percentages;
- a generic chat landing page;
- a static list ordered only by database position;
- a list made entirely from predicted weaknesses;
- a path that silently uses reserved-paper questions;
- a page that requires reading instructions before the first click.
