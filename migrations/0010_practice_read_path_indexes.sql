CREATE INDEX IF NOT EXISTS idx_model_answers_question_confidence
  ON model_answers (question_id, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_constellations_answer_chain_confidence
  ON constellations (answer_chain_id, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_question_answer_chains_question_public
  ON question_answer_chains (
    question_id,
    needs_human_review,
    is_primary DESC,
    fit_confidence DESC
  );
