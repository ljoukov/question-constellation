# Question Constellation Visual Flow Brief

Status: shared starting point for three independent product-design explorations.

## Product

Question Constellation is a GCSE exam-preparation app. It should feel credible, calm, public, and
question-led. It must not feel like a generic chatbot, a school management system, a wall of revision
tools, or a dashboard that must be decoded before the student can act.

The product has two visual modes:

1. **Explore and practise**: inviting, quick, curiosity-led, and personalized.
2. **Exam mode**: restrained, paper-like, source-faithful, and deliberate.

## Student Scenario For All Concepts

Use the same realistic state so concepts can be compared.

- Name: Maya
- School stage: Year 10
- Exam route: AQA GCSE Combined Science, Higher tier
- Target: Grade 8–8
- Covered at school: Cell Biology, Organisation, Infection and Response, Bioenergetics
- Not yet covered: Homeostasis, Inheritance, Ecology
- Available now: about 10 minutes
- Recent work: 14 checked questions, 7 recall items due
- Current evidence: usually knows the facts but sometimes skips the oxygen -> respiration -> energy
  link in longer explanations
- Authentic-paper state: one 2024 paper reserved as a fresh mock

## Real Content Anchors

Use real-looking exam content rather than placeholder cards.

- Biology, 3 marks: `Explain why plants infected with tobacco mosaic virus grow slowly.`
- Biology, 4 marks: `Explain why heart attack survivors get out of breath easily when they exercise
gently.`
- Chemistry, 2 marks: `Explain the effect of increasing pressure on the equilibrium position.`
- Physics, 4 marks: `As the stone moves through water, it slows to a constant velocity. Explain why.`
- Reasoning method: `reduced delivery -> less oxygen -> less aerobic respiration -> less energy ->
symptom or compensation`
- Recall prompt: `What is the function of ribosomes?`
- True/false prompt: `A higher temperature always increases the rate of an enzyme-controlled
reaction.`
- English Language task: a credible AQA Paper 1 analysis question using a short fiction extract.

Keep board, subject, tier, paper, source reference, and marks visible wherever relevant. Label
authentic, adapted, and generated material clearly.

## Stable Destination Screens

Do not spend the concept on redesigning these deeply. They are anchors around which the missing
journey should work.

- A single paper-like question rendered faithfully in HTML.
- A one-step answer interaction for simple questions.
- Multi-step guided English practice.
- Science guided answer builder and gap-closing flow.
- Flashcard, MCQ, and later true/false interactions.

It is acceptable to show compact previews of these destinations to demonstrate continuity.

## Screens The New Journey Must Resolve

Each concept must show a coherent answer to the following, not merely a set of attractive components:

1. **Signed-in home**
   - An obvious next action within two seconds.
   - A small dynamic stream of interesting questions or an equally clear alternative.
   - No equal-weight grid of every feature.

2. **Subject/focus continuation**
   - Continue without configuring everything again.
   - Allow `another like this`, `harder`, `different topic`, `not covered yet`, and `why this?`.
   - Provide a path to adjust covered scope without forcing curriculum browsing.

3. **Reasoning method and transfer**
   - Make a reusable method feel valuable rather than abstract or childish.
   - Connect one attempted question to a genuinely different next question.

4. **Recall launch**
   - Replace the current dense configuration screen.
   - Make a five-to-ten-minute session start with one or two decisions at most.

5. **Progress**
   - High-level performance, assessed scope, evidence strength, and a cautious grade range.
   - Detailed official curriculum evidence available by drill-down.
   - `Not yet covered` must never look like failure.

6. **Authentic paper mode**
   - Reserved versus exposed paper state.
   - Paper-like layout, timing, and a clear warning before revealing answers.

7. **Optional natural-language control**
   - A student may type a compact instruction such as:
     `We have not covered ecology. Give me ten minutes on Biology and avoid my reserved paper.`
   - If used, show the structured interpretation before changing important scope or paper state.
   - Conversation controls the same product as the clickable UI; it is not a separate tutoring chat.

## Product Language

- Canonical phrase: `close the gap`.
- Prefer: `Try`, `Continue`, `Explore`, `Practise`, `Improve`, `Method`, `Why this?`, `Not covered
yet`.
- Avoid institutional, judgmental, or broken-object language.
- Do not use `learner` or `learn` in student-facing UI.
- Do not call available cards or question counts curriculum coverage.
- Use `mastered` only after independent transfer and later retention evidence.

## Visual Requirements

- High-fidelity, shippable product UI rather than concept art.
- British exam credibility with warm restraint; not childish, corporate, gamified, or neon.
- Clear typography and generous whitespace.
- Questions themselves are the most visually interesting content.
- Desktop and mobile should feel like the same product.
- Exam pages should resemble clean printed papers without pretending to be scanned PDFs.
- Progress should be readable without turning the home screen into analytics software.
- No decorative graphs unless they answer a real student question.

## Deliverables Per Concept

Create an isolated directory for the concept and do not inspect another concept directory.

1. `concept.md`
   - product thesis;
   - complete route/journey;
   - screen-by-screen behavior;
   - important interaction and copy decisions;
   - what the concept deliberately excludes.
2. `core-flow.png`
   - a polished journey board showing signed-in home, dynamic continuation, question destination, and
     reasoning-method transfer.
3. `support-flow.png`
   - a polished journey board showing recall launch, progress drill-down, taught-scope adjustment,
     and authentic-paper state.
4. Inspect both images for hierarchy, legibility, product realism, and consistency. Make one targeted
   visual revision if needed before saving the final files.

The boards are preview artifacts, not production assets.
