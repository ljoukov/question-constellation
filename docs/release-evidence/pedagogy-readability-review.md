# Pedagogy and readability review

This note records the evidence used to review the July 2026 signed-in learning
flow. It is an implementation constraint, not a claim that a digital practice
mode is itself a complete teaching programme.

## Evidence translated into product decisions

| Evidence                                                                                                                                                                                               | Product decision                                                                                                                                                                                                                | Release check                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| The US Institute of Education Sciences recommends spacing learning, active retrieval, quizzes that re-expose key content, tests that reveal what still needs learning, and deep explanatory questions. | A standard deck is always available; weak cards return sooner; the mixed session includes unaided recall rather than recognition alone; short checks can lead to a longer chain-based explanation question.                     | Check repeat scheduling, mixed-mode composition, empty-deck fallbacks, and the Recall / Close a gap / Longer question alternatives. |
| Retrieval practice benefits depend on genuine retrieval effort; recognition should not displace productive recall.                                                                                     | Multiple choice and true/false are optional checks derived from source-grounded cards. Flashcards and short written exam questions remain visible modes.                                                                        | Check that “Quick recall” is mixed, a learner can choose flashcards directly, and true/false is not the only presentation.          |
| EEF feedback guidance emphasises specific, clear, actionable feedback focused on the task and an opportunity to act on it.                                                                             | Each distractor encodes a particular misconception and receives choice-specific feedback. English coaching identifies the one missing analytical move and allows a retry without moving the goalposts.                          | Independently review distractors and feedback; replay vague, partial, repaired and secure English answers.                          |
| EEF metacognition guidance supports explicit modelling and scaffolding that is reduced as the learner becomes more independent.                                                                        | Hints and marking points are optional assistance and assisted answers do not count as independent grade evidence. A passed English stage remains reviewable, while the next stage stays locked until the active move is secure. | Inspect evidence metadata, working-grade inputs, lock/unlock behaviour and feedback-driven retries.                                 |
| W3C cognitive-accessibility guidance recommends familiar words, short sentences and blocks, clear layout, whitespace, predictable controls, readable contrast and content that is not obscured.        | One obvious next action appears per subject; card prompts and answers are bounded; repeated status prose is removed; controls use semantic buttons; mobile layouts keep the task in one stable viewport where practical.        | Review phone, tablet and laptop layouts in light/dark themes, keyboard focus, zoom/reflow, clipping and contrast.                   |

## Sources

- Institute of Education Sciences, What Works Clearinghouse,
  [Organizing Instruction and Study to Improve Student Learning](https://ies.ed.gov/ncee/wwc/PracticeGuide/1).
- Endres et al.,
  [Mechanisms behind the testing effect: an empirical investigation of retrieval practice in meaningful learning](https://pubmed.ncbi.nlm.nih.gov/26257696/).
- Education Endowment Foundation,
  [Teacher Feedback to Improve Pupil Learning](https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/feedback/).
- Education Endowment Foundation,
  [Metacognition and Self-Regulated Learning](https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/metacognition/).
- W3C Web Accessibility Initiative,
  [Use Clear and Understandable Content](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o3-clear-content/).
- W3C Web Accessibility Initiative,
  [Understanding Success Criterion 1.4.8: Visual Presentation](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation).

## Deliberate limits

- A predicted grade is an early, evidence-qualified range from independent
  checked answers, not an official boundary calculation.
- A self-rating is useful scheduling evidence but cannot prove exam performance.
- Indicative mark-scheme content supplies examples, not mandatory wording.
- A visual cue may aid orientation, but it must not reveal a hidden answer.
- More modes are not automatically better: each setup control must change the
  learning task in a way a pupil can understand.
