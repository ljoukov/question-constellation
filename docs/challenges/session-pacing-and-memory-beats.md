# Challenge session pacing and memory beats

Status: implemented experiment, July 2026

## The problem we are solving

The four-step challenge is the strongest part of the experience:

1. compare two plausible answers;
2. diagnose the missing mark;
3. repair the answer;
4. transfer the method to a new question.

It is also a sustained high-output task. Repeating that same emotional and cognitive shape immediately
creates a session made only of peaks. The next challenge may contain different science, but it asks the
learner to settle into exactly the same rhythm.

An anonymised production journey review supports this as a useful working hypothesis, not a settled
causal claim. One recent learner completed three successful rounds in 65–127 seconds each, across
sessions containing one and two completed rounds, then returned for a 12-second browse-only visit.
In the small broader sample, learners who began making challenge decisions generally continued through
the four stages; much of the visible loss happened before the first decision or between rounds. The
sample is small and contains internal/test traffic, so it should guide instrumentation and a product
experiment rather than be treated as proof.

## Design decision

Keep the four-step challenge intact as the high-intensity **peak**. Follow it with an automatically
assigned, 20–90 second **memory beat** made entirely from the question just completed. Then show one
automatically queued challenge and a real stopping checkpoint.

```text
four-step challenge → assigned memory beat → queued challenge
four-step challenge → assigned memory beat → queued challenge
four-step challenge → assigned memory beat → orbit complete
```

Three challenge/beat pairs make one finite “orbit.” The learner chooses the path scope once—Mixed
science, Biology, Chemistry, or Physics—rather than choosing the intensity and next activity after
every round. The interface offers an explicit “finish for now” action before the assigned beat, at
every checkpoint, and again when the orbit is complete.

This borrows the useful part of game and film pacing—contrast between effort levels—without using an
endless feed, random rewards, countdown pressure, streak loss, or unresolved curiosity as a coercive
loop.

## Implemented mechanics

All six beats reuse reviewed challenge content. They need no runtime model call and cannot invent a
quotation, mark-scheme rule, or examiner comment.

| Beat              | Learner action                                                                   | Cognitive intensity | Learning purpose                                          |
| ----------------- | -------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------- |
| **Answer replay** | Reveal a weak answer becoming exam-ready, then inspect the scoring move          | Calm                | Worked-example study and attention to the decisive edit   |
| **Weakness lens** | Classify the exact weakness in the reviewed answer                               | Calm                | Recognise recurring answer problems in a concrete context |
| **Chain echo**    | Complete a curated, unambiguous stem with a one- or two-word answer              | Light               | Short retrieval with immediate feedback and answer reveal |
| **Link order**    | Reorder reviewed answer-chain links with ordinary move controls                  | Light               | Reconstruct causal or procedural sequence                 |
| **Mark sweep**    | Judge three reviewed edits as “earns the missing mark” or “not enough yet”       | Sharp               | Discrimination practice using plausible near-misses       |
| **Reason match**  | Match each reviewed diagnosis to the authored reason that supports or rejects it | Sharp               | Reconnect a judgement to its evidence                     |

The app assigns the beat deterministically through two alternating Calm → Light → Sharp palettes:
Answer replay → Chain echo → Reason match, then Weakness lens → Link order → Mark sweep. A supported
round or hint use still overrides the slot with Answer replay. A score at or below 425 receives the
calm beat for that orbit. The learner never has to decide which intensity is educationally
appropriate, and every completed beat earns the same score.

Chain echo no longer derives its expected answer from an arbitrarily long `memoryHandle` fragment.
Every catalogue challenge has a reviewed prompt in
`src/lib/challenges/data/short-recall-prompts.v1.json`: one stem, one one- or two-word canonical
answer, and a small explicit alias list. The importer pre-generates common transpositions, repeated
or omitted letters, and neighbouring-QWERTY substitutions, then removes variants that collide with
another reviewed accepted answer. Runtime matching is closed-set whole-answer matching; it does not
use substrings, generic stemming, or a model. The same versioned rows are published to
`QUESTION_DB.challenge_short_recall_prompts`, while the checked-in file remains a safe runtime
fallback and an easy review list.

The next challenge is also deterministic. In Mixed science, the planner rotates Biology → Chemistry →
Physics, then filters by completion, prior unfinished work, last-round demand, and a different answer
arc where possible. A weak round prefers a starter; a fluent round can move to standard or stretch.
Single-subject paths never silently broaden to another subject. Catalogue order is only the final,
stable tie-break. The runtime makes no model call.

## Why these mechanics

- Retrieval practice can improve retention and transfer, and feedback strengthens its usefulness.
  Chain echo therefore asks for one tightly prompted term rather than pretending to grade arbitrary
  scientific paraphrases, and immediately resolves errors
  ([Roediger & Butler, 2011](https://pubmed.ncbi.nlm.nih.gov/20951630/);
  [Butler, 2010](https://pubmed.ncbi.nlm.nih.gov/20804289/)).
- Worked examples reduce unnecessary search for novices, while fading can bridge from observation to
  independent solving. Answer replay is intentionally lower-output, but it still directs attention to
  the exact scoring move
  ([Sweller & Cooper, 1985](https://doi.org/10.1207/s1532690xci0201_3);
  [Atkinson, Renkl & Merrill, 2003](https://doi.org/10.1037/0022-0663.95.4.774)).
- Interleaving is most useful when it helps learners distinguish confusable cases; it is not a general
  command to randomise everything. Mark sweep contrasts one sufficient edit with reviewed near-misses
  from the same question
  ([Brunmair & Richter, 2019](https://pubmed.ncbi.nlm.nih.gov/31556629/)).
- A meta-analysis found benefits from offering a bounded set of meaningful choices. The path launcher
  therefore offers four understandable scopes once, while every in-session continuation remains clear
  and automatic
  ([Patall, Cooper & Robinson, 2008](https://pubmed.ncbi.nlm.nih.gov/18298272/)).
- One adult arcade-game experiment found that dynamic demand with short breaks supported flow and
  enjoyment better than constant demand. This is suggestive pacing evidence, not direct evidence for
  GCSE learning or children
  ([Baumann, Lürig & Engeser, 2016](https://doi.org/10.1007/s11031-016-9549-7)).

Spacing research also argues against treating a single long session as sufficient learning. The orbit
can make the current session more varied, but durable recall still requires return visits
([Cepeda et al., 2008](https://doi.org/10.1111/j.1467-9280.2008.02209.x)).

## Reward and sound rules

- A full challenge remains worth 400–500 points.
- Every completed memory beat is worth 50 points.
- A retry never removes points.
- A calm beat is not worth less, so the automatic cadence does not become a disguised difficulty tax.
- Completion screens separate the current round score, the learner's atlas score across unique
  challenges, and the current run score. The round card says explicitly when the personal best
  improved or stayed unchanged.
- The public challenge board ranks cumulative personal-best scores across unique challenges. Replays
  can improve an existing best but cannot create unlimited points, time is never a tie-break, and
  public rows use generated aliases rather than learner names.
- The board prefers a nearer next-rank target over a fixed 500-point landmark and shows a rank move
  immediately after the round when the visible standings make that projection unambiguous.
- A run streak counts consecutive challenge-plus-memory-beat pairs inside the current two-hour run.
  “Run” is deliberate: a calm worked example counts as consolidation, not as proof of mastery. The
  streak has no daily deadline, loss animation, or return penalty.
- Time is still recorded for product diagnosis, but completion screens no longer display a time or a
  best-time reward. Speed is not the learning goal.
- Sounds remain short, semantic, and opt-in: selection, reveal, correct, incorrect, and completion.
  There is no background music or autoplay soundtrack. Irrelevant audio can compete with learning
  material ([Moreno & Mayer, 2000](https://doi.org/10.1037/0022-0663.92.1.117)).

## Child-centred engagement guardrails

Longer productive sessions are an outcome to test, not a reason to remove stopping cues. The design
therefore:

- ends an orbit after three rounds;
- makes “finish for now” a full-sized action before every assigned beat and at every checkpoint, and
  the primary action at 3/3;
- never autoplays or auto-navigates: “automatic” means one offered continuation, not a forced one;
- defaults direct public challenge links to their current subject, so only an explicit Mixed science
  launch crosses subjects;
- gives every learner a personal next-score target alongside the leaderboard—either a reachable next
  rank or a 500-point landmark—so a low public rank is not the only progress signal;
- has no streak loss, daily penalty, public learner names, loot box, or variable-ratio reward;
- does not punish help, retries, or receiving the calm beat;
- keeps the subject page and leave control available throughout.

This is consistent with the ICO Children's Code guidance to support conscious decisions, breaks, and
pause/save tools rather than exploit unconscious bias
([ICO, “Nudge techniques”](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques/)).
Leaderboard effects vary by personality, so the board combines a macro comparison with a personal
micro-goal and keeps ranking independent of speed
([Park & Kim, 2021](https://pubmed.ncbi.nlm.nih.gov/33877049/);
[Antonaci et al., 2019](https://doi.org/10.3390/informatics6030032)).

## Measurement

New events:

- `challenge_scope_selected`
- `challenge_interlude_assigned`
- `challenge_interlude_start`
- `challenge_interlude_reveal`
- `challenge_interlude_decision`
- `challenge_interlude_complete`
- `challenge_next_assigned`
- `challenge_session_checkpoint`
- `challenge_session_decision`
- `challenge_leaderboard_view`

Every challenge and memory-beat event carries `sessionPacing: mixed-orbit-v1`, the path scope, and
`science-path-v1`; memory-beat events also carry the session start, orbit position, and automatic
assignment mode. The browser stores a two-hour, versioned run in session storage containing unique
challenge completions and their completed memory beats. The scope is also carried in each generated
challenge URL so reload and back navigation preserve the one-time choice. Replaying a challenge or
double-firing an event cannot inflate the run.

Primary questions:

1. Is completing a memory beat associated with a higher probability of starting and completing a
   second full challenge than skipping it or the historical pre-rollout journey?
2. Which assigned beat is started and completed after a supported versus fluent round?
3. Do learners voluntarily complete a three-round orbit?
4. On a later visit, do they still succeed on the transfer step or a related challenge?

Guardrails:

- transfer success and first-action rate must not fall;
- help use and retries are diagnostic signals, not failure metrics;
- mobile overflow, accidental taps, and sound opt-in must remain healthy;
- productive actions matter more than raw dwell time.

The first rollout is observational. It can establish funnel shape and generate effect-size estimates,
not a causal lift. Before claiming that the memory beat causes a higher second-round rate, assign a
stable randomized classic-flow control and log that exposure explicitly.

## Independent review passes

Three separate specialist reviews informed the design, followed by sequential learner-persona passes:

- a learning-science/game-mechanics review ranked the mechanics and set the evidence boundaries;
- a journey/analytics review separated first-action loss from between-round fatigue;
- a UX/accessibility review checked autonomy, child-centred stopping cues, sound, motion, and the
  existing angular visual system.

The post-implementation passes represented a competitive fluent learner, a cautious retry-heavy
learner, and a motion-sensitive keyboard/mobile learner. A second independent path review examined
the automatic-flow revision. The strongest shared recommendations were to alternate intensity without
weakening thought, choose scope only once, keep the session finite, show rank movement at the reward
moment, distinguish attempt score from durable atlas score, and avoid calling calm consolidation a
“focus” or mastery streak.

## Deliberately deferred mechanics

- **Reviewed path graph:** an offline model may propose explicit question-family IDs, prerequisite
  edges, and useful cross-subject contrasts. Those suggestions need independent curriculum review and
  a versioned static artifact before runtime use. `science-path-v1` uses existing reviewed metadata and
  remains deterministic.
- **Arbitrary subject combinations:** Mixed science and the three single-subject paths cover the
  clearest needs without a checkbox matrix. The internal scope type can expand later if evidence shows
  that two-subject paths are valuable.

- **Constellation snap:** match a question to a previously seen chain. This needs explicit,
  trustworthy cross-question chain metadata before distractors can be educationally fair.
- **Prediction door:** predict which edit will gain the mark before revealing the examiner outcome.
  Promising, but still close to Mark sweep and not needed for the current six-beat set.
- **Odd link out / method current:** useful future discrimination beats once enough same-topic chains
  are explicitly related.

The current release keeps six bounded mechanics in two deterministic palettes so each remains
measurable without becoming a learner-facing activity menu.
