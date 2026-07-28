# Product Flows

Question Constellation is a public GCSE question bank built around a short, legible learning loop:

```text
find a question -> write an answer -> check marking points -> improve the answer -> try another
```

The learner should never need to understand an internal content model before they can use the app.
The interface talks about questions, answers, and marking points. Chain, step, constellation, and
gap records may still exist in D1 for grouping and grading, but they do not have public pages.

## Product Map

The current product has these learner-facing areas:

- `/` — public or signed-in home
- `/questions` — public question catalogue
- `/questions/:questionId` — public question and optional marking guidance
- `/questions/:questionId/practice` — write, check, and improve a complete answer
- `/subjects/:subject` — signed-in subject hub
- `/recall/:subject/:activity` — focused recall activity
- `/challenges` — challenge catalogue and game flow
- `/past-papers/gcse` — public past-paper discovery
- `/profile` — account and preferences

The following legacy learner destinations do not exist:

- `/questions/:questionId/answer-chain`
- `/constellations/:chainId`
- `/gaps/:gapId`
- `/thinking-memory`
- `/questions/:questionId/practice/:stepId`

Do not redirect these routes into a renamed version of the same flow. A deleted learner concept
should remain deleted.

## Entry Flows

### Public home

1. A signed-out visitor opens `/`.
2. The page explains the concrete value: answer an exam question, check marking points, and improve.
3. The main action opens a real featured question or the question catalogue.
4. Questions, past papers, and challenges remain browsable without creating an account.

The home page is an orientation surface, not a dashboard pitch. Avoid abstract claims about methods,
chains, constellations, memory systems, or repair engines.

### Signed-in home

1. A returning learner opens `/`.
2. They see a compact weekly summary, configured subjects, a recall recommendation, and an optional
   challenge recommendation.
3. A subject card opens `/subjects/:subject`.
4. A question recommendation opens the question or its complete-answer practice page.

This existing signed-in home, recall, challenge, and profile structure is retained. Question
practice should not introduce a second competing progress system.

### Search, teacher link, or shared URL

1. A learner lands directly on `/questions/:questionId`.
2. The question, mark value, and exam metadata are visible immediately.
3. The primary action is `Answer this question`.
4. The learner can optionally expand `Study the marking` before attempting.

There is no intermediate chain page.

### Question catalogue

1. A learner opens `/questions`.
2. They filter or browse using familiar exam information.
3. A result opens `/questions/:questionId`.
4. The question page owns the next action.

The catalogue groups by subjects, topics, boards, and papers—not by internal grading structures.

## The Question Page

Route: `/questions/:questionId`

The page includes:

- question number and prompt;
- mark value;
- board, qualification, subject, tier, paper, topic, and question type when available;
- any source material, table, or diagram needed to answer;
- primary action: `Answer this question`;
- optional `Study the marking` disclosure;
- a quiet route back to the catalogue or source context.

`Study the marking` may reveal:

- reviewed marking points;
- a full-mark answer;
- why a common weak answer loses credit;
- a link to one related question.

The disclosure is secondary. It must not compete visually with the answer action or send the learner
to a separate conceptual page.

## Complete-Answer Practice

Route: `/questions/:questionId/practice`

### Attempt state

1. Show the complete question and any required source material.
2. Show one answer field.
3. Keep marking guidance hidden.
4. The learner writes their whole answer.
5. The learner selects `Check answer`.

The screen should feel like answering an exam question, not operating a tutoring workflow. Do not
show a chain diagram, sequence cards, per-point buttons, or a related-question sidebar while the
learner is writing.

### Checking state

Checking may compare the response with curated evidence and, where configured, an explicit runtime
model call. While checking:

- retain the learner's answer;
- show a calm, specific pending state;
- do not invent a numeric exam grade;
- do not navigate away.

If checking fails, preserve the answer and offer a clear retry.

### Result state

The result shows:

- `X of Y marking points included`;
- every marking point labelled `Included` or `Missing`;
- concise feedback grounded in the learner's actual words;
- the learner's submitted answer;
- a primary action to improve the answer when anything is missing;
- a direct `Try another question` action when the answer is secure.

Do not show:

- `steps found`;
- `links found`;
- `answer chain`;
- `missing link`;
- `practise this step`;
- `repair chain`;
- `close the gap`;
- a separate practice action beside each marking point.

### Improvement state

1. Keep all marking points visible.
2. Restore the learner's answer in an editable field.
3. Ask them to improve the complete response.
4. Re-check the rewritten answer.
5. Acknowledge marking points newly added since the previous attempt.

This is guided correction of the current answer. It is not represented as another lesson,
destination, or progress object.

### Next-question state

1. When the learner has finished reviewing or improving, offer one related question.
2. Open `/questions/:nextQuestionId/practice`.
3. Start with marking guidance hidden and an empty answer field.

The fresh question is the transfer practice. The related-question selector may use internal chain
or curriculum evidence, but visible copy says only `Try another question`.

## Subject, Recall, Challenge, and Profile Flows

### Subject hub

Route: `/subjects/:subject`

- Show one recommended next action.
- Offer a small number of genuine alternatives.
- Recall actions open an immersive recall session.
- Question actions open a concrete question or complete-answer practice.
- Avoid gap, chain, or method language in recommendations.

### Recall

Route: `/recall/:subject/:activity`

Recall remains a separate, focused loop for study cards. Leaving or completing it returns to its
explicit source context. It does not feed into a legacy gap-builder page.

### Challenges

Route: `/challenges`

Challenges remain a sibling product area with their own compare, choose, explain, and transfer game
loop. They may teach marking ideas, but learner-facing copy should not claim that the player is
building or repairing a chain.

### Profile

Route: `/profile`

Profile remains for account details, preferences, and subject configuration. It does not expose
internal learning records as chains or gaps.

## Navigation Rules

- Keep `/`, `/questions`, and `/challenges` as stable top-level destinations.
- Use contextual back actions inside immersive practice, recall, and challenge screens.
- Respect a safe `returnTo` parameter when one was supplied.
- A result-to-result journey may label the back action `Back to previous result`.
- Do not add global navigation inside the active answer field merely to expose more product areas.
- Deleted routes should return 404 rather than lead to an obsolete replacement journey.

## Language Rules

Use:

- `Question`
- `Answer this question`
- `Check answer`
- `Marking points`
- `Included`
- `Missing`
- `Improve your answer`
- `Try another question`
- `Study the marking`

Do not use in learner-facing question flows:

- `Answer chain`
- `Link` or `missing link`
- `Constellation`
- `Gap`
- `Repair`
- `Method`
- `Practise this step`
- `Close the gap`
- `Thinking memory`

The product name `Question Constellation` may remain. `Constellation` is not used as the name of a
learner object or route.

## Mobile Requirements

- The question and main action appear before supporting material.
- Question source assets keep a stable aspect ratio and never shift the answer field after load.
- The answer field, checking state, feedback, rewrite field, and primary action fit without
  horizontal overflow.
- Marking-point rows stack cleanly and remain scannable.
- A sticky action may be used only when it does not cover the answer or feedback.
- Test question, result, and rewrite states on a narrow mobile viewport as well as desktop.

## Authentication and Persistence

Public question discovery, reading, and practice routes remain reachable without an auth wall.
Authentication may add persistence and personal recommendations, but it must not be required merely
to understand the product.

Anonymous answer checking may keep temporary browser state. Signed-in checking may additionally
persist attempts. Either way, the visible learning loop is identical.

## Internal Data Boundary

The current D1 data may retain answer-chain, chain-step, constellation, and gap tables or fields.
They can continue to support:

- marking-point identity;
- answer diagnostics;
- related-question selection;
- historical personal-learning rows;
- migration compatibility.

Do not delete or rewrite those records as part of the UI removal. Do not expose them merely because
they remain available internally. A future data migration should be a separate, reviewed change.

## Acceptance Checklist

Before changing or releasing the question journey, verify:

- `/questions/:questionId` has one obvious answer action;
- `/questions/:questionId` offers optional marking guidance inline;
- `/questions/:questionId/practice` does not expose marking guidance before `Check answer`;
- `/questions/:questionId/practice` accepts and checks a complete answer;
- results say marking points are `Included` or `Missing`;
- rewrite improves the whole answer;
- the next action opens a fresh related question;
- deleted learner routes return 404;
- question pages contain no legacy learner terminology;
- desktop and mobile layouts are stable;
- D1 records and bindings were not deleted by the UI cleanup.
