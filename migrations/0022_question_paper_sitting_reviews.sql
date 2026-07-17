-- Full-paper sitting is deliberately opt-in. A rendering overlay on one extracted
-- subpart is not evidence that an official paper is complete or learner-solvable.
CREATE TABLE IF NOT EXISTS question_paper_sitting_reviews (
  source_document_id TEXT PRIMARY KEY REFERENCES source_documents(id) ON DELETE CASCADE,
  past_paper_entry_id TEXT UNIQUE,
  scope TEXT NOT NULL CHECK (scope = 'complete_official_paper'),
  overlay_version TEXT NOT NULL,
  expected_question_count INTEGER NOT NULL CHECK (expected_question_count > 0),
  expected_total_marks INTEGER NOT NULL CHECK (expected_total_marks > 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  question_refs_json TEXT NOT NULL,
  solvability_report_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'withdrawn')),
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_question_paper_sitting_reviews_status
  ON question_paper_sitting_reviews (status, past_paper_entry_id);
