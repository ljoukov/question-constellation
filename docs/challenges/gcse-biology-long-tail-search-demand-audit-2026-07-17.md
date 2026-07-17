# GCSE Biology Long-Tail Search Demand Audit

**Status:** Quantitative acquisition audit and strategy correction

**Evidence snapshot:** 17 July 2026

**Market:** United Kingdom

## Executive conclusion

The original strategy was directionally plausible but too confident about the acquisition mechanism.

There is quantitative evidence that UK learners search for GCSE Biology questions, quizzes, tests, Paper 1 quizzes, and six-mark-question collections. Qualified topic phrases also appear in Google’s prediction system, and there is behavioral evidence that learners repeatedly discuss the exact mark points for individual Biology questions. However:

- the complete phrase `gcse biology osmosis 6 marker` produced neither an exact Google autocomplete prediction nor a usable monthly-volume estimate;
- the shorter, natural phrase `osmosis 6 marker` was an exact Google UK autocomplete prediction;
- `gcse biology osmosis exam questions` was also an exact prediction;
- `aqa gcse biology 6 mark questions` had an estimated 70 UK searches per month;
- `osmosis exam questions` had an estimated 70 UK searches per month;
- the current site recorded **zero observed Google-origin Biology landings** in the audited production window;
- the current `/challenges` route returned 404 and challenge pages were absent from the sitemap;
- Question Constellation appeared in none of the eleven representative public-search result sets reviewed.

The defensible conclusion is therefore:

> **Biology is a justified product hero and a promising acquisition experiment, but exact-question long-tail SEO is not yet a proven wedge. Build searched hubs first, support them with a small number of excellent question leaves, and let Search Console evidence determine whether the leaf set should expand.**

This is a correction from “publish many specific mechanic/topic leaves” to “publish a measured hub-and-leaf pilot.”

## What the evidence does and does not establish

| Question | Finding | Confidence |
|---|---|---|
| Do people search for GCSE Biology practice resources? | Yes. `gcse biology quiz` and `gcse biology questions` were each estimated at 880 UK searches per month; `gcse biology test` at 210. Only `quiz` inherently implies interaction. | Medium: directional third-party estimates, consistent with Google predictions |
| Do people search for Biology topic exam questions? | The wording is supported, but volume is unresolved at GCSE level. Eight additional GCSE-qualified topic phrases appeared as exact predictions. Nine unqualified topic phrases returned a raw 1,010/month upper-bound proxy that may include A-level and other markets. | Medium for wording; low for GCSE-specific volume |
| Does anyone use “six marker” language? | The wording appears in Google’s UK prediction system and in Student Room learner posts. This is behavioral evidence, but it does not prove that a person submitted each exact predicted query. | Medium-high for natural wording; no user count |
| Is `gcse biology osmosis 6 marker` itself established? | No positive signal was found for that complete phrase. | Medium: absence of a signal is not proof of zero searches |
| Is there demand for help with one exact question and its mark points? | Yes as a learner need: large Student Room threads contain repeated exact-question reconstruction and mark-point debates. | High for the need; low as a measure of Google search volume |
| Is long-tail search already acquiring Biology learners for Question Constellation? | No Biology Google-origin landing was observed in the full available 11–17 July analytics history. This is a baseline, not a demand test of unpublished challenge pages. | High for the audited period |
| Can Question Constellation outrank incumbents? | Unknown. Static PDFs and generic guides suggest product gaps worth testing, while Save My Exams, Physics & Maths Tutor, Kramizo, Tutopiya, Studocu, and others are established competitors. Direct Google ranks and difficulty were unavailable. | Unknown until measured |
| Should hundreds of exact-question pages be published now? | No. The evidence supports a small indexed pilot, not programmatic expansion. | High |

## Evidence hierarchy and method

The audit separates four different kinds of evidence that should not be conflated.

1. **First-party acquisition evidence:** production analytics from Question Constellation.
2. **Observed Google query language:** exact predictions returned by Google’s UK autocomplete endpoint.
3. **Directional volume estimates:** UK monthly estimates returned by `seodata.dev`.
4. **Need and competitive evidence:** Student Room discussions and representative public-search result sets.

The research was conducted on 17 July 2026 unless a source date is stated otherwise.

The 39-query set was purposive, not random or exhaustive. It was built from the user’s osmosis-six-marker example, nearby respiration and enzyme variants, four- and six-mark mechanic formulations, Paper 1 and mark-scheme terms, broad question/quiz/test terms, and nine Biology topic seeds. Its `29 of 39` and `17 of 39` proportions describe only this diagnostic set and must not be extrapolated to the long-tail universe. Eight GCSE-qualified topic variants were then checked as a follow-up.

### Sources successfully measured

- Google UK autocomplete:
  `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=gb&q=QUERY`
- directional UK keyword estimates:
  `https://api.seodata.dev/v1/keyword?q=QUERY&country=gb`
- production first-party analytics in the `ANALYTICS_DB` D1 database;
- current production sitemap, routes, and Cloudflare-verified crawler records;
- public web-search result proxies and direct competitor pages;
- Student Room thread pages and forum metadata;
- Similarweb’s public estimate for `thestudentroom.co.uk`;
- the saved [derived query-audit dataset](./data/gcse-biology-query-audit-2026-07-17.csv);
- the saved [first-party aggregate SQL and definitions](./data/first-party-search-baseline-2026-07-17.sql).

Google says autocomplete predictions are influenced by common and trending searches as well as language and location. This makes an exact prediction useful behavioral evidence that the wording fits Google’s prediction system, but it is not a monthly search count or proof that a person submitted that exact query. Google also notes that word or phrase completions can sometimes be derived from web patterns. An autocomplete match should therefore be treated as **prediction-system evidence**, not proof of a searcher count or commercial volume.

The monthly point estimates are directional. The provider describes keyword data as Google Ads–derived, but its public material also describes multi-provider routing. Returned values may group close variants, related terms overlap, and suppressed values are not zero. No total in this report is a unique-person or traffic forecast.

The saved CSV is a dated derived snapshot of the exact-match decision, API response-list length, and returned volume field. The original response bodies and provider metadata were not retained, so the volume evidence is not a fully immutable raw-response archive. Rechecking additional qualified terms later in the audit returned HTTP 429 from the volume endpoint. This limitation is why all point values remain vendor-directional.

### Sources attempted but unavailable

| Source | Outcome | Consequence |
|---|---|---|
| Direct Google result pages | Google returned a `/sorry/` block for the shared data-centre IP in ordinary Chrome, a persistent browser profile, and a temporary stealth-browser test. | No claim in this report is presented as a current Google rank. Competition is a public-search proxy. |
| Google Trends exact comparison | The request returned HTTP 429. | No “low volume” inference was made from Trends. |
| Semrush free keyword tool | UK and the exact query were entered, but the tool stopped at reCAPTCHA and returned no result. | No Semrush number was invented or substituted. |
| Google Search Console API | OAuth succeeded, but the API returned HTTP 403 because Search Console API access was disabled or unused for the Google Cloud project. | Search Console impressions and queries remain an access gap, not evidence of zero impressions. |
| Cloudflare zone analytics | The current token could query D1 but lacked `zone.analytics.read`. | The audit uses first-party D1 events and crawler rows, not Cloudflare zone totals. |

## Exact-query demand audit

Thirty-nine purposively selected phrases were checked with UK-localized, anonymous Google autocomplete. Seventeen also returned a usable monthly estimate.

- **29 of 39** appeared as exact autocomplete predictions.
- **17 of 39** returned a UK monthly estimate.
- **12 of 39** had an exact prediction but no usable volume.
- **10 of 39** had neither an exact prediction nor a usable volume.

“No estimate” means the provider did not return a usable value. It does not mean zero searches.

“Suggestions returned” is the endpoint response-list length, commonly capped at ten. It is not a demand measure and should be used only to reproduce whether the exact phrase was present.

| Query | Search level | Exact Google UK prediction | API response length—not demand | Directional UK searches/month |
|---|---|---:|---:|---:|
| `gcse biology osmosis 6 marker` | exact leaf formula | No | 0 | No estimate |
| `gcse biology osmosis 6 mark question` | exact leaf formula | No | 0 | No estimate |
| `aqa biology osmosis 6 marker` | exact leaf formula | No | 0 | No estimate |
| `osmosis six marker gcse biology` | exact leaf formula | No | 0 | No estimate |
| `gcse biology osmosis mark scheme` | exact leaf formula | No | 0 | No estimate |
| `gcse biology osmosis exam questions` | topic leaf/hub | Yes | 4 | No estimate |
| `aqa gcse biology osmosis required practical questions` | topic leaf/hub | Yes | 3 | No estimate |
| `osmosis 6 marker` | natural short leaf | Yes | 6 | No estimate |
| `gcse biology respiration 6 marker` | exact leaf formula | No | 0 | No estimate |
| `gcse biology respiration 6 mark question` | exact leaf formula | No | 0 | No estimate |
| `aqa biology respiration exam questions` | topic leaf/hub | Yes | 10 | No estimate |
| `gcse biology enzymes 6 marker` | exact leaf formula | No | 0 | No estimate |
| `gcse biology enzymes exam questions` | topic leaf/hub | Yes | 8 | No estimate |
| `gcse biology four mark questions` | mechanic leaf/hub | No | 0 | No estimate |
| `aqa biology four mark questions` | mechanic leaf/hub | No | 0 | No estimate |
| `gcse biology 6 mark questions` | mechanic hub | Yes | 10 | No estimate |
| `gcse biology 6 markers` | mechanic hub | Yes | 10 | No estimate |
| `aqa gcse biology 6 mark questions` | mechanic hub | Yes | 8 | 70 |
| `gcse biology paper 1 6 markers` | mechanic hub | Yes | 7 | No estimate |
| `all gcse biology 6 markers` | mechanic hub | Yes | 5 | No estimate |
| `gcse biology mark scheme` | broad resource | Yes | 10 | No estimate |
| `aqa gcse biology mark scheme` | broad resource | Yes | 10 | No estimate |
| `biology paper 1 mark scheme` | broad resource | Yes | 10 | 50 |
| `gcse biology paper 1 quiz` | readiness hub | Yes | 10 | 70 |
| `biology paper 1 test` | readiness hub | Yes | 10 | No estimate |
| `gcse biology exam questions` | broad question hub | Yes | 10 | 140 |
| `biology exam questions gcse` | broad question hub | Yes | 10 | 140 |
| `respiration exam questions` | topic hub | Yes | 10 | 50 |
| `osmosis exam questions` | topic hub | Yes | 10 | 70 |
| `enzymes exam questions` | topic hub | Yes | 10 | 50 |
| `photosynthesis exam questions` | topic hub | Yes | 10 | 110 |
| `cell biology exam questions` | topic hub | Yes | 10 | 320 |
| `infection and response exam questions` | topic hub | Yes | 10 | 140 |
| `bioenergetics exam questions` | topic hub | Yes | 10 | 70 |
| `homeostasis exam questions` | topic hub | Yes | 10 | 170 |
| `ecology exam questions` | topic hub | Yes | 10 | 30 |
| `gcse biology quiz` | broad practice | Yes | 10 | 880 |
| `gcse biology questions` | broad practice | Yes | 10 | 880 |
| `gcse biology test` | broad practice | Yes | 10 | 210 |

### The osmosis test case

The user’s example exposes the difference between a plausible phrase and observed search language.

The complete phrase `gcse biology osmosis 6 marker` returned no exact prediction. The shorter phrase `osmosis 6 marker` returned six predictions, including:

- `osmosis 6 marker`;
- `osmosis 6 mark question`;
- `osmosis practical 6 marker`;
- `osmosis required practical 6 marker`;
- `osmosis potato practical 6 marker`.

Separately, `gcse biology osmosis exam questions` was an exact prediction, and `osmosis exam questions` had an estimated 70 UK searches per month.

This supports an osmosis page, but not the original title formula. The search-facing hub should use language such as **GCSE Biology osmosis exam questions** or **osmosis required practical questions**. “Find the missing mark” should be the playable promise after the learner lands.

### GCSE-qualified topic follow-up

Because the initial topic-volume phrases omitted level and board, eight GCSE-qualified variants were checked separately. Every one appeared as an exact Google UK prediction:

- `gcse biology cell biology exam questions`;
- `aqa gcse biology cell biology exam questions`;
- `gcse biology homeostasis exam questions`;
- `aqa gcse biology homeostasis exam questions`;
- `gcse biology infection and response exam questions`;
- `gcse biology photosynthesis exam questions`;
- `gcse biology bioenergetics exam questions`;
- `gcse biology ecology exam questions`.

The volume endpoint returned HTTP 429 for all eight follow-up requests, so this establishes only prediction-system support for the qualified wording. It does not transfer the unqualified topic estimates to GCSE.

### Quantitative clusters

The following raw totals describe query sets, not unique demand:

| Query set | Included measured phrases | Raw monthly estimate | Correct interpretation |
|---|---:|---:|---|
| Broad Biology question/quiz/test intent | `gcse biology quiz`, `questions`, `test` | 1,970 | A directional GCSE practice-resource pool with substantial close-variant overlap; interaction preference is not established by all three terms |
| Nine unqualified topic exam-question phrases | respiration, osmosis, enzymes, photosynthesis, cell biology, infection and response, bioenergetics, homeostasis, ecology | 1,010 | An upper-bound Biology-topic proxy that can include A-level and other markets; not a GCSE market size |
| Three initial acquisition phrases | `aqa gcse biology 6 mark questions`, `osmosis exam questions`, `gcse biology paper 1 quiz` | 210 | A narrow raw measured portfolio, before overlap and ranking |

The unqualified topic distribution is useful for choosing terms to validate, not for ranking GCSE hubs:

| Level-ambiguous topic phrase | Directional UK searches/month |
|---|---:|
| `cell biology exam questions` | 320 |
| `homeostasis exam questions` | 170 |
| `infection and response exam questions` | 140 |
| `photosynthesis exam questions` | 110 |
| `osmosis exam questions` | 70 |
| `bioenergetics exam questions` | 70 |
| `respiration exam questions` | 50 |
| `enzymes exam questions` | 50 |
| `ecology exam questions` | 30 |

The values show that topic-exam-question demand exists somewhere in the wider Biology market. The exact GCSE-qualified predictions make those topics reasonable candidates for a bounded test, but GCSE-specific volume remains unknown.

## First-party traffic: no Biology validation yet

Production journey data for `https://constellation.eviworld.com` was audited from the database’s first production session at 11 July 2026 00:00:00 UTC through a fixed cutoff of 17 July 2026 16:40:00 UTC. This is the full available production analytics history at the cutoff, not a selected comparison week.

A human-classified session is a production session whose effective traffic class is `human`, after applying an actor-level manual override when present and otherwise using the stored session classifier. An actor is `user:<user_id>` for an authenticated session and `anon:<anonymous_id>` otherwise. Google origin requires exact equality with the `https://www.google.com` origin after trimming a trailing slash; it does not use a substring match. A Biology landing is an exact-Google-origin session whose initial path contains `biology`. The executable aggregate logic is saved in [first-party-search-baseline-2026-07-17.sql](./data/first-party-search-baseline-2026-07-17.sql).

| Metric | Observed value | Interpretation |
|---|---:|---|
| Human-classified sessions | 90 | Small sample |
| Human-classified page views | 328 | Small sample |
| Distinct human actors | 22 | Includes authenticated testing |
| Anonymous human sessions / page views | 44 / 103 | Closest available public-user subset |
| Authenticated human sessions / page views | 46 / 225 | Heavily operator-influenced |
| Dominant authenticated actor | 43 sessions / 210 page views | 47.8% of all sessions and 64.0% of all page views |
| Exact Google-origin sessions | 5 | Four were coordinated signed-in testing |
| Anonymous exact Google-origin sessions | 1 | One manually reviewed Geography practice landing, consistent with an organic visit but not corroborated by Search Console |
| Observed Google-origin Biology landings | **0** | Baseline only; proposed challenge pages were not published |
| Cloudflare-verified Googlebot sessions | 1,875 | Crawl activity, not learner demand |
| Distinct initial paths in those Googlebot sessions | 1,520 | Broad discovery |
| Path-text Biology Googlebot sessions / paths | 104 / 81 | A reproducible lower-bound text match, not an indexing measure |

The sole anonymous exact-Google-referrer landing was manually reviewed:

- 14 July 2026 at 12:51 UTC;
- a GB desktop Chrome/Windows visitor;
- the Geography practice URL
  `/questions/geography-2021-june-paper-1-living-with-the-physical-environment-qp-04-3/practice`;
- one page view and approximately 11.7 seconds of engaged time.

That URL currently returns HTTP 404. This is both an acquisition warning and a technical priority: preserve previously exposed URLs or redirect them to the current canonical question. Without Search Console, the referrer is strong but not conclusive proof of a search click or its query.

Four other exact-Google-origin sessions occurred within 57 seconds on 16 July across a question, the homepage, and two blog pages. They belonged to the dominant authenticated actor and are consistent with deliberate result testing, not four independent organic learners.

Three additional sessions contained `accounts.google.com` in same-site OAuth callback data. They were excluded from the Google-origin count. A substring match would have incorrectly reported eight Google sessions rather than five.

The 1,875 verified Googlebot sessions show that Googlebot reached much of the site. They do not prove that pages are indexed, shown for relevant queries, clicked, or useful to learners.

## Learner-need evidence from The Student Room

The Student Room does not provide keyword volume, but it is strong behavioral evidence for the underlying job: learners want to reconstruct exact questions, compare remembered answers, determine accepted mark points, and ask whether their wording would score.

| Evidence | Quantity | What it supports |
|---|---:|---|
| 2025 AQA GCSE Biology Paper 1 Higher thread | 1,397 numbered replies across 70 pages; 971 poll votes | Large, question-specific post-exam participation |
| 2026 AQA GCSE Biology Paper 1 discussion | At least 569 replies across 29 pages at the audit time | Recurrence in a later exam season |
| 2025 thread reference to the question | Participants identify “osmosis 6 marker” and discuss it | The shorter learner wording and exact-mark job are natural |
| Recent request for more AQA six-mark questions | A learner says they had run out of available questions | A direct practice-supply problem |

Thread reply totals are not unique learners and are not counts of mark-point posts. They include repeated authors, general exam chat, and off-topic discussion. The totals show the scale of the surrounding behavior; the directly cited posts establish only that exact-question reconstruction and mark discussion occur.

The Student Room describes itself as reaching more than five million visitors per month. Similarweb’s live June 2026 page estimated approximately 2 million visits, 83.04% UK desktop traffic share, and 70.08% of desktop visits from organic search. These numbers use different methodologies and may measure different concepts, so they should not be reconciled into one traffic fact. The cited thread behavior is the more decision-relevant evidence.

The strategic implication is narrower than “exact-question SEO will work”:

> Learners demonstrably care about the exact question, accepted wording, and missing mark points. A calibrated interactive page could serve that need more directly than a forum thread, but the pilot must test whether learners find and prefer it.

The behavior is also seasonal and often post-exam. Evergreen preparation pages should be separated from rapid post-exam reconstruction. Question Constellation should not publish copyrighted live-paper material or unverified remembered questions merely to chase an exam-day spike.

## Competition and proxy result shape

Direct Google ranks could not be observed because of the shared-IP block. The research environment’s public-search proxy also does not provide a durable engine, UK-locale, result-depth, or rank-difficulty contract. One Brave result page was obtained separately, but it is not a substitute for Google UK. The eleven-query review is therefore a **result-shape audit**, not a ranking report.

The purposive query set was:

1. `gcse biology 6 mark questions`;
2. `gcse biology 6 mark questions aqa pdf`;
3. `gcse biology osmosis exam questions`;
4. `gcse biology osmosis required practical questions`;
5. `respiration exam questions GCSE AQA PDF`;
6. `biology paper 1 quiz GCSE AQA`;
7. `AQA biology paper 1 test GCSE`;
8. `gcse biology mark scheme AQA`;
9. `AQA GCSE Biology Paper 1 mark scheme 2025`;
10. `find the missing mark biology GCSE`;
11. `gcse biology osmosis 6 marker`.

The gap labels below are qualitative product hypotheses. They are not rank probabilities and do not account for domain authority, links, or Google-specific difficulty.

| Query or intent | Representative competitors | Result shape | Hypothesized product gap to test |
|---|---|---|---|
| `gcse biology 6 mark questions` | Tutopiya, Cognito, TES, Knowunity, Studocu | Guides, resource packs, document platforms | Test whether real attempts, mark-by-mark evidence, and board/tier clarity outperform guide intent. |
| `gcse biology 6 mark questions aqa pdf` | Knowunity, TES, Studocu, assorted PDFs | Explicit download/document intent | Weak fit; do not force an interactive page into a PDF query. |
| `gcse biology osmosis exam questions` | Kramizo, TES, MME copies, Scribd, PDFs | One direct interactive competitor plus worksheets and copied documents | Test whether repair and transfer add value beyond a static collection. |
| `gcse biology osmosis required practical questions` | TES, Docsity, Twinkl, SimpleStudy | Paid teacher resources, downloads, and notes | Test free method-writing practice with precise missing-mark feedback. |
| `respiration exam questions GCSE AQA PDF` | Save My Exams, Physics & Maths Tutor, StudyVector, Studocu, Scribd | Strong topic banks and PDFs | Weak generic/PDF wedge; avoid copying incumbents. |
| `biology paper 1 quiz GCSE AQA` | LearnWise, TES, Quizard, Knowunity | Fragmented interactive quizzes and resources | Test a fast, no-login Paper 1 diagnostic. |
| `AQA biology paper 1 test GCSE` | LearnlyAI, Examzify, Physics & Maths Tutor, Twinkl | Mixed test, paper, and paid-resource intent | Test an exact board/paper promise. |
| `gcse biology mark scheme AQA` | official/near-official archives, Reddit, SimpleStudy, MME | Archive and PDF intent | Weak fit: the user often wants a document, not a game. |
| `AQA GCSE Biology Paper 1 mark scheme 2025` | Markscheme.net, Docsity, Etsy, Stuvia, LearnlyAI | Transactional downloads and recent-paper intent | Avoid: intent mismatch and rights sensitivity. |
| `find the missing mark biology GCSE` | No relevant GCSE result in the proxy audit | No established search vocabulary | Keep as a product hook, not a target keyword. |
| `gcse biology osmosis 6 marker` | Student Room exam threads and reaction content | Seasonal post-exam discussion | Test evergreen preparation separately from post-exam reaction intent. |

Exact AQA question stems from the existing bank were also found verbatim on Gauthmath, Studocu, Quizlet, and official PDFs. This proves that exact stems can be indexed and that answer platforms already compete for them. It does **not** prove that exact-stem queries receive meaningful searches.

### Current Question Constellation position

At the time of audit:

- the production sitemap contained exactly 3,500 URLs:
  - 6 static;
  - 18 blog;
  - 2,344 past-paper;
  - 558 question;
  - 538 chain;
  - 36 topic URLs;
- no challenge route appeared in the sitemap;
- `/challenges` returned 404;
- Question Constellation appeared in none of the surfaced results for the eleven proxy queries;
- crawler logs contained stale or removed question URLs;
- the only anonymous exact-Google-referrer landing in the first-party sample reached a URL that now returns 404.

There is therefore no empirical basis for saying the site can already win these result sets. The opportunity is an experiment, not an established channel.

## Revised acquisition strategy

### 1. Make searched hubs the primary SEO unit

Start with three to six strong pages whose titles match observed language:

1. **GCSE Biology Paper 1 quiz** — the 70/month estimate applies to this exact wording; adding AQA or “practice test” is an adjacent product-fit hypothesis.
2. **AQA GCSE Biology 6-mark questions**
3. **GCSE Biology osmosis exam questions**
4. **Osmosis required practical questions**
5. **GCSE Biology exam questions**

GCSE-qualified Cell Biology, Homeostasis, Infection and Response, Photosynthesis, Bioenergetics, and Ecology phrases all appeared as exact predictions in the follow-up. They are second-wave candidates, but their GCSE-specific monthly volumes remain unmeasured. The unqualified 30–320/month estimates must not be used to rank them.

Each hub should contain playable question previews, board/tier/source context, a real attempt before reveal, mark-by-mark evidence, common weak answers, and a path into repair and transfer. It should not be a thin list of links.

### 2. Publish only a small supporting leaf set

Create approximately 12–20 excellent question leaves across those hubs. This is an operationally manageable test scope, not a demand-derived optimum. Select leaves that have:

- validated mark-scheme evidence;
- a distinct misconception or missing causal link;
- a credible repair;
- a transfer question sharing the same answer chain;
- stable canonical URLs;
- enough standalone context to satisfy a landing visitor;
- a parent hub and useful sibling links.

Do not generate hundreds of variants from the template:

`GCSE + subject + topic + mark count + question`

The audit does not support that formula at scale.

### 3. Use search language outside and product language inside

Search-facing title:

> **GCSE Biology osmosis exam questions**

First playable heading or call to action:

> **Can you find the missing mark that turns this into 6/6?**

“Find the missing mark” differentiates the interaction. It should not be treated as proven query vocabulary.

### 4. Avoid intent mismatches

Do not lead with:

- generic or year-specific mark-scheme downloads;
- PDF queries;
- recent live-paper reconstruction;
- generic “revision” articles;
- exact-score claims where accepted alternatives are not calibrated;
- duplicate state or answer URLs.

## Pilot and decision rules

The pilot has two jobs: establish technical eligibility and test actual search demand.

### Phase A: technical eligibility

Before judging demand:

- enable Search Console API access and verify the correct property;
- ensure every pilot URL returns 200;
- redirect known stale question URLs to the closest stable canonical destination;
- include hubs and selected leaves in the sitemap;
- provide self-referencing canonicals and unique titles/descriptions;
- link every leaf from a hub and every hub from relevant question/topic surfaces;
- keep answer/reveal states non-indexable where they duplicate the base question.

Operating gates:

- **100%** of pilot pages return 200 and declare the intended canonical at launch;
- **at least 90%** are discovered in Search Console within 14 days;
- **at least 75%** are indexed within 28 days.

These are operational thresholds, not demand forecasts. A failure here invalidates any conclusion about whether learners search for the content.

### Phase B: measured demand

Run a six-week index-and-query observation, then retain the pilot through at least one substantial UK mock or exam-demand window.

Predeclare the query families before launch:

- Paper 1 quiz/test;
- six-mark questions;
- osmosis/required-practical questions;
- broad GCSE Biology exam questions;
- each separately named second-wave topic.

Record by landing page and query:

- non-brand impressions;
- clicks and click-through rate;
- average position;
- discovered and indexed status;
- challenge start;
- reveal;
- repair start and completion;
- transfer start and success;
- return to another question;
- board, paper, topic, and device.

Minimum signal gate for one more bounded iteration:

- at least **five distinct pilot URLs** receive non-brand impressions;
- at least **three distinct query families** produce impressions;
- at least **three pages** receive genuine organic clicks, so one anomaly cannot select the strategy;
- the clicked pages produce challenge starts and completed rounds, not only bounces.

Three clicked pages establish only a trace distribution signal. They do not validate the wedge or authorize programmatic expansion.

Scale gate:

- observe at least one complete substantial UK mock or exam-demand window;
- accumulate at least **100 genuine organic landing sessions** across the pilot, a predeclared minimum that gives only roughly ±10 percentage-point precision for a worst-case 50% conversion rate at 95% confidence;
- see demand across multiple predeclared query families and pages rather than one result;
- demonstrate that organic entrants start, complete, repair, and continue at rates worth comparing with other acquisition sources;
- confirm that the content can be expanded without weakening mark-scheme evidence or producing thin pages.

If the indexed pilot fails the minimum-signal test across a meaningful demand window, do not expand the leaf set. If it passes the minimum signal but not the scale gate, run another bounded iteration rather than declaring a channel.

The product engagement thresholds should be set after enough genuine organic sessions exist to estimate a baseline. The present traffic—one anonymous exact-Google-referrer landing and zero observed Biology landings—is too small to justify invented conversion benchmarks.

### How to diagnose the outcome

| Observed result | Likely meaning | Action |
|---|---|---|
| Pages are not discovered or indexed | Technical/internal-linking problem | Fix eligibility before judging demand |
| Indexed pages receive no impressions | Weak query fit, insufficient authority, or insufficient seasonal demand | Keep the pilot small; test hub wording and wait for the planned demand window |
| Hubs receive impressions but leaves do not | Demand exists at cluster level, not exact-question level | Invest in hubs and stop leaf expansion |
| Leaves receive impressions for unexpected wording | Learners search differently from the hypothesis | Rewrite titles/navigation around real Search Console queries |
| Impressions occur but clicks do not | Snippet, rank, or intent mismatch | Compare result-page promise; improve title and content fit |
| Clicks occur but challenges do not start | Landing-page/product mismatch | Move the real question and first action above the fold |
| Learners complete and continue to transfer | Search and product loop align | Expand only the winning topic/mechanic families |

## Final recommendation

Keep Biology as the public product hero, but downgrade the SEO claim from “proven long-tail wedge” to “measured acquisition hypothesis.”

The initial public portfolio should be:

- one GCSE Biology Paper 1 quiz hub, with AQA-specific content and wording tested separately;
- one AQA GCSE Biology six-mark-question hub;
- one osmosis/required-practical hub;
- one broad GCSE Biology exam-question hub;
- at most one additional well-calibrated topic hub from the qualified prediction set;
- 12–20 supporting question leaves;
- no programmatic expansion until the scale gate is met.

The key strategic distinction is:

> **The demand evidence supports collections of relevant questions and natural short formulations. It does not yet support a large estate of verbose exact-question SEO pages.**

Biology remains a good idea. The route to proving it is now quantitative: make the pages technically eligible, publish a bounded portfolio, observe the real queries and landings, and expand only what Google and learners actually validate.

## Sources

Query methodology:

- [Derived 47-row primary and qualified-follow-up query dataset](./data/gcse-biology-query-audit-2026-07-17.csv)
- [Executable first-party aggregate SQL and metric definitions](./data/first-party-search-baseline-2026-07-17.sql)
- [Google: how autocomplete predictions work](https://support.google.com/websearch/answer/7368877?hl=en)
- [Google: why Trends may not display a graph](https://support.google.com/trends/answer/9009229?hl=en)
- [Google Ads: Keyword Planner historical metrics](https://support.google.com/google-ads/answer/3022575?hl=en-EN)
- [Semrush search-volume methodology](https://www.semrush.com/kb/683-what-is-search-volume-in-semrush)
- [`seodata.dev` keyword data](https://www.seodata.dev/)

Learner behavior:

- [The Student Room: about the platform](https://www.thestudentroom.co.uk/help/about-the-student-room)
- [Similarweb estimate for The Student Room](https://www.similarweb.com/website/thestudentroom.co.uk/)
- [2025 AQA GCSE Biology Paper 1 Higher discussion, final page](https://www.thestudentroom.co.uk/showthread.php?page=70&t=7590841)
- [2025 discussion page containing “osmosis 6 marker”](https://www.thestudentroom.co.uk/showthread.php?page=58&t=7590841)
- [2026 AQA GCSE Biology Paper 1 discussion](https://www.thestudentroom.co.uk/showthread.php?t=7666955)
- [Student asks for the GCSE osmosis definition that receives marks](https://www.thestudentroom.co.uk/showthread.php?t=7205118)
- [Student asks for more AQA six-mark questions](https://www.thestudentroom.co.uk/showthread.php?t=7604129)
- [Long-running discussion of how to answer a Biology question](https://www.thestudentroom.co.uk/showthread.php?t=5296818)

Representative competitors:

- [Tutopiya: six-mark extended-response guide](https://www.tutopiya.com/blog/gcse/biology-gcse-questions/six-mark-extended-response-gcse-questions/)
- [Cognito: how to answer six-mark Science questions](https://cognito.org/blog/gcse-science-how-to-answer-6-mark-questions)
- [Kramizo: AQA GCSE Biology osmosis practice](https://www.kramizo.com/practice/aqa-gcse-biology-osmosis)
- [Save My Exams: respiration exam questions](https://www.savemyexams.com/gcse/biology/aqa/18/topic-questions/4-bioenergetics/4-2-respiration/exam-questions/)
- [Physics & Maths Tutor: respiration question PDF](https://www.physicsandmathstutor.com/download/Biology/GCSE/Topic-Qs/AQA/4-Bioenergetics/Set-B/4.2%20Respiration%20QP.pdf)
- [StudyVector: respiration exam questions](https://www.studyvector.co.uk/exam-questions/aerobic-anaerobic-respiration)
- [Quizard: AQA Biology Paper 1 quiz](https://quizard.app/quiz/9773/aqa-biology-paper-1-quiz)

Exact-stem competition examples:

- [Gauthmath: toxic hypoglycaemia question](https://www.gauthmath.com/solution/1987354909534724/e-Toxic-hypoglycaemia-syndrome-THS-has-caused-the-deaths-of-hundreds-of-starving)
- [Gauthmath: amylase and pH question](https://www.gauthmath.com/solution/1831098346784881/3-_7-Explain-how-the-structure-of-enzyme-molecules-is-related-to-the-effect-of-p)
- [Gauthmath: pondweed and light-colour question](https://www.gauthmath.com/solution/1987424165874052/c-A-student-investigated-the-effect-of-different-colours-of-light-on-the-rate-of)
- [Studocu: protein and fat digestion question](https://www.studocu.com/en-gb/messages/question/14089859/the-human-digestive-system-breaks-down-protein-and-fat-in-the-drinkdescribe-how-protein-and-fat-are)
