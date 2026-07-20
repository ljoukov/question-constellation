CREATE INDEX IF NOT EXISTS idx_user_learning_evidence_supersedes
  ON user_learning_evidence (user_id, supersedes_evidence_id)
  WHERE supersedes_evidence_id IS NOT NULL;
