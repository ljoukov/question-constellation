-- Server-owned lifecycle for reviewed full-paper sittings. The browser keeps a
-- resumable copy for UX, but only this user-bound record can authorize
-- independent exam evidence.
CREATE TABLE user_paper_sitting_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  nonce_hash TEXT NOT NULL,
  paper_slug TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  review_fingerprint TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  total_marks INTEGER NOT NULL CHECK (total_marks > 0),
  question_groups_json TEXT NOT NULL CHECK (json_valid(question_groups_json)),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted', 'grading', 'complete')),
  started_at_ms INTEGER NOT NULL CHECK (started_at_ms > 0),
  submitted_at_ms INTEGER,
  completed_at_ms INTEGER,
  answers_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(answers_json)),
  response_durations_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(response_durations_json)),
  draft_revision INTEGER NOT NULL DEFAULT 0 CHECK (draft_revision >= 0),
  active_part_ref TEXT,
  active_part_started_at_ms INTEGER,
  results_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(results_json)),
  grade_responses_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(grade_responses_json)),
  next_question_index INTEGER NOT NULL DEFAULT 0
    CHECK (next_question_index >= 0),
  graded_question_refs_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(graded_question_refs_json)),
  in_flight_claim_id TEXT,
  in_flight_question_ref TEXT,
  in_flight_started_at_ms INTEGER,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  transition_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (status = 'in_progress' AND submitted_at_ms IS NULL)
    OR (status IN ('submitted', 'grading', 'complete') AND submitted_at_ms IS NOT NULL)
  ),
  CHECK (
    (status = 'complete' AND completed_at_ms IS NOT NULL)
    OR (status <> 'complete' AND completed_at_ms IS NULL)
  ),
  CHECK (
    (in_flight_claim_id IS NULL AND in_flight_question_ref IS NULL AND in_flight_started_at_ms IS NULL)
    OR (in_flight_claim_id IS NOT NULL AND in_flight_question_ref IS NOT NULL AND in_flight_started_at_ms IS NOT NULL)
  ),
  CHECK (
    (active_part_ref IS NULL AND active_part_started_at_ms IS NULL)
    OR (active_part_ref IS NOT NULL AND active_part_started_at_ms IS NOT NULL)
  )
);

CREATE INDEX idx_user_paper_sittings_user_paper_updated
  ON user_paper_sitting_sessions (user_id, paper_slug, updated_at DESC);

CREATE INDEX idx_user_paper_sittings_in_flight
  ON user_paper_sitting_sessions (status, in_flight_started_at_ms)
  WHERE in_flight_claim_id IS NOT NULL;

-- The application uses optimistic compare-and-swap transitions, and this
-- trigger is the final database fence against a lifecycle regression.
CREATE TRIGGER user_paper_sitting_sessions_one_way_status
BEFORE UPDATE OF status ON user_paper_sitting_sessions
FOR EACH ROW
WHEN NOT (
  NEW.status = OLD.status
  OR (OLD.status = 'in_progress' AND NEW.status = 'submitted')
  OR (OLD.status = 'submitted' AND NEW.status = 'grading')
  OR (OLD.status = 'grading' AND NEW.status = 'complete')
)
BEGIN
  SELECT RAISE(ABORT, 'paper sitting status cannot move backwards or skip a transition');
END;

-- User, approved review, server start, and the locked submission are immutable.
-- Grading may only append staged responses/results and advance its cursor.
CREATE TRIGGER user_paper_sitting_sessions_immutable_identity
BEFORE UPDATE ON user_paper_sitting_sessions
FOR EACH ROW
WHEN
  NEW.user_id IS NOT OLD.user_id
  OR NEW.nonce_hash IS NOT OLD.nonce_hash
  OR NEW.paper_slug IS NOT OLD.paper_slug
  OR NEW.source_document_id IS NOT OLD.source_document_id
  OR NEW.review_fingerprint IS NOT OLD.review_fingerprint
  OR NEW.reviewed_at IS NOT OLD.reviewed_at
  OR NEW.duration_minutes IS NOT OLD.duration_minutes
  OR NEW.total_marks IS NOT OLD.total_marks
  OR NEW.question_groups_json IS NOT OLD.question_groups_json
  OR NEW.started_at_ms IS NOT OLD.started_at_ms
  OR (
    OLD.submitted_at_ms IS NOT NULL
    AND (
      NEW.submitted_at_ms IS NOT OLD.submitted_at_ms
      OR NEW.answers_json IS NOT OLD.answers_json
      OR NEW.response_durations_json IS NOT OLD.response_durations_json
      OR NEW.draft_revision IS NOT OLD.draft_revision
      OR NEW.active_part_ref IS NOT OLD.active_part_ref
      OR NEW.active_part_started_at_ms IS NOT OLD.active_part_started_at_ms
    )
  )
  OR (OLD.completed_at_ms IS NOT NULL AND NEW.completed_at_ms IS NOT OLD.completed_at_ms)
BEGIN
  SELECT RAISE(ABORT, 'paper sitting identity and locked submission are immutable');
END;
