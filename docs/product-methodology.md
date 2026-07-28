# Product Methodology

Question Constellation is a lightweight public GCSE exam-question atlas. It should help a learner
answer a real question, understand which marking points they earned, improve the answer, and try
another relevant question. It should not feel like a generic chatbot, a full GCSE workspace, or a
dashboard-first revision app.

For the detailed routes and interaction states, see [product-flows.md](product-flows.md). For
extraction, mark-scheme alignment, internal answer-chain derivation, and D1 storage, see
[extraction-spec.md](extraction-spec.md).

## Core Doctrine

1. Start with a concrete public exam question. A learner arriving from search, a teacher link, or
   the question catalogue should immediately see a recognisable exam task and its metadata.

2. The learner-facing object is the question and its reviewed marking evidence. Internal chain,
   step, constellation, and gap records may help the system group questions or diagnose an answer,
   but they are implementation details rather than things the learner must understand.

3. The core loop is:

   ```text
   question -> answer -> check -> improve the whole answer -> try another question
   ```

4. Checking is diagnostic. Show which marking points were included and which are missing. Do not
   turn one missing point into a separate practice destination.

5. Improvement happens on the whole answer with the complete marking guidance visible. Practice
   happens on a fresh related question without that guidance pre-revealed.

6. Related questions should be chosen deliberately. Internal chain similarity may contribute to
   selection, but the learner only needs a clear `Try another question` action and a genuinely
   useful next task.

7. Runtime model use is optional and explicit. Curated questions, model answers, marking points,
   common weak answers, and reviewed evidence should carry most of the product value. Model-based
   checking belongs behind `Check answer`.

8. There is no standalone learner-facing chain, constellation, gap, repair, or thinking-memory
   taxonomy. Any future review surface must grow from completed question attempts and use plain
   learner language.

## Product Implications

- Keep question pages public, indexable, shareable, and useful before sign-in.
- Show exam metadata clearly: board, tier, paper, topic, mark value, and question type.
- Give each question page one obvious primary action: `Answer this question`.
- On the public question page, put model answers and marking guidance in an optional inline
  disclosure for learners who want to study before attempting. Never expose that disclosure in the
  practice attempt before `Check answer`.
- After checking, label marking points `Included` or `Missing`.
- Ask the learner to improve the complete answer, not to practise an isolated point.
- Continue directly to one suitable related question.
- Do not make chat, planning, progress dashboards, or internal learning taxonomies the primary
  interface.
- Do not expose `answer chain`, `link`, `missing link`, `constellation`, `gap`, `repair chain`,
  `close the gap`, or `practise this step` in the question journey.
- Preserve internal D1 chain and gap data until a separate data migration is deliberately planned.
