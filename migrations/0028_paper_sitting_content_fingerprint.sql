-- Approved sittings must be bound to the exact live render and grading inputs.
-- Existing approvals have no trustworthy fingerprint, so they fail closed and
-- must be explicitly re-reviewed with the updated approval command.
ALTER TABLE question_paper_sitting_reviews
  ADD COLUMN approved_content_fingerprint TEXT;

UPDATE question_paper_sitting_reviews
SET status = 'withdrawn',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'approved';
