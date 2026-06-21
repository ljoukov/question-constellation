# Product Methodology

Question Constellation is a lightweight public GCSE question bank organized by answer chains: the hidden reasoning steps that turn a weak answer into a mark-scoring answer. It should feel like an exam-question atlas, not a generic chatbot, a full GCSE workspace, or a dashboard-first revision app.

For the detailed product flows, acquisition paths, screen specifications, and current mock boards, see [product-flows.md](product-flows.md).

## Core Doctrine

1. The first product surface should be a concrete public exam question, not a logged-in dashboard or abstract thinking taxonomy. Students should arrive from search, short-form content, teacher links, or direct sharing and immediately see a question they recognize as exam-relevant.

2. The core object is the answer chain. A topic says what content is involved; an answer chain says what reasoning steps earn marks. Example: `blood flow -> oxygen -> respiration -> energy -> pain`.

3. A constellation is a curated set of questions that look different but use the same answer chain. Nearby questions should be close matches; stretch and exam-transfer questions should make the same hidden logic work in less obvious contexts.

4. The answer chain should feel earned. The learner starts with a real question, sees what the weak answer misses, repairs the missing links, and only then saves the chain into Thinking Memory.

5. Thinking Memory is a post-practice retrieval surface. It should contain saved answer chains, recurring missing links, and review actions. It is not the main first-use taxonomy.

6. Runtime model use should be optional and lightweight. Curated questions, model answers, mark checklists, common weak answers, and static answer-chain structure should carry most of the product value. Model-based checking belongs behind explicit actions like `Check answer`.

7. The core loop is: public question -> answer chain -> constellation -> practice -> saved memory -> transfer.

## Product Implications

- Build public, indexable question and answer-chain pages before heavy private workspace surfaces.
- Keep exam metadata visible: board, tier, paper, topic, mark value, and question type.
- Do not make chat the primary interface.
- Do not make a full planner or progress dashboard the first product bet.
- Do not mix unrelated subjects inside the first-use flow.
- Use subjects and GCSE topics as the learner's familiar entry path, but make answer chains the distinctive structure.
- Reveal and save chains after practice or guided repair, not before.
- Keep transfer visible through `start`, `near`, `stretch`, and `exam transfer` question labels.
- Keep Thinking Memory as one library of earned chains, with subject filters only as navigation help.
