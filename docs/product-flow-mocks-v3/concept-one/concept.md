# Concept One: The Living Paper Observatory

Status: reviewed iPad-first visual direction

Canvas: `1448 × 1086` PNG, exact `4:3`, edge-to-edge with no device frame

## Thesis

Question Constellation should feel like a scientific instrument with a human surface. The app lives
on a deep atmospheric canvas, while authentic exam material appears on warm tactile paper. The
contrast makes the question feel precious and immediate without turning the product into a school
portal or an ornamental campaign page.

The paper is never decoration. It is where the student reads, types, checks, improves, and opens
evidence. The surrounding field carries navigation, state, provenance, and the relationship between
questions.

## Reviewed screens

### 1. Returning home: one irresistible next question

![Returning home with a finite four-question trail](01-home.png)

The home screen resolves the next action in two seconds:

- one authentic question dominates;
- the source sits directly beside it;
- `Try question` is the only primary action;
- the four-question trail shows both variety and a visible ending;
- `Change focus` and `Why this?` remain available without competing with the question;
- top navigation exposes Biology, Progress, and Maya without adding a sidebar or feature grid.

The trail is finite rather than an endless feed. Its luminous thread implies movement, while the
labels make the next ten minutes concrete.

### 2. Attempt: the paper becomes the working surface

![Paper-like answer attempt](02-attempt.png)

The attempt screen is operational rather than illustrative:

- `Trail` returns to the finite session;
- `Question 1 of 4` and the four stations preserve position;
- the timer can be paused;
- the answer field has an active caret, writing guides, word count, and saved state;
- `Use mark checklist` is a static fallback;
- `Check answer` is explicit and dominant;
- `No hints used` records assistance without interrupting the task.

The answer chain and model answer stay hidden until Maya acts.

### 3. Checked answer: one missing move, then improvement

![Checked answer with improvement primary and transfer locked](03-checked.png)

The checked state transforms the submitted answer into visible evidence:

- the score is secondary to four attributable mark-scheme points;
- found points match Maya's actual sentence;
- the missing response is isolated in coral;
- the coaching prompt asks for the missing causal move instead of writing the sentence for her;
- the reusable method is now visible because it has been earned;
- `Improve this answer` is the sole primary action;
- the June 2019 beta-blocker transfer remains visibly locked until the improved answer is checked.

After `Improve this answer`, the paper returns to an editable response with the coaching prompt
pinned above it. A successful recheck changes the locked transfer strip into `Try transfer`.

### 4. Progress: a map with a decision, not a dashboard

![Spatial Biology evidence map](04-progress.png)

The progress screen answers three practical questions: where is the evidence steady, what needs the
next question, and what has school not covered?

- topic nodes are large touch targets on one evidence path;
- selecting Organisation opens a paper lens with independent-versus-hinted evidence;
- `Open evidence` drills into the official topic detail;
- the `6–8` early working range is explicitly qualified by checked answers and taught scope;
- counts reconcile: `6 + 5 + 3 = 14`, across three sampled topics;
- Bioenergetics is `Not sampled`, not weak;
- Homeostasis, Inheritance, and Ecology sit in a physically separate `Later at school` drawer and do
  not affect the range;
- `Covered at school · Edit` and `Update scope` are direct controls.

### 5. Recall launch: seven cards, one decision

![Recall launch with one format choice and a first-card preview](05-recall.png)

The recall launch replaces the old configuration surface with an immediate, inspectable session:

- `7 Biology cards are due` states the finite task;
- the six-minute estimate and `from topics covered at school` line set expectations;
- the first specification-grounded card is visible before Maya starts;
- the card count and source scope stay adjacent to the content;
- `Mixed`, `Cards`, and `True or false` are the only visible choice, with Mixed selected;
- `Choose topic` and `More options` keep custom scope available without exposing a filter wall;
- `Start review` is the sole dominant action;
- the bottom state line confirms `7 cards · covered topics only · due now`.

Starting opens the shown ribosome card directly. The chosen format changes only the interaction mix;
it does not send Maya through another setup step.

## Visual system

### Atmosphere

The base is mineral midnight rather than flat navy. Fine grain, particulate light, and restrained
scientific paths create depth. The field should move almost imperceptibly: slow parallax, a soft pulse
at the current station, and a short traveling glow only when state changes.

### Paper

Warm uncoated paper is the interaction material. It uses a subtle physical edge, soft shadow, and one
coral registration edge. The texture must remain quiet enough for long-form reading. Paper can scale,
settle, or open into a lens, but it should never flip theatrically during an exam response.

### Typography

- High-contrast editorial serif: greetings, questions, prompts, and major evidence.
- Precise humanist sans: navigation, state, metadata, and controls.
- Letter-spaced small caps: provenance, source state, and section labels.

The serif gives questions presence; the sans keeps controls unmistakably functional.

### Colour semantics

- Warm ivory: primary working surface.
- Cyan: evidence found or steady.
- Citron: current position and active focus.
- Coral: the single missing link, paper registration edge, or locked-state emphasis.
- Gray-blue: early or unsampled evidence.

Colour is never the only signal. Every status also has a label or icon.

## Interaction rules

1. One dominant action per state.
2. Minimum `44pt` touch targets on iPad.
3. Authentic source metadata stays adjacent to the item it qualifies.
4. The paper is a real editable or tappable region, never a promotional banner.
5. Transfer unlocks only after improvement and recheck.
6. A student can always inspect why a question was chosen.
7. Not-yet-covered material remains separate from assessed evidence.
8. The same navigation model persists across home, practice, papers, and progress.
9. Recall launches with at most one visible choice before the primary action.

## Motion direction

- Home: the active trail station breathes once when the screen settles; no continuous spectacle.
- Attempt: the paper rises by a few pixels as the keyboard or Pencil input becomes active.
- Checked: found links illuminate in answer order, then the missing link appears once in coral.
- Recheck: the locked transfer strip opens along the same luminous thread, preserving cause and
  effect.
- Progress: selecting a topic moves the paper lens to that node; the map does not pan or zoom without
  a direct gesture.
- Recall: the paper stack settles once; selecting a format moves the citron focus treatment without
  rearranging the page.

All essential meaning remains present when reduced motion is enabled.

## Buildability

The direction can be implemented with ordinary web primitives:

- CSS layered radial gradients and small noise textures for the field;
- SVG paths and nodes for trails and evidence relationships;
- semantic buttons, textareas, disclosure controls, and navigation;
- one paper component with attempt, result, lens, and locked-strip variants;
- CSS transforms and View Transitions for restrained spatial continuity.

It does not depend on video, WebGL, or generated imagery at runtime.

## Deliberate exclusions

- no dashboard grid or equal-weight feature menu;
- no government/public-service visual language;
- no generic chat transcript;
- no points, streaks, mascots, trophies, or celebration effects;
- no abstract chain taxonomy before a concrete question;
- no unqualified predicted grade;
- no penalty for topics not yet covered at school;
- no decorative chart without a student decision attached.

## Image-generation prompt set

The final screens were generated with the built-in ImageGen workflow using five high-fidelity
`ui-mockup` briefs:

1. atmospheric signed-in home with one authentic November 2021 question and a finite orbit trail;
2. operational iPad attempt with typed answer, saved state, timer, checklist, and explicit check;
3. evidence-specific result with one missing link, improvement primary, and locked June 2019
   transfer;
4. spatial progress map with qualified range, reconciled evidence counts, and separate school scope.
5. recall launch with one specification-grounded preview, one format control, and one start action.

The home source copy and progress counts were each revised once after visual and factual inspection.
The recall launch passed the full-size visual and factual review without a revision.
