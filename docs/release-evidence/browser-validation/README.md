# Browser release validation

This evidence is produced by the dependency-free Node 22 runner at
`scripts/validate-release-browser.mjs`. It launches the installed Google Chrome directly, speaks
the Chrome DevTools Protocol over its loopback WebSocket, and removes its temporary browser
profile and Chrome process on exit.

## Reproduce the baseline

The local server must be running from this checkout on port 5173 with the documented development
auth override configured in `.env.local`:

```sh
scripts/dev-server.sh restart 5173
node scripts/validate-release-browser.mjs \
  --base-url=http://127.0.0.1:5173 \
  --output=docs/release-evidence/browser-validation \
  --viewport=mobile,ipad,laptop \
  --theme=light,dark \
  --screenshot=viewport \
  --fail-on-issues
```

The final default matrix covers the signed-in home, Biology and Physics subject hubs, English
Literature hub and step-by-step practice, Literature flashcards, Biology multiple choice and
true-or-false, and the public question and answer-chain pages for the same
Literature task. The default practice URL follows its server redirect to the first `task` step.
Each case records its final URL, HTTP status, active theme, headings and control summary, console
and page errors, failed requests, same-origin error responses, document dimensions, overflow
candidates, and screenshot.

For each default recall route the runner also enters the first available stack. It reveals one
flashcard and performs a below-threshold touch drag that must leave the same card active, or
chooses one MCQ/true-or-false option and requires complete answer feedback. It deliberately does
not click “Next card” or “Repeat,” so these checks do not submit a recall review or write learner
evidence.

Use repeated `--route=name:/pathname` arguments to replace the defaults. `--screenshot=full`
captures up to 20,000 CSS pixels of page height. Run `--help` for every option.

## Historical pre-import baseline result

- 24/24 cases passed in Chrome 149: the former four-route matrix, mobile (390×844), iPad (820×1180), and laptop
  (1440×900), in both light and dark themes.
- Every case showed the signed-in account control and the requested active theme.
- There were no console errors, page exceptions, failed requests, same-origin HTTP errors,
  document-level horizontal overflow, clipped-content candidates, or uncontained viewport
  protrusions.
- Mobile contains two intentional horizontal-scroll controls: the English Literature course-section
  rail and English practice stepper. Their offscreen descendants are contained by an explicit
  `overflow-x: auto` region, do not widen the document, and visibly cue more content. These were
  manually inspected in both themes and are recorded as `horizontalScrollRegions`, not clipping.
- Representative screenshots covering every route, each viewport, and both themes were manually
  inspected. Home, subject, Literature hub, and practice content remained readable and stable.
- Chrome emitted only its informational warning that `apple-mobile-web-app-capable` is deprecated
  without the newer companion meta tag. It is recorded under `logEntries` and is not a page error
  or layout defect.
- This baseline did not enter an answer or invoke grading, so it triggered no draft, grading,
  learning-progress, or study-card writes. It exercised only behaviour intrinsic to loading the
  signed-in pages, including first-party page-view analytics and the test profile's normal
  last-seen bookkeeping. No Chrome process or temporary profile remained after the run.

See [summary.md](summary.md), [report.json](report.json), and the `screenshots/` directory.

## Opt-in English interaction

The runner can type into the active English response editor and, only when explicitly requested,
click `Check step` and wait for the feedback panel:

```sh
node scripts/validate-release-browser.mjs \
  --viewport=laptop \
  --theme=light \
  --route=english-practice:/questions/ocr-j352-01-jun24-04-1b/practice \
  --english-answer='A realistic learner response long enough to check.' \
  --english-check \
  --output=docs/release-evidence/browser-validation-english-check \
  --fail-on-issues
```

That command invokes the live grading path and the product's normal signed-in draft persistence.
Use it only when model calls and disposable test-user writes are explicitly authorised. Omitting
`--english-check` fills without submitting, but the product may still persist the draft when the
page closes.
