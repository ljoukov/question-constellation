# Concept Three — Afterglow Atlas

Afterglow Atlas treats Question Constellation as a premium question instrument for
iPad: expressive enough to feel desirable, restrained enough to trust in an exam
context, and practical enough to build. It uses the visual confidence of an
independent science or culture title without turning the interface into a poster.

## Final reviewed screens

1. [Home — finite four-question trail](home.png)
2. [Authentic question attempt](attempt.png)
3. [Checked answer and active improvement](checked-improve.png)
4. [Recall launch](recall.png)
5. [Authentic paper protection](papers.png)

Every final screenshot is a 1448 × 1086, 4:3 landscape iPad canvas with no device
frame.

## Design language

### The shell

- Near-black ink is the stable application background, not a decorative gradient.
- Warm exam paper creates the strongest contrast and keeps official questions
  immediately recognisable.
- Electric cobalt identifies the one primary action on each screen.
- Hot coral identifies provenance and the next missing move.
- Acid lime is reserved for a single protected-state signal; it is never a score or
  reward colour.
- Fine grain and soft material depth keep the product tactile. Borders, focus rings,
  toggles, disclosure rows, editable fields and lock states remain conventional and
  buildable.

Suggested implementation tokens:

```text
ink-950        #050812
graphite-900   #0d1220
paper-050      #f4f1e9
cobalt-500     #124cff
coral-500      #ff6655
protected-400  #b8ed11
```

### Type

- A compact neo-grotesk display face carries the large home headline and numeric
  paper covers.
- A highly readable modern grotesk carries questions, controls and feedback.
- Small all-caps coral kickers are used only for state and provenance.
- The scale changes decisively between levels; the interface does not rely on a
  stack of same-sized cards.

### Constellation motif

The motif is a thin connective thread with small nodes. It has three jobs only:

1. make the four-question trail finite;
2. connect related question states;
3. occupy otherwise empty shell space without sitting behind reading or writing.

It never becomes a graph to decode, a taxonomy, or a game board.

## Flow

### 1. Home: four worth trying

The returning screen presents one authentic question as the immediate action, with
four visible nodes and a clear endpoint. Recall and a not-yet-covered topic are
small optional surfaces. The home screen does not ask Maya to configure a session
before she can begin.

The featured question is traceable to AQA Combined Science: Trilogy Higher,
Biology Paper 2, November 2021, Q05.5. The date and question number appear before
Maya starts.

### 2. Attempt: paper and response

The attempt screen is a real two-pane iPad workspace:

- the authentic question remains fixed on warm paper;
- the response is in a focused multiline field;
- elapsed time, question position and assistance state are visible;
- `Need a hint?` stays closed until Maya asks;
- `Check answer` is the only dominant action.

The response records that no hint was opened before checking. The UI does not
resemble chat and does not expose the method before the attempt.

### 3. Checked answer: evidence, then another attempt

Feedback quotes the two phrases actually present in Maya's response. It then asks
two concise questions rather than supplying sentences to copy:

- `Name the process that uses oxygen.`
- `Explain what the released energy changes.`

Maya edits the complete answer in place and presses `Recheck answer`. The June 2019
Q01.5 beta-blocker transfer is visible but locked until the recheck succeeds. This
keeps transfer desirable without allowing the app to skip the improvement step.

### 4. Recall: start without setup

Recall opens with a finite promise: `7 Biology cards are due`, about six minutes,
and only topics already covered at school. A real first-card front makes the task
concrete before Maya starts, while keeping its answer hidden. The only up-front
choice is one segmented format row: `Mixed`, `Cards`, or `True or false`.
`Choose topic` and `More options` remain quiet disclosures; `Start review` is the
single dominant action.

### 5. Papers: scarcity made visible

The June 2024 Biology Paper 1 folio shows `0 questions seen` and is explicitly
protected from trails, recall and examples. Starting a full mock is a deliberate
action with a visible consequence: the paper leaves Reserved. Previously used
papers are listed as practice history, not mixed into the untouched paper.

## Operational rules carried by the visual system

- One visually dominant action per screen.
- Authentic paper metadata is visible at decision points, not hidden in details.
- A topic Maya has not covered is neutral and never shown as failure.
- Assistance state and elapsed time remain part of the evidence record.
- Improvement and a successful recheck come before transfer.
- Recall launches from a sensible default instead of a filter or settings grid.
- Untouched papers are protected by data rules, not merely by a visual label.
- The dark shell may be expressive; question, answer and feedback surfaces must
  remain readable, selectable and accessible.

## Build notes

This direction does not require raster cosmic backgrounds. The shell can be built
from a solid colour, a low-opacity noise texture and a few SVG paths. Paper grain
can use a tiny repeating texture. All panels, fields, focus rings, locks, toggles
and buttons should remain semantic application controls with at least 44 px touch
targets. At 4:3 the two-pane attempt is primary; a narrower breakpoint should stack
the paper above the response without changing the task order.

## Generation notes

The five final screens were generated with the built-in ImageGen workflow and then
inspected at full resolution. The prompt set specified: a high-fidelity operational
4:3 iPad UI; the ink, paper, cobalt and coral material system; exact authentic AQA
question copy and provenance; editable answer state; evidence-based coaching; a
locked transfer until recheck; an immediate recall launch with one format row; and
an untouched-paper protection state. Follow-up edits changed only provenance,
student-facing hint language and the amount of help shown in feedback.
