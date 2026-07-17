# Subject Priority and Challenge Strategy

**Status:** Product and acquisition recommendation

**Evidence snapshot:** 17 July 2026

**Market:** GCSE learners in the United Kingdom

## Executive decision

Question Constellation should build a family of short exam-marking games around one repeatable learning sequence:

> **Choose which answer scores better → find the missing mark point → improve the answer → prove the same link on a new question.**

The recommended subject strategy is:

1. **Biology + Physics are the complete initial wedge.** They reach approximately the same Science learner base but test complementary strengths. Biology makes the promise compelling; Physics makes the result trustworthy. Initial product, content, acquisition, and measurement effort should stay concentrated on these two subjects.
2. **Biology is the public product hero, not a proven SEO winner.** It has the best combination of a large reachable audience, unusually strong quiz interest, relatable questions, and visible causal “missing links.” It makes the product promise easiest to understand and share. A 17 July long-tail audit found measurable broad, Paper 1, and six-mark demand plus prediction-system support for qualified topic wording, but no observed Google-origin Biology landings and inconsistent support for verbose topic-plus-mark-count phrases.
3. **Physics is the scoring control.** It has the cleanest exact-mark mechanics, far more exact-four-mark inventory than Biology in the two extracted source sets compared, and the lowest ambiguity for validating whether the marking experience is trusted.
4. **Chemistry is the natural Science expansion.** Procedures, particle explanations, equations, and observation-to-conclusion chains reuse most of the Biology/Physics interaction system.
5. **Maths is the largest reach opportunity, but it needs a distinct interface.** Its differentiated game is not “guess the answer.” It is “mark the working”: compare two solutions, spot the first wrong step, and recover method marks.
6. **Geography is the strongest first humanities expansion on mechanic fit and current bank readiness.** It combines point-marked questions, developed explanations, data, maps, and transfer between contexts. This is not a claim that it has more demand than History or English.
7. **English Language should come later as a comparison product.** Its large audience is attractive, but longer responses are judged holistically. “Which answer is stronger?” is credible; a literal “missing one mark point” often is not.

This is not a single league table. Three different winners matter:

| Question | Winner | Reason |
|---|---|---|
| Which subject has the greatest search reach? | Maths | Its sampled UK query demand is several times larger than any Science subject. |
| Which subject supports the most reliable exact-mark game? | Physics | Equations, substitutions, units, diagrams, and short explanations produce visible, atomic scoring steps. |
| Which subject best expresses the distinctive product promise? | Biology | A missing causal link is easy to see, repair, remember, and transfer into a different biological context. |

If only one public subject can be launched, choose **Biology**. If the goal is the fastest trustworthy implementation from the present bank, choose **Physics**. The selected initial wedge is **Biology hero + Physics control**. Chemistry and Maths are deliberately outside that wedge: Chemistry is the easiest later extension, while Maths is the largest later opportunity but requires its own renderer.

### Acquisition correction from the long-tail audit

The subject choice and the acquisition mechanism are separate decisions. The follow-up [GCSE Biology Long-Tail Search Demand Audit](./gcse-biology-long-tail-search-demand-audit-2026-07-17.md) establishes that:

- natural query clusters such as `gcse biology questions`, `gcse biology paper 1 quiz`, and `aqa gcse biology 6 mark questions` have measurable vendor-estimated demand; qualified topic exam-question phrases have prediction-system support but unresolved GCSE-specific volume;
- the shorter phrase `osmosis 6 marker` appears as an exact Google UK autocomplete prediction, while `gcse biology osmosis 6 marker` did not; a prediction is behavioral evidence, not proof that a person submitted that exact query;
- nine **unqualified** Biology topic exam-question phrases returned a raw, overlapping 1,010/month upper-bound proxy that can include A-level and other markets;
- eight follow-up GCSE-qualified topic phrases appeared as exact predictions, but the volume endpoint was rate-limited before returning GCSE-specific estimates;
- Question Constellation observed zero Google-origin Biology landings in the full available 11–17 July production analytics history;
- challenge pages were not in the production sitemap and `/challenges` returned 404;
- exact-question long-tail acquisition must therefore be treated as a bounded experiment, not an established source of traffic.

The revised acquisition unit is a **searched topic, mechanic, or readiness hub supported by a small number of excellent question leaves**. “Find the missing mark” remains the differentiated interaction after landing; it is not established search vocabulary.

## Relationship to the existing product

This strategy extends the product model already defined in:

- [Product Methodology](../product-methodology.md)
- [Product Flows](../product-flows.md)
- [Product Journey Research Plan](../product-journey-research-plan.md)
- [Cluster Mechanism and Learning Loop](../cluster-mechanism-and-learning-loop.md)
- [Chain Family Methodology](../chain-family-methodology.md)
- [Extraction Specification](../extraction-spec.md)

The durable product loop remains:

`public question → answer chain → diagnose missing link → improve → transfer`

The challenge layer changes the entry experience, not the learning model. It makes the first encounter:

- immediately understandable;
- playable without an account;
- complete in roughly one minute;
- capable of producing a surprising result;
- easy to continue voluntarily;
- useful enough to work as a search landing page;
- shareable without requiring the recipient to know the brand.

The internal object is still an answer chain. Learner-facing language should use **Question Chains**, **answer chain**, **link**, and **missing link**. “Constellation” can remain the brand and the larger graph model, but it should not be required vocabulary for completing a round.

Any generated or imported challenge content must follow the existing extraction contract for source evidence, atomic question boundaries, grading evidence, chain reconciliation, confidence, review flags, and storage. Challenge formats are views over validated question-bank objects; they are not a parallel content pipeline.

## The product thesis

A static revision page competes with search summaries, generated answers, videos, and existing question banks. A challenge page is less exposed to a static answer because it asks the learner to perform and complete a sequence:

- distinguish a plausible answer from a mark-earning answer;
- predict how an examiner will treat evidence;
- locate the exact break in a reasoning chain;
- edit an answer under a constraint;
- carry the repaired reasoning into a different context.

The promise is therefore not:

> Read our better explanation.

It is:

> **Can you see the mark that most students miss?**

The useful surprise is not merely that an answer scored 2/4. It is that the learner can see why, make a small change, and immediately prove that the change represents understanding rather than copying.

## Challenge formats

The formats below should share the same question, rubric, answer-chain, scoring, repair, and transfer data model. They are different views over the same calibrated content rather than separate products.

### 1. Which answer scores higher?

Show two realistic student answers and ask which earns more marks.

Why it works:

- the first action is a low-friction choice;
- both answers can sound plausible;
- the reveal creates a strong “I missed that too” moment;
- it teaches discrimination before asking for production;
- it is safe for subjects where exact score prediction is harder.

Best subjects: Biology, Physics, Chemistry, Maths, Geography, English Language, History.

Recommended role: **default acquisition format**.

### 2. Find the missing mark point

Show a partial answer and an atomic checklist. Ask the learner to identify the absent idea before revealing it.

Why it works:

- it directly expresses the product’s core promise;
- it makes the mark scheme an interactive object;
- the learner searches the reasoning rather than passively reading;
- it naturally leads into rewriting.

Best subjects: Biology, Physics, Chemistry, Computer Science, short Geography questions.

Recommended role: **default Science learning format**.

### 3. Spot the weak link

Show the answer as a visible reasoning chain and ask where the logic stops being sufficient.

Why it works:

- it teaches causality instead of keyword collection;
- it can distinguish a missing link from an incorrect link;
- it maps directly to transfer questions that preserve the reasoning pattern.

Best subjects: Biology, Chemistry, Physics explanations, Geography, History, Business, Religious Studies.

Recommended role: **bridge between diagnosis and repair**.

### 4. Turn 2/4 into 4/4

Give the learner a realistic partial answer in an editor. Their task is to add only what is necessary to earn full marks.

Why it works:

- the goal is concrete;
- progress is visible;
- preserving the learner’s wording creates ownership;
- the smallest sufficient edit is more educational than replacing the answer;
- before-and-after results make the value of the product obvious.

Best subjects: Biology, Physics, Chemistry, Computer Science, short Geography questions, selected Maths explanations.

Recommended role: **core repair experience**.

### 5. Mark or no mark?

Reveal one sentence, line of working, label, or claim at a time. The learner decides whether it earns the named mark.

Why it works:

- rounds are fast;
- feedback can be exact;
- it teaches the threshold between relevant and creditworthy evidence;
- a sequence of binary decisions creates natural replay.

Best subjects: Physics, Maths, Chemistry, Biology, Computer Science.

Recommended role: **fast daily or mobile round**.

### 6. Guess the mark

Ask the learner to assign a score to a complete student answer before seeing the result.

Why it works:

- prediction creates commitment;
- disagreement is memorable;
- score distributions can eventually become a useful community comparison;
- it gives confident learners an examiner-style challenge.

Limitation:

- it is fragile when assessment is holistic or when several marks depend on judgment;
- a learner can be directionally correct but miss the exact integer;
- presenting uncertain scoring as exact would weaken trust.

Best subjects: Physics, Maths, selected Biology/Chemistry point-marked questions.

Recommended role: **secondary or advanced hook**, not the universal hero.

### 7. Be the examiner

Give the learner an answer, rubric, and evidence-highlighting tool. They award each point and then compare their decision with the calibrated result.

Why it works:

- it makes assessment rules visible;
- it is deeper than guessing a total;
- it can teach why a phrase is insufficient;
- it generates useful disagreement data.

Best subjects: Science, Maths, Computer Science, Geography, short History questions.

Recommended role: **high-engagement mode after the learner understands the basic game**.

### 8. Find the first wrong step

Show a worked solution or reasoning sequence. Ask where the answer first becomes invalid.

Why it works:

- it avoids reducing feedback to the final answer;
- it reveals whether later work deserves follow-through or method credit;
- it makes common misconceptions easy to compare;
- the result can transfer to a near problem with different numbers or context.

Best subjects: Maths, Physics calculations, Chemistry calculations, Computer Science traces.

Recommended role: **primary Maths mechanic and strong quantitative-Science mechanic**.

### 9. Transfer challenge

After repair, conceal the original chain and present a different-context question that requires the same reasoning.

Why it works:

- it distinguishes learning from copying;
- it makes the Question Chain valuable;
- success gives a more credible sense of readiness;
- failure reveals whether the missing link was actually understood.

Best subjects: all subjects when the relationship is a shared scoring pattern rather than shared vocabulary.

Recommended role: **required final step in the learning loop**.

### 10. Paper-readiness sprint

Combine several short rounds across a paper into a 10–20-minute diagnostic. Return strengths, recurring missing links, and recommended next chains.

Why it works:

- it satisfies the larger “test me” intent that a short answer cannot;
- it creates a useful result worth saving;
- it provides a natural destination for broad queries such as “GCSE Biology Paper 1 test”;
- it can aggregate the same calibrated challenge objects rather than requiring a separate content system.

Best subjects: Science, Maths, Geography, Computer Science.

Recommended role: **retention and broader search surface after individual rounds work**.

### 11. Daily challenge and share card

Wrap one calibrated round in a repeatable daily object and generate a result card that invites another person to attempt the same challenge.

Why it works:

- it creates a reason to return;
- it gives creators, tutors, and learners a stable unit to share;
- the recipient lands directly in the interaction rather than on a generic homepage.

Limitation:

- sharing should not interrupt the first learning cycle;
- the card should invite a fresh attempt without revealing the answer.
- streaks should remain an unbuilt, post-validation retention hypothesis until voluntary next-round and return behavior show that the core challenge deserves one.

Recommended role: **distribution and retention wrapper**, not the core mechanic.

## Recommended core sequence

The strongest first-use sequence is:

1. **Answer showdown:** Which answer scores higher?
2. **Missing link:** What exact idea separates the answers?
3. **Repair:** Add the smallest sufficient change.
4. **Transfer:** Use the same link in a new context with the chain concealed.
5. **Continue:** Offer another round, a short readiness sprint, or optional sign-in after value has been demonstrated.

This sequence deliberately moves from recognition to production:

| Stage | Learner action | What it tests |
|---|---|---|
| Showdown | Choose between two answers | Can the learner discriminate quality? |
| Missing link | Identify absent evidence or reasoning | Can the learner diagnose the scoring gap? |
| Repair | Rewrite the partial answer | Can the learner produce the missing link? |
| Transfer | Answer a related question independently | Can the learner carry the pattern into a new context? |

“Guess the exact mark” can be tested as an alternative first action, but it should not replace the sequence until learners demonstrate that exact prediction is both trusted and more engaging.

## What “engaging” means

Search volume does not measure product engagement. “Quiz” demand is a useful directional signal that people are willing to interact, but the product must measure actual behavior.

For this strategy, a strong round should produce:

- fast first action;
- completed reveal;
- voluntary repair;
- transfer start;
- independent transfer success;
- replay or next-round choice;
- low disagreement with marking;
- sharing that creates completed attempts rather than empty clicks.

The primary engagement metric should be:

> **Completed repair-and-transfer cycles per 100 genuine challenge landings.**

Supporting measures:

| Stage | Measure |
|---|---|
| Acquisition | Landing-to-first-action rate |
| Comprehension | Time to first action and reveal completion |
| Diagnosis | Missing-link identification rate |
| Repair | Repair start and completion rate |
| Learning | Independent transfer start and success |
| Retention | Voluntary next round and return rate |
| Distribution | Shared-link recipients who begin a round |
| Trust | Challenge rate, upheld challenge rate, and double-mark agreement |
| Performance | Interaction latency and completion on mobile |

Until those data exist, engagement rankings are hypotheses informed by query behavior and assessment structure, not observed product truth.

## Subject-selection framework

Subjects were assessed on six dimensions:

| Dimension | Weight | Question |
|---|---:|---|
| Atomic scoring | 20% | Can the learner see distinct, independently creditable points or steps? |
| Marking trust | 20% | Can the product explain the result consistently and defensibly? |
| Round speed | 15% | Can a useful challenge be completed quickly on a phone? |
| Transfer quality | 20% | Can the same reasoning be tested in a meaningfully different context? |
| Content QA ease | 15% | Can questions, rubrics, partial answers, and transfers be calibrated efficiently? |
| Shareability | 10% | Does the reveal create a surprising, easy-to-explain hook? |

Each dimension was scored from 1 to 5. The result is a structured product judgment, not a measurement of learner engagement. Particular boards, papers, and question types can shift a subject by roughly one point on an individual dimension.

### Game-fit score

| Rank | Subject | Atomic | Trust | Speed | Transfer | QA ease | Share | Weighted index |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Physics | 5 | 5 | 5 | 5 | 4 | 5 | **4.85** |
| 2 | Maths | 5 | 5 | 5 | 5 | 4 | 4 | **4.75** |
| 3 | Biology / Combined Science | 4 | 4 | 5 | 5 | 4 | 5 | **4.45** |
| 4 | Chemistry | 5 | 4 | 5 | 5 | 3 | 4 | **4.40** |
| 5 | Computer Science | 4 | 4 | 4 | 5 | 4 | 5 | **4.30** |
| 6 | Psychology | 4 | 3 | 4 | 5 | 3 | 5 | **3.95** |
| 7= | Geography | 3 | 3 | 4 | 5 | 3 | 5 | **3.75** |
| 7= | Religious Studies | 3 | 3 | 4 | 5 | 3 | 5 | **3.75** |
| 7= | Business | 3 | 3 | 4 | 5 | 3 | 5 | **3.75** |
| 10 | History | 2 | 2 | 3 | 5 | 2 | 5 | **3.05** |
| 11 | English Language | 2 | 2 | 2 | 5 | 2 | 5 | **2.90** |
| 12 | English Literature | 1 | 1 | 1 | 4 | 1 | 5 | **2.00** |

The weighted index is the arithmetic result of the stated weights, which is why it is displayed to two decimal places. Those decimals do not imply measured precision: every input is a qualitative 1–5 judgment, and a different board or question slice can change a dimension by roughly one point.

Interpretation:

- Physics has the cleanest visible scoring steps, but lower interactive search demand than Biology.
- Maths combines excellent method-mark mechanics with the need for a distinct working renderer.
- Biology has the strongest causal missing-link and shareable-context proposition, but longer answers are less deterministic.
- Chemistry combines procedures, equations, and particle chains while requiring careful control of accepted alternatives.
- Geography, Religious Studies, and Business tie in this broad framework for different reasons; their expansion order requires separate demand and readiness evidence.

The fit score alone does not select the public wedge. Biology is the recommended hero because it combines strong mechanics with stronger observed interactive signals than Physics and a more distinctive, relatable promise.

## UK demand evidence

Demand was triangulated from four sources:

1. signed-in Google Keyword Planner ranges for UK searches;
2. directional point estimates from a public Google-Ads-derived keyword dataset;
3. Google Trends comparisons for the United Kingdom over the latest 12 months;
4. provisional summer 2026 GCSE entry counts for England.

No single source should be treated as exact:

- Keyword Planner returned ranges rather than point estimates because the account did not have the campaign activity required for detailed volumes.
- The public point estimates are 12-month averages and suppress very small queries.
- Related keywords overlap, so totals are comparative indicators rather than unique people.
- Google Trends is sampled and normalized within each comparison set.
- Exam entries measure the eligible cohort, not intent to use this product.
- GCSE demand is highly seasonal and rises sharply near exams.

### Long-tail query correction

The broad subject comparison does not by itself prove that learners search for a page such as “GCSE Biology osmosis six marker.” A separate UK-localized audit on 17 July 2026 tested 39 purposively selected exact phrases:

- 29 appeared as exact Google UK autocomplete predictions;
- 17 returned directional monthly estimates;
- 12 had an exact prediction but no usable volume;
- 10 had neither an exact prediction nor a usable volume.

The set was built from the user’s example, nearby topic variants, mechanic formulations, Paper 1 and mark-scheme terms, broad practice terms, and nine topic seeds. It was not random or exhaustive, so these proportions describe only the diagnostic set and must not be generalized to all possible long-tail phrases.

The most decision-relevant measured examples were:

| Query | Exact Google UK prediction | Directional UK searches/month |
|---|---:|---:|
| `gcse biology osmosis 6 marker` | No | Not reported |
| `osmosis 6 marker` | Yes | Not reported |
| `gcse biology osmosis exam questions` | Yes | Not reported |
| `osmosis exam questions` | Yes | 70 |
| `aqa gcse biology 6 mark questions` | Yes | 70 |
| `gcse biology paper 1 quiz` | Yes | 70 |
| `cell biology exam questions` | Yes | 320, level ambiguous |
| `homeostasis exam questions` | Yes | 170, level ambiguous |
| `infection and response exam questions` | Yes | 140, level ambiguous |
| `photosynthesis exam questions` | Yes | 110, level ambiguous |

Autocomplete is evidence that the wording occurs in Google’s prediction system, not proof that a person submitted the exact phrase or a monthly user count. The point estimates may contain close variants and overlap. Eight follow-up GCSE-qualified topic phrases were exact predictions, but their volume requests returned HTTP 429; the 30–320/month topic values above are therefore wider Biology-market upper-bound proxies, not GCSE counts. The result supports hub-level testing and natural short formulations; it does not support generating a large page estate from every verbose topic × mark-count combination. Full methodology, the saved query dataset, executable first-party SQL, Student Room behavior, competition, and pilot gates are in the [long-tail audit](./gcse-biology-long-tail-search-demand-audit-2026-07-17.md).

### Signed-in Google Keyword Planner ranges

The following monthly UK ranges were observed:

| Subject | Questions | Quiz | Test | Past papers | Revision |
|---|---:|---:|---:|---:|---:|
| Maths | 1K–10K | 100–1K | 1K–10K | 10K–100K | 1K–10K |
| Biology | 100–1K | 100–1K | 100–1K | 1K–10K | 1K–10K |
| Chemistry | 100–1K | 100–1K | 100–1K | 1K–10K | 1K–10K |
| Physics | 100–1K | 100–1K | 10–100 | 1K–10K | 1K–10K |
| English Language | 100–1K | 100–1K | 100–1K | 1K–10K | 1K–10K |
| Geography | 100–1K | 100–1K | 10–100 | 1K–10K | 100–1K |
| History | 100–1K | 100–1K | 10–100 | 1K–10K | 100–1K |
| Computer Science | 100–1K | 10–100 | 10–100 | 1K–10K | 100–1K |
| Business | 10–100 or below | 10–100 or below | 10–100 or below | 100–1K | 100–1K |
| Psychology | 10–100 or below | 10–100 or below | 10–100 or below | 100–1K | 100–1K |
| Religious Studies | 10–100 | 10–100 | below range | 1K–10K | 100–1K |

The ranges establish the broad shape:

- Maths is in a different reach tier.
- Biology and Chemistry occupy the same displayed ranges for every sampled term, while Physics has a lower displayed range for `test`; Keyword Planner ranges alone do not order Biology and Chemistry.
- all three Sciences have meaningful past-paper and revision demand;
- English Language has a large broad audience, but this does not guarantee fit with exact-mark games;
- humanities and Computer Science remain viable, but their initial searchable interaction pools are smaller.

Google explains how Keyword Planner forecasts and historical metrics are produced in its [Keyword Planner documentation](https://support.google.com/google-ads/answer/3022575?hl=en).

### Directional monthly point estimates

The point estimates below are useful for rough ratios among fully reported rows. An em dash means that the source did not return a value, not that the query is never searched. Totals containing an em dash are shown as lower bounds or as not reported.

“Questions + quiz + test” is the simple sum of those three terms. It is a practice-resource proxy, not proof that every searcher prefers an interactive page. “Broad sampled” adds `past papers + revision`. These sums contain overlap and must not be read as a market size.

The values came from the public `api.seodata.dev` keyword endpoint, retrieved on 16 July 2026 with `country=gb`. The provider describes its values as Google-Ads-derived 12-month averages. Values below are shown as returned without additional rounding. The endpoint does not document match type or close-variant treatment, so these figures are a directional cross-check of the signed-in Planner ranges, not forecasts or unique-user counts. An example response is the [`GCSE Biology quiz` UK query](https://api.seodata.dev/v1/keyword?q=gcse%20biology%20quiz&country=gb).

| Subject | Questions | Quiz | Test | Questions + quiz + test | Past papers | Revision | Broad sampled |
|---|---:|---:|---:|---:|---:|---:|---:|
| Maths | 5,400 | 1,000 | 1,600 | 8,000 | 27,100 | 3,600 | 38,700 |
| Biology | 880 | 880 | 210 | 1,970 | 4,400 | 1,600 | 7,970 |
| English Language | 720 | 260 | 880 | 1,860 | 6,600 | 2,400 | 10,860 |
| Chemistry | 590 | 480 | 170 | 1,240 | 3,600 | 1,300 | 6,140 |
| Geography | 260 | 480 | 90 | 830 | 3,600 | 1,300 | 5,730 |
| Physics | 390 | 320 | 110 | 820 | 3,600 | 1,300 | 5,720 |
| History | 260 | 320 | — | ≥580 | 3,600 | 880 | ≥5,060 |
| Computer Science | 140 | 90 | — | ≥230 | 1,900 | 390 | ≥2,520 |
| English Literature | 110 | — | — | ≥110 | 2,400 | 480 | ≥2,990 |
| Religious Studies | 70 | 50 | — | ≥120 | 1,000 | 210 | ≥1,330 |
| Psychology | — | — | — | Not reported | 880 | 480 | ≥1,360 |
| Business | — | — | — | Not reported | 880 | 210 | ≥1,090 |
| Combined Science | — | — | — | Not reported | 1,600 | 110 | ≥1,710 |

Key implications:

- Maths has approximately four times Biology’s sampled question/quiz/test demand and nearly five times its broad sampled total.
- In this point-estimate source, Biology has the strongest Science question/quiz/test pool: about 1.6 times Chemistry and 2.4 times Physics.
- Biology’s quiz query alone is estimated at 880 searches, 88% of the Maths quiz estimate despite Maths having a much larger overall search market.
- English Language has reach, but much of the assessment does not support literal atomic mark-point games.
- Geography slightly exceeds Physics in this one point-estimate sample because of quiz demand. This does not establish a stable Geography-versus-History demand ranking.
- Reported “Combined Science” head terms are weaker than the component subjects, while several question/quiz/test values are suppressed rather than zero. Combined Science should remain a qualification and course filter while public pages lead with Biology, Chemistry, or Physics.

### Quiz-intent share as an engagement proxy

Quiz demand is not product engagement, but a high share suggests that the audience is already looking for an interaction rather than only a resource. The table includes only subjects for which all three component values were returned; no suppressed value is treated as zero.

| Subject | Quiz estimate | Quiz share of questions + quiz + test |
|---|---:|---:|
| Geography | 480 | 57.8% |
| Biology | 880 | 44.7% |
| Physics | 320 | 39.0% |
| Chemistry | 480 | 38.7% |
| English Language | 260 | 14.0% |
| Maths | 1,000 | 12.5% |

Within this source, Biology is the most attractive combination of absolute quiz volume and strong quiz share. Geography has a high share from a smaller base. Maths has the largest absolute quiz volume, but its much larger question/test demand means the product must compete on a sharper mechanic than “take a quiz.”

The sources disagree on some within-category ordering. Google Trends places the normalized `GCSE Biology quiz` series above `GCSE Maths quiz`, while the point estimates place Maths slightly above Biology. Trends also placed History above Geography for quiz interest in the captured comparison, while the point estimates reverse them. Trends is sampled and normalized within a set; the point source attempts absolute averages with undocumented matching. The stable conclusions are therefore narrower:

- Maths is the broad reach leader.
- Biology has unusually strong quiz interest relative to its broad subject demand.
- Biology and Physics form a large Science wedge with complementary mechanics.
- the research does not establish a reliable demand order between Geography and History.

### Google Trends

Google Trends comparisons for the UK over the latest 12 months produced the following relative averages within their respective query sets.

Subject query set:

| Query | Relative average |
|---|---:|
| GCSE Maths | 30 |
| GCSE Biology | 13 |
| GCSE Physics | approximately 12 |
| GCSE Chemistry | 10 |
| GCSE English Language | 6 |

[Open the subject comparison](https://trends.google.com/trends/explore?date=today%2012-m&geo=GB&q=gcse%20maths,gcse%20biology,gcse%20chemistry,gcse%20physics,gcse%20english%20language)

Quiz query set:

| Query | Relative average |
|---|---:|
| GCSE Biology quiz | 8 |
| GCSE Maths quiz | 4 |
| GCSE Chemistry quiz | 3 |
| GCSE English quiz | 3 |
| GCSE Physics quiz | 2 |

[Open the quiz comparison](https://trends.google.com/trends/explore?date=today%2012-m&geo=GB&q=gcse%20maths%20quiz,gcse%20biology%20quiz,gcse%20chemistry%20quiz,gcse%20physics%20quiz,gcse%20english%20quiz)

The English term in this set is the broad `GCSE English quiz`, not an English Language-specific query. The values are normalized within each comparison and cannot be compared across the two tables. They support two conclusions:

- Maths is the broad reach leader.
- Biology over-indexes on quiz-style interest relative to its general subject demand.

Past-paper query set:

| Query | Relative average |
|---|---:|
| GCSE Maths past papers | 38 |
| GCSE English past papers | 18 |
| GCSE Biology past papers | 10 |
| GCSE Chemistry past papers | 8 |
| GCSE Physics past papers | 8 |

[Open the past-paper comparison](https://trends.google.com/trends/explore?date=today%2012-m&geo=GB&q=gcse%20maths%20past%20papers,gcse%20english%20past%20papers,gcse%20biology%20past%20papers,gcse%20chemistry%20past%20papers,gcse%20physics%20past%20papers)

Humanities comparison set:

| Query | Relative average |
|---|---:|
| GCSE Maths | 30 |
| GCSE History | 7 |
| GCSE Geography | 7 |
| GCSE English Literature | 3 |
| GCSE Computer Science | 2 |

[Open the humanities comparison](https://trends.google.com/trends/explore?date=today%2012-m&geo=GB&q=gcse%20maths,gcse%20history,gcse%20geography,gcse%20english%20literature,gcse%20computer%20science)

Broad naming set:

| Query | Relative average |
|---|---:|
| GCSE Maths | 30 |
| GCSE English | 18 |
| GCSE Science | 11 |
| GCSE Combined Science | 3 |
| GCSE English Literature | 3 |

[Open the naming comparison](https://trends.google.com/trends/explore?date=today%2012-m&geo=GB&q=gcse%20maths,gcse%20english,gcse%20science,gcse%20combined%20science,gcse%20english%20literature)

Together, these comparisons show:

- past-paper interest is led by Maths, followed by English and Biology, with Chemistry and Physics tied in the captured average;
- among the compared humanities terms, History and Geography are similar and both exceed English Literature and Computer Science;
- “GCSE Science” is materially stronger than “GCSE Combined Science,” while the component-science names remain useful public entry points.

### Eligible learner audience

Keyword Planner and Trends above use Great Britain/UK geography. Ofqual’s cohort data covers England only, so the two denominators are not coextensive. Maths and English entries also include more post-16 resit candidates than optional subjects, which makes raw cross-subject entry comparisons imperfect.

Ofqual’s provisional summer 2026 entries for England, based on the 15 April snapshot and rounded to the nearest five, reported:

| Subject | Provisional entries |
|---|---:|
| Combined Science | 951,510 |
| Maths | 876,955 |
| English Language | 844,455 |
| English Literature | 620,420 |
| History | 295,095 |
| Geography | 289,615 |
| Biology | 169,915 |
| Chemistry | 161,400 |
| Physics | 161,305 |
| Computing | 83,330 |

Combined Science entries are counted twice because the qualification awards two GCSE grades. A rough learner estimate is therefore 475,755. Adding separate-science entries gives an approximate addressable learner audience of:

- Biology content: 475,755 + 169,915 = **645,670** learners;
- Chemistry content: 475,755 + 161,400 = **637,155** learners;
- Physics content: 475,755 + 161,305 = **637,060** learners.

These are approximate subject audiences, not deduplicated users or traffic forecasts. They show why leading with a component Science does not mean serving only separate-science learners.

Source: [Ofqual provisional entries for GCSE, AS and A level, summer 2026](https://www.gov.uk/government/statistics/provisional-entries-for-gcse-as-and-a-level-summer-2026-exam-series/provisional-entries-for-gcse-as-and-a-level-summer-2026-exam-series).

## Subject-by-subject recommendation

### Biology: public hero

Biology is the strongest expression of the product’s identity.

Why:

- many mark-earning answers are causal chains;
- a missing middle step can sound obvious after reveal while remaining genuinely diagnostic before reveal;
- contexts such as exercise, infection, circulation, gas exchange, enzymes, plants, and homeostasis are easy to visualize and share;
- one chain transfers naturally across organisms, organs, conditions, and experimental contexts;
- Biology has the strongest observed Science quiz demand;
- the approximate audience includes both Combined Science and separate Biology learners.

Ideal mechanics:

- which answer scores higher;
- find the missing mark point;
- spot the weak link;
- turn 2/4 into 4/4;
- transfer into a different biological context.

Content constraint:

- use carefully calibrated point-marked 2–4-mark questions for exact-score games;
- for longer explanations, show evidence by rubric item and communicate uncertainty rather than pretending every answer has one indisputable integer score;
- transfer questions must reuse the scoring chain, not merely the same vocabulary.

Example round:

1. Show two answers to why breathing rate increases during exercise.
2. Ask which one earns more marks.
3. Reveal that both mention oxygen, but only one links oxygen to increased aerobic respiration and energy release.
4. Ask the learner to add the missing causal link to the partial answer.
5. Transfer to a question about increased blood flow to muscle or recovery after exercise.

### Physics: scoring control and fastest reliable engine

Physics is the strongest subject for proving that the marking interaction can be trusted.

Why:

- calculations expose equation choice, substitution, rearrangement, evaluation, unit, and significant-figure steps;
- short explanations and diagrams often have explicit points;
- the first wrong step is visible;
- the product can distinguish method from final accuracy;
- near-transfer questions can change numbers while exam-transfer questions change the physical context.

Ideal mechanics:

- find the first wrong step;
- mark or no mark;
- guess the mark;
- compare two workings;
- recover the missing unit or method step;
- transfer with different values or context.

Example round:

1. Show two students with the same final numerical answer but different working.
2. Ask which solution earns more marks.
3. Reveal the equation, substitution, calculation, and unit marks.
4. Ask the learner to repair the weaker working.
5. Transfer to a different context using the same equation structure.

Physics should be used as the control in early experiments: if learners do not trust or complete Physics rounds, the problem is likely the interaction or content calibration rather than the inherent ambiguity of the subject.

### Chemistry: reuse the Science shell

Chemistry combines the verbal-chain strengths of Biology with some of the stepwise precision of Physics.

Why:

- practical methods have ordered steps and control variables;
- particle explanations have causal links;
- equations and calculations have visible stages;
- observations must be connected to conclusions;
- many misconceptions are compact and repeatable.

Ideal mechanics:

- missing practical step;
- which explanation scores higher;
- particle-level weak link;
- first wrong calculation step;
- equation completion;
- transfer between laboratory and unfamiliar contexts.

Content constraint:

- accepted alternatives and state-specific wording must be explicit;
- avoid rounds where the difference is merely a memorized phrase with no transferable reasoning.

### Maths: largest reach, separate “mark the working” product

Maths has the largest demand, but a generic quiz would enter the most crowded part of the market. The differentiated promise is:

> **The final answer is not the whole mark. Can you mark the working?**

Why:

- method, process, accuracy, follow-through, and special-case marks create a rich game;
- a correct answer can have insufficient working;
- an incorrect final answer can still contain valuable method;
- comparing solutions teaches exam technique and mathematical structure simultaneously;
- “first wrong step” is instantly understandable.

Ideal hooks:

- “This answer is correct but gets 0/3. Why?”
- “Same final answer: which student earns more marks?”
- “One line turns 2/4 into 4/4.”
- “Where does this proof first fail?”

Initial scope:

- typed 2–5-mark arithmetic, algebra, ratio, probability, and selected geometry;
- deterministic layouts where each line can be inspected;
- paired worked solutions and repair;
- near transfer with changed values, followed by exam transfer with changed framing.

Defer until the typed interaction works:

- handwriting recognition;
- freehand constructions;
- graph drawing;
- long proofs with many equivalent routes;
- questions where presentation cannot be evaluated without a richer input surface.

Maths should be tested as a separate experience rather than forced into the exact Science answer editor.

### Geography: best humanities expansion by mechanic fit and readiness

Geography is the strongest rapid humanities candidate on product mechanics and current bank depth, not on a proven traffic lead. It spans:

- point-marked short answers;
- developed explanation chains;
- data and graph interpretation;
- map and figure evidence;
- physical and human processes;
- unfamiliar-context transfer.

Ideal mechanics:

- choose the developed answer;
- add the missing data reference;
- distinguish a point from a developed point;
- spot the causal weak link;
- transfer a process to a new place or resource.

The main constraint is assessment mixture. Short and medium point-marked items can use exact evidence. Longer level-based responses should use comparison and likely band/range rather than a fake atomic checklist.

### Computer Science: excellent mechanics, smaller audience

Computer Science has unusually strong game fit:

- code traces;
- bug location;
- logic and Boolean reasoning;
- SQL;
- algorithms;
- binary and data calculations.

It supports “first wrong step,” “which output,” “mark the trace,” and “repair the algorithm” extremely well. The limiting factors are the smaller cohort, lower query demand, and the effort required to keep content aligned during specification changes.

It is a good later high-retention subject once the core challenge system is stable.

### English Language: comparison, not atomic scoring

English Language has a large audience and strong broad demand. It should not initially be framed as “find the one missing mark point” for long responses.

Better mechanics:

- which answer is stronger;
- which quotation is better used;
- where does analysis become explanation;
- spot the unsupported claim;
- improve one scoring move;
- compare likely level or score range.

The product should reveal the qualities that distinguish answers—selection of evidence, analysis, structure, clarity, and adaptation to purpose—without claiming that every quality maps to one independent mark.

The paired-answer mechanic may be especially strong because learners often struggle to understand the difference between two plausible responses.

### History: engaging examiner mode, heavier calibration

History offers recurring chains around:

- causation;
- consequence;
- change and continuity;
- significance;
- comparison;
- evidence and interpretation.

Good formats:

- which explanation is more developed;
- find the unsupported link;
- identify the factor that answers the question;
- be the examiner on a short response.

The valid-answer space is broad, option structures vary, and longer responses require substantial subject-specific judgment. History is therefore better as a comparison and discussion product after the Science engine is proven.

### English Literature: paired comparison only

English Literature essays are not naturally decomposed into atomic independent marks. The useful product is:

- compare two paragraphs;
- identify the stronger interpretation;
- improve evidence integration;
- find where analysis becomes generic;
- transfer an analytical move to a different extract.

It should not be an early exact-scoring subject.

### Business and Religious Studies: strong chains, lower reach

Business frequently follows:

`point → development → application to case → consequence`

Religious Studies frequently follows:

`claim → explanation → teaching/source → application or evaluation`

Both can produce satisfying missing-link rounds. Their lower demand and higher context-specific calibration load make them later opportunities rather than the initial public wedge.

### Psychology: promising scenarios, lower demand

Psychology can use relatable scenarios, study design, evaluation, and research-method transfer. It is likely engaging for the learners who take it, but the observed search pool is smaller than the leading subjects. It is a promising expansion once the content engine can efficiently calibrate context-specific alternatives.

## Current Question Constellation readiness

The present production inventory changes the order in which subjects can be tested. Counts below refer to published, non-review questions in the current database snapshot.

### Published question inventory

| Subject | Published questions | Questions worth 4–6 marks |
|---|---:|---:|
| Geography | 507 | 108 |
| Physics | 444 | 86 |
| History | 355 | 84 |
| English Literature | 255 | 0 |
| Computer Science | 228 | 25 |
| Biology | 213 | 39 |
| Chemistry | 191 | 27 |
| English Language | 116 | 13 |

### Published Question Chain depth

| Subject | Published chains | Multi-question chains | Chains with 3+ questions | Largest chain |
|---|---:|---:|---:|---:|
| Geography | 364 | 67 | 40 | 10 |
| Physics | 270 | 60 | 27 | 7 |
| Biology | 190 | 17 | 2 | 7 |
| Computer Science | 186 | 31 | 9 | 4 |
| Chemistry | 158 | 23 | 9 | 4 |
| History | 115 | 31 | 20 | 48 |
| English Language | 90 | 20 | 3 | 5 |
| English Literature | 70 | 51 | 51 | 10 |

Interpretation:

- **Physics and Geography are the most implementation-ready** for multi-question challenge and transfer tests.
- **Biology has the strongest public hook but insufficient chain depth.** It needs deliberate regrouping or new generation at the chain level.
- **Chemistry and Computer Science have usable early chain sets** but less depth.
- **English Literature’s large chains do not imply exact-scoring suitability.** Inventory quantity cannot substitute for mechanic fit.
- **History’s largest chain is probably too broad to act as one precise transfer object.** Large families should be split when they do not share the same missing link.

### Extracted source inventory

The current extracted-question files contain:

| Subject | Files | Questions | Questions worth 4 marks exactly | Questions worth 4 marks or fewer |
|---|---:|---:|---:|---:|
| Physics | 13 | 373 | 42 | 339 (90.9%) |
| Biology | 3 | 130 | 6 | 117 (90.0%) |

Physics therefore has about seven times as many exact four-mark extracted questions as Biology. This is a material reason to use Physics as the rapid scoring-control build while creating a smaller, higher-quality Biology hero set.

## Product architecture

### One shared challenge object

Every challenge should be generated from a versioned object containing:

- subject, board, qualification, tier, paper, topic, marks, and command word;
- original question;
- answer-chain identifier;
- atomic rubric items where the assessment permits them;
- accepted evidence and known insufficient evidence;
- full-credit answer;
- realistic partial answers at intended scores;
- common misconception or omission;
- chain-fit rationale;
- transfer questions at `near`, `stretch`, and `exam transfer`;
- marking-confidence rules;
- validation status and calibration evidence;
- challenge formats that are safe for this item.

The same object can power:

- a search landing page;
- an answer showdown;
- a missing-link round;
- an answer-repair editor;
- a transfer question;
- a readiness sprint;
- a daily challenge;
- a worksheet or creator link.

### One Science shell

Biology, Physics, and Chemistry should share:

- page structure;
- question metadata;
- paired-answer selection;
- evidence highlighting;
- rubric reveal;
- repair editor;
- before-and-after comparison;
- transfer transition;
- anonymous progress state;
- optional sign-in after value.

The content determines which mechanics are enabled. For example:

- Biology favors causal links.
- Physics favors working and first-wrong-step.
- Chemistry mixes procedures, equations, and causal explanations.

### Combined Science as a filter

“Combined Science” describes the learner’s qualification, but it is not the most useful public content taxonomy.

Use it for:

- qualification and tier selection;
- coverage and readiness reporting;
- Paper 1/Paper 2 sprint composition;
- filtering questions appropriate to the learner;
- saving a learner’s course context.

Lead public pages with the component subject and topic:

- Biology: respiration;
- Chemistry: rates of reaction;
- Physics: energy transfers.

This matches how learners understand the immediate question and how demand appears in search.

### Separate Maths renderer

Maths should reuse the challenge framework but have a renderer for:

- aligned lines of working;
- selectable steps;
- equation and expression formatting;
- marking annotations beside individual lines;
- comparison of two solutions;
- follow-through from an earlier error;
- repair of one or more steps.

Forcing Maths into a prose answer box would erase the mechanic that makes it distinctive.

### Comparison mode for holistic subjects

For English and longer humanities responses:

- use paired answers;
- ask for the stronger response or stronger paragraph;
- identify one scoring move;
- show likely range or level only when calibrated;
- explain uncertainty;
- avoid implying that every sentence corresponds to an independent mark.

The shared value is still learning to see answer quality. The scoring interface must match the subject’s assessment structure.

## Canonical challenge-page experience

Every indexable challenge page should contain a complete useful experience in server-rendered HTML and progressively enhance into the interaction.

### Before interaction

Show:

- board, qualification, tier, paper, topic, marks, and command word;
- the question;
- two realistic answers or one realistic partial answer;
- one obvious action;
- no required account;
- no generic dashboard detour.

### First action

Use one of:

- “Which answer scores higher?”
- “How many marks would this earn?”
- “Which line does not earn the mark?”
- “Where is the first wrong step?”
- “What is the missing link?”

The first action should be possible without typing when the learner lands from search or a shared link. Typing begins after the first reveal, once the value is understood.

### Reveal

Show:

- earned mark points;
- exact evidence from the answer;
- missing or insufficient evidence;
- why the wording does or does not earn credit;
- confidence or review-needed state where relevant.

The reveal should answer:

> What, precisely, separates these two plausible answers?

### Repair

Preserve the partial answer and ask the learner to add the missing link.

Requirements:

- do not replace the answer with model-written prose before the learner retries;
- highlight the learner’s additions after recheck;
- show newly earned rubric items;
- keep the original visible for comparison;
- accept semantically valid alternatives;
- let the learner challenge a result.

After the learner completes the repair, reveal the full Question Chain as the concise memory object they have earned. The initial reveal may identify the local missing link needed for guided repair, but it should not expose the full reusable chain before the learner acts.

### Transfer

After a successful repair:

- collapse the original chain;
- present a different-context question using the same scoring pattern;
- do not explain the relationship before the attempt;
- measure independent success;
- explain the shared link after the attempt.

### Continue

Offer, in order:

1. another round in the same chain;
2. a short topic or paper-readiness sprint;
3. optional sign-in to save the improvement and receive a later transfer;
4. a share action that does not reveal the answer.

The learning loop should complete before any account requirement.

## Subject-specific first experiences

### Biology hero page

Suggested promise:

> **Both answers mention oxygen. Only one gets 4/4. Can you spot the missing link?**

Flow:

1. learner chooses the higher-scoring answer;
2. evidence is highlighted;
3. learner selects or writes the causal link;
4. learner repairs the 2/4 answer;
5. learner transfers the chain into a new physiological or experimental context.

### Physics control page

Suggested promise:

> **The final number is right. Why does this working still lose a mark?**

Flow:

1. learner compares two worked solutions;
2. learner selects the first missing or invalid step;
3. equation, substitution, calculation, and unit evidence are revealed;
4. learner repairs the working;
5. learner solves a near problem with different values.

### Later Maths experiment page

Suggested promise:

> **Same answer. Different marks. Can you mark the working?**

Flow:

1. learner selects the stronger solution;
2. individual lines receive method/process/accuracy annotations;
3. learner repairs the weaker method;
4. learner solves a structurally similar question;
5. the result reports method quality as well as correctness.

### Geography expansion page

Suggested promise:

> **Both answers make a valid point. Only one develops it. Which one?**

Flow:

1. compare two short explanations;
2. distinguish a point from a developed point;
3. add data, process, or consequence;
4. transfer the reasoning to a different place, figure, or resource.

### English Language comparison page

Suggested promise:

> **Both paragraphs use the quotation. Which one actually analyses it?**

Flow:

1. choose the stronger paragraph;
2. identify the analytical move;
3. improve one sentence;
4. apply the move to a new extract.

This is a paired-quality game, not a literal atomic-mark game.

## Acquisition strategy

### Acquisition principle

Do not ask search to rank a generic AI revision site. Publish the best interactive result for a concrete exam task.

The landing page must be useful before the learner knows the brand:

- it starts with a real question;
- the learner can act immediately;
- the answer is not spoiled before the attempt;
- the reveal is more precise than a static model answer;
- the page ends in repair and transfer rather than another article.

Participatory intent may be less exposed than static answer intent, but it is not immune to generated search results. Search products can generate questions, explanations, and feedback; the advantage must come from a better calibrated interaction and learning loop.

A one-time unpersonalized UK search snapshot on 16 July 2026 found:

- no AI Overview on the sampled generic `GCSE ... questions` results for Maths, Biology, Chemistry, or Physics;
- an AI Overview on the sampled generic question results for English Language, English Literature, History, Geography, and Computer Science;
- no AI Overview on the explicit quiz queries checked.

This was a query-, location-, and time-dependent observation, not a forecast. It supports testing participatory query clusters, but it does not guarantee clicks or durable search visibility.

The most relevant participatory intents are:

- test me;
- mark this;
- compare these answers;
- find my weak point;
- am I ready;
- give me another question;
- show where my working loses marks.

### Search architecture

Build around three page layers.

#### 1. Topic and mechanic hubs

Curated groups such as:

- AQA GCSE Biology six-mark questions;
- GCSE Biology osmosis exam questions;
- GCSE Biology required-practical questions;
- GCSE Physics method-mark challenges;
- GCSE Maths mark-the-working questions;
- GCSE Geography developed-answer challenges.

These are the primary SEO unit. The hub should contain playable previews and clear paths into complete rounds, not only link lists. Search-facing titles should use observed language; the missing-mark interaction should become clear on the page.

#### 2. Readiness sprints

Broader tool pages:

- AQA GCSE Biology Paper 1 practice test or quiz;
- AQA Physics calculation diagnostic;
- GCSE Maths method-mark diagnostic;
- am I ready for Combined Science Paper 1?

These aggregate calibrated rounds into a meaningful result and address “test me” intent that a static answer cannot satisfy.

#### 3. Challenge leaves

One complete interactive round:

- `Find the missing mark point: respiration`
- `Which energy calculation gets 3/3?`
- `Mark the working: simultaneous equations`
- `Which geography answer is developed?`

These pages support the hubs and are the primary share destination. Publish only leaves with a complete attempt, evidence reveal, repair, transfer, and stable canonical URL. The long-tail audit supports testing a small leaf set; it does not support programmatic topic × mark-count expansion.

### Query priorities

The 17 July audit adds exact-prediction and directional-volume evidence to the earlier head-term research. The initial Biology portfolio should use the following order:

| Priority | Query family | Evidence | Role |
|---|---|---|---|
| 1 | GCSE Biology Paper 1 quiz | the exact phrase was a prediction with a 70/month estimate; adding AQA or “practice test” is an adjacent product-fit hypothesis, not the measured phrase | readiness hub |
| 1 | AQA GCSE Biology six-mark questions | exact predictions; `aqa gcse biology 6 mark questions` estimated at 70/month | mechanic hub |
| 1 | GCSE Biology osmosis and required-practical questions | multiple qualified exact predictions; the adjacent unqualified `osmosis exam questions` estimate was 70/month and is only an upper-bound proxy | topic hub and a few calibrated leaves |
| 2 | GCSE Biology exam questions | exact prediction; 140/month estimate, with a close reverse-order variant also reported at 140 | broad question hub |
| Validate before prioritizing | GCSE-qualified Cell Biology, Homeostasis, Infection and Response, Photosynthesis, Bioenergetics, and Ecology questions | every tested qualified phrase was an exact prediction; the volume endpoint returned HTTP 429. Adjacent unqualified estimates ranged from 30 to 320/month but can include other levels | second-wave topic candidates |
| Avoid as a lead | generic or year-specific mark schemes and PDFs | document/archive intent and stronger incumbents | support only when necessary for source context |
| Do not target as a keyword | `find the missing mark Biology` | no relevant result in the representative audit | product hook after landing |

The nine unqualified topic exam-question phrases have a raw 1,010/month upper-bound proxy for the wider Biology market, not GCSE-specific demand. The three narrow initial phrases with point estimates—AQA six-mark questions, unqualified osmosis exam questions, and Biology Paper 1 quiz—sum to 210 per month. Both totals contain overlap; the latter also contains one level-ambiguous term. Neither is a unique-user or traffic forecast.

Exact leaves should use the shortest natural formulation supported by the evidence. For example, `osmosis 6 marker` appeared in Google’s prediction system, while `gcse biology osmosis 6 marker` did not. This suggests wording to test; it does not prove an exact-query user count.

Measured Physics head-term families:

- GCSE Physics questions;
- GCSE Physics quiz;
- GCSE Physics test;
- GCSE Physics past papers;
- GCSE Physics revision.

Experimental Physics clusters:

- GCSE Physics calculation questions;
- Physics method marks;
- Physics Paper 1 test;
- energy calculation GCSE;
- electricity calculation GCSE.

Later Maths measured head-term families:

- GCSE Maths questions;
- GCSE Maths test;
- GCSE Maths past papers;
- GCSE Maths revision;

Experimental Maths clusters:

- GCSE Maths method marks;
- mark the working GCSE Maths;
- GCSE Maths worked solutions;
- why did I lose marks in Maths?

The product should use normal search vocabulary in titles and headings. “Answer chain” explains the internal learning mechanism after the learner arrives; it is not expected to be an existing high-volume query.

### Shareable acquisition

Each round can produce:

- a spoiler-free card showing the challenge premise;
- a short video or animation revealing the difference between answers;
- a class or tutor link;
- a daily challenge URL;
- a creator-specific link that lands directly on the round;
- a result card that invites a friend to try the same question.

The shared unit should be educationally complete. The destination is always a fresh attempt or transfer question, never a generic marketing page.

Strong short-form hooks:

- “Most students chose Answer A. It loses two marks.”
- “Both answers are scientifically correct. Only one explains why.”
- “The final number is right, but this is 2/3.”
- “Can you mark this like an examiner?”
- “One sentence turns this from 2/4 into 4/4.”

### Zero-to-one online motion

The smallest credible online test does not require broad brand awareness:

1. publish three to six strong, indexable hubs in observed search language;
2. support them with approximately 12–20 excellent challenge leaves;
3. distribute the same leaves through search, creators, tutor links, and share cards;
4. measure Search Console impressions and queries as well as completed rounds;
5. identify which query + subject + mechanic combination creates acquisition, voluntary repair, and transfer;
6. expand only the winning hubs, chains, and query clusters.

This avoids treating traffic as proof of product value or treating classroom access as the only route to early learners.

### Search validation gates

The first-party audit found one anonymous exact-Google-referrer landing, zero observed Google-origin Biology landings, and that anonymous landing ended on a URL that now returns 404. Without Search Console, the referrer is consistent with an organic visit but does not expose its query or conclusively classify a click. Googlebot crawl counts establish crawlability, not search demand.

Before evaluating the wedge:

- enable and verify Search Console access;
- make 100% of pilot pages return 200 with intended self-referencing canonicals;
- redirect known stale question URLs;
- put the hubs and selected leaves in the sitemap and internal-link graph;
- require at least 90% discovery by day 14 and 75% indexing by day 28.

Predeclare Paper 1 quiz/test, six-mark questions, osmosis/required practical, broad exam questions, and each separately named topic as distinct query families.

Treat impressions on at least five pilot URLs, impressions from at least three predeclared query families, and genuine organic clicks on at least three pages that lead to challenge starts as only a **minimum signal for one more bounded iteration**. It is not enough to validate the wedge or authorize programmatic expansion.

Before scaling, observe a complete substantial UK mock or exam-demand window and accumulate at least 100 genuine organic landing sessions across the pilot. That sample gives only roughly ±10 percentage-point precision for a worst-case 50% conversion rate at 95% confidence. Scale only if demand is distributed across multiple pages and families and the entrants complete the repair-and-transfer loop at rates worth comparing with other acquisition sources.

### What not to depend on

- generic revision-tip articles;
- a generic AI tutor homepage;
- thousands of thin generated pages;
- static model-answer pages with no task;
- waiting for brand searches;
- social posts that require a click before providing value;
- a streak system before a single round is compelling;
- exact-score claims on assessment types that do not support them.

## Biology + Physics wedge experiment

### Test cells

Build a deliberately small but calibrated comparison:

- 20 Biology rounds;
- 20 Physics rounds.

Use the same high-level sequence where the subject permits:

`showdown → missing link or wrong step → repair → transfer`

Within both subjects, randomize the first action:

- which answer scores higher;
- guess the exact mark;
- find the missing link or first wrong step.

### Fair-comparison controls

Match or control:

- mark value;
- expected reading time;
- round length;
- question difficulty;
- topic familiarity;
- device;
- traffic source;
- page promise;
- amount of visible feedback;
- transfer distance.

Without these controls, a popular topic or easier question could be mistaken for a better game mechanic.

### Instrumentation

Record:

- landing source and query cluster where available;
- first action and time to action;
- answer choice or predicted score;
- reveal completion;
- missing-link selection;
- repair start, submission, and result;
- transfer start and independent result;
- next-round choice;
- share action and recipient completion;
- challenge or disagreement;
- marking latency and confidence;
- anonymous-to-signed-in continuity.

Do not optimize raw page views. A challenge that attracts clicks but does not produce repair or transfer is not the product.

### Decision rules

Use the experiment to answer three different questions:

1. **Public hook:** Which subject and premise produce the highest first-action and completed-cycle rates?
2. **Trustworthy engine:** Which subject produces the lowest justified disagreement and highest transfer validity?
3. **Expansion cost:** Which subject can add calibrated rounds without degrading chain precision?

Recommended interpretation:

- If Biology beats Physics on entry and repair while remaining acceptably trusted, keep Biology as the hero and Physics as the control.
- If Physics materially beats Biology throughout, lead with the examiner/marking promise and improve Biology chain calibration before expanding it.
- If “which answer scores higher” beats exact-mark guessing, make comparison the universal first action.
- If missing-link identification predicts transfer better than total-score prediction, optimize the product around diagnosis rather than score gamification.

Maths should be evaluated only after this experiment establishes the shared interaction, scoring-trust baseline, and winning first action. That later test should use its own working renderer and should not compete for the initial Biology + Physics content budget.

Practical initial quality gates:

- seeded answers grade reproducibly;
- random double marks agree within one mark at least 90% of the time;
- fewer than 5% of grading decisions require an upheld challenge;
- every exact-scoring round has independently creditable evidence;
- every transfer question shares the scoring chain rather than only the topic;
- anonymous learners can finish the complete cycle on mobile.

These are internal decision gates, not claims about industry benchmarks.

## Risks and mitigations

### 1. Confusing a game-fit hypothesis with observed engagement

Mitigation:

- label search and assessment signals as proxies;
- compare real completed cycles;
- control difficulty and traffic source;
- avoid declaring a subject winner from clicks alone.

### 2. Losing trust through false precision

Mitigation:

- enable exact-score games only for suitable items;
- expose evidence per rubric item;
- show confidence or review-needed states;
- use paired comparison or likely ranges for holistic responses;
- sample random double marking;
- make challenges easy to submit and review.

### 3. Building shallow keyword games

Mitigation:

- represent causal or procedural links, not only word presence;
- include known insufficient phrases;
- require repair in the learner’s own words;
- validate with different-context transfer;
- reject chains grouped only by vocabulary.

### 4. Letting wrappers substitute for learning

Mitigation:

- treat daily challenges and sharing as secondary;
- leave streaks and leaderboards unbuilt until post-validation retention experiments;
- measure repair and transfer before retention decoration;
- never reveal the answer on a share card.

### 5. Over-expanding subjects

Mitigation:

- keep one shared challenge object;
- add subject renderers only when assessment structure requires them;
- expand from measured subject + mechanic wins;
- avoid interpreting a large inventory as proof of fit.

### 6. Seasonality

Mitigation:

- compare subjects over the same periods;
- distinguish exam-season spikes from durable behavior;
- use readiness sprints near papers and chain practice outside the peak;
- measure repeat use and transfer, not only seasonal acquisition.

### 7. Thin or repetitive search pages

Mitigation:

- publish only calibrated rounds with a complete interaction;
- group pages into strong topic and mechanic hubs;
- ensure each page has a distinct question, misconception, repair, and transfer;
- keep non-useful state URLs out of search;
- expand selectively from demonstrated demand and learner behavior.

### 8. Mobile friction

Mitigation:

- make the first action a tap;
- keep the first reveal above the fold;
- defer typing until the learner understands the task;
- preserve anonymous progress;
- test long equations, rubrics, and answer comparisons on small screens.

## Recommended build sequence

This is an evidence-gated sequence rather than a calendar.

### Step 1: establish the shared round

Implement:

- paired-answer choice;
- per-point evidence reveal;
- missing-link diagnosis;
- answer repair;
- transfer;
- anonymous progress;
- challenge/disagreement capture.

### Step 2: create the comparison set

Prepare and calibrate:

- 20 Biology hero rounds;
- 20 Physics control rounds.

For Biology, generate at the chain level so each hero round has a real transfer. For Physics, use the current deeper inventory to validate scoring mechanics quickly.

### Step 3: publish complete acquisition pages

Create:

- three to six Biology and Physics readiness/topic/mechanic hubs using observed search language;
- approximately 12–20 supporting challenge leaves;
- one short readiness sprint per initial subject;
- spoiler-free share cards and direct round links.

Verify 200 responses, canonicals, redirects, sitemap inclusion, internal links, Search Console discovery, and indexing before treating traffic as a demand result. Use early distributed impressions and clicks only to justify another bounded iteration; expand programmatically only after the full seasonal and 100-organic-landing scale gate.

### Step 4: select the winning public promise

Choose from observed behavior:

- “Which answer scores higher?”
- “Find the missing mark point.”
- “Turn 2/4 into 4/4.”
- “Where does the working first lose a mark?”

The winner should maximize completed repair-and-transfer cycles, not only first clicks.

### Step 5: expand by compatible structure

Likely order by mechanic compatibility, current bank readiness, and build cost—not by search demand:

1. Chemistry within the Science shell;
2. a bounded Maths working experiment with its own renderer;
3. Geography as the first humanities test;
4. Computer Science for precise logic and code mechanics;
5. English Language comparison mode;
6. other humanities only after subject-specific calibration is economical.

## Final recommendation

Build **Science mark games**, not a generic revision game and not a generic AI tutor.

Keep Biology as the public product hero, while treating Biology SEO as a measured hypothesis rather than a proven wedge. Lead acquisition with Paper 1, six-mark-question, topic exam-question, and required-practical hubs. Use a small set of exact-question pages to support and test those hubs; do not generate a large long-tail estate until Search Console shows demand across multiple pages and query families.

Use Biology to make the promise vivid:

> **Can you find the missing link that turns this from 2/4 into 4/4?**

Use Physics to prove that the marking engine is precise:

> **The final answer is right. Which step still loses the mark?**

Later, use Maths to test the largest reach opportunity through a genuinely different mechanic:

> **Same answer. Different marks. Can you mark the working?**

The common product is not the score. It is the learner’s progression from **seeing** the difference, to **repairing** it, to **using** the same reasoning independently.

## Evidence and reference links

Demand and audience:

- [GCSE Biology Long-Tail Search Demand Audit, 17 July 2026](./gcse-biology-long-tail-search-demand-audit-2026-07-17.md)
- [Google: how autocomplete predictions work](https://support.google.com/websearch/answer/7368877?hl=en)
- [Google Keyword Planner historical metrics and forecasts](https://support.google.com/google-ads/answer/3022575?hl=en)
- [Example `api.seodata.dev` UK keyword response used for the directional point-estimate cross-check](https://api.seodata.dev/v1/keyword?q=gcse%20biology%20quiz&country=gb)
- [Google Trends: GCSE subject comparison, UK, latest 12 months](https://trends.google.com/trends/explore?date=today%2012-m&geo=GB&q=gcse%20maths,gcse%20biology,gcse%20chemistry,gcse%20physics,gcse%20english%20language)
- [Google Trends: GCSE quiz comparison, UK, latest 12 months](https://trends.google.com/trends/explore?date=today%2012-m&geo=GB&q=gcse%20maths%20quiz,gcse%20biology%20quiz,gcse%20chemistry%20quiz,gcse%20physics%20quiz,gcse%20english%20quiz)
- [Ofqual provisional entries for summer 2026](https://www.gov.uk/government/statistics/provisional-entries-for-gcse-as-and-a-level-summer-2026-exam-series/provisional-entries-for-gcse-as-and-a-level-summer-2026-exam-series)

Assessment structure:

- [AQA Combined Science scheme of assessment](https://www.aqa.org.uk/subjects/science/gcse/science-8464/specification/scheme-of-assessment)
- [AQA Biology scheme of assessment](https://www.aqa.org.uk/subjects/biology/gcse/biology-8461/specification/scheme-of-assessment)
- [AQA Physics scheme of assessment](https://www.aqa.org.uk/subjects/physics/gcse/physics-8463/specification/scheme-of-assessment)
- [AQA Maths specification at a glance](https://www.aqa.org.uk/subjects/mathematics/gcse/mathematics-8300/specification/specification-at-a-glance)
- [AQA June 2024 Maths mark scheme](https://www.aqa.org.uk/files/sample-papers-and-mark-schemes.2024.June.AQA-83001F-MS-JUN24_PDF/521d6af53968d8e3ddb1ce1440448f1493e8823c.pdf)
- [AQA Geography specification at a glance](https://www.aqa.org.uk/subjects/geography/gcse/geography-8035/specification/specification-at-a-glance)
- [AQA English Language scheme of assessment](https://www.aqa.org.uk/subjects/english/gcse/english-8700/specification/scheme-of-assessment)
- [AQA assessment tools and exemplar ranking](https://www.aqa.org.uk/resources/assess/using-our-assessment-tools)
- [Ofqual reliability of assessment summary](https://www.gov.uk/government/publications/reliability-of-assessment-compendium/estimates-of-reliability-of-qualifications-summary)
