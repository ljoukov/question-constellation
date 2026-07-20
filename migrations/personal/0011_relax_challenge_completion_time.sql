-- A replay starts a new active run while retaining the learner's first
-- completion timestamp. That means completed_at can legitimately predate the
-- latest started_at; it only needs to remain no later than updated_at.
CREATE TABLE user_challenge_progress_relaxed (
  user_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL
    CHECK (length(challenge_id) BETWEEN 1 AND 120),
  started_at TEXT NOT NULL
    CHECK (length(started_at) BETWEEN 20 AND 40),
  updated_at TEXT NOT NULL
    CHECK (length(updated_at) BETWEEN 20 AND 40),
  completed_at TEXT
    CHECK (completed_at IS NULL OR length(completed_at) BETWEEN 20 AND 40),
  plays INTEGER NOT NULL
    CHECK (plays BETWEEN 1 AND 1000000),
  last_stage TEXT NOT NULL
    CHECK (last_stage IN ('showdown', 'diagnose', 'repair', 'transfer', 'complete')),
  best_score INTEGER
    CHECK (best_score IS NULL OR best_score IN (400, 425, 450, 475, 500)),
  best_time_ms INTEGER
    CHECK (best_time_ms IS NULL OR best_time_ms BETWEEN 0 AND 21600000),
  last_score INTEGER
    CHECK (last_score IS NULL OR last_score IN (400, 425, 450, 475, 500)),
  last_time_ms INTEGER
    CHECK (last_time_ms IS NULL OR last_time_ms BETWEEN 0 AND 21600000),
  CHECK (best_score IS NOT NULL OR best_time_ms IS NULL),
  CHECK (last_score IS NOT NULL OR last_time_ms IS NULL),
  CHECK (last_score IS NULL OR (best_score IS NOT NULL AND best_score >= last_score)),
  CHECK (updated_at >= started_at),
  CHECK (completed_at IS NULL OR completed_at <= updated_at),
  CHECK (last_stage != 'complete' OR completed_at IS NOT NULL),
  PRIMARY KEY (user_id, challenge_id)
);

INSERT INTO user_challenge_progress_relaxed (
  user_id,
  challenge_id,
  started_at,
  updated_at,
  completed_at,
  plays,
  last_stage,
  best_score,
  best_time_ms,
  last_score,
  last_time_ms
)
SELECT
  user_id,
  challenge_id,
  started_at,
  updated_at,
  completed_at,
  plays,
  last_stage,
  best_score,
  best_time_ms,
  last_score,
  last_time_ms
FROM user_challenge_progress;

DROP TABLE user_challenge_progress;

ALTER TABLE user_challenge_progress_relaxed
RENAME TO user_challenge_progress;

CREATE INDEX idx_user_challenge_progress_user_updated
  ON user_challenge_progress (user_id, updated_at DESC);
