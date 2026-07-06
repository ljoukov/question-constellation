CREATE TABLE IF NOT EXISTS public_route_payloads (
  id TEXT PRIMARY KEY,
  route_kind TEXT NOT NULL,
  route_path TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  source_version TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_public_route_payloads_kind
  ON public_route_payloads (route_kind);

CREATE INDEX IF NOT EXISTS idx_questions_source_document_order
  ON questions (source_document_id, display_order, source_question_ref);

CREATE INDEX IF NOT EXISTS idx_questions_public_subject
  ON questions (status, needs_human_review, subject_area, id);

CREATE INDEX IF NOT EXISTS idx_answer_chains_public
  ON answer_chains (status, needs_human_review, subject_area, id);

CREATE INDEX IF NOT EXISTS idx_common_weak_answers_question_public
  ON common_weak_answers (question_id, needs_human_review, confidence);
