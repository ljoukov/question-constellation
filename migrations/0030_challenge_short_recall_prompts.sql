PRAGMA foreign_keys = ON;

-- Curated, versioned prompts for the lightweight typed recall beat.
-- The challenge catalogue remains the identity authority; this table keeps the
-- learner-facing stem, accepted answers and generated spelling allowances
-- inspectable and independently refreshable.
CREATE TABLE IF NOT EXISTS challenge_short_recall_prompts (
  challenge_id TEXT PRIMARY KEY
    CHECK (
      challenge_id = trim(challenge_id)
      AND length(challenge_id) BETWEEN 1 AND 160
    ),
  prompt_stem TEXT NOT NULL
    CHECK (
      prompt_stem = trim(prompt_stem)
      AND length(prompt_stem) BETWEEN 8 AND 320
      AND (
        length(prompt_stem) - length(replace(prompt_stem, '___', ''))
      ) = 3
    ),
  canonical_answer TEXT NOT NULL
    CHECK (
      canonical_answer = trim(canonical_answer)
      AND length(canonical_answer) BETWEEN 1 AND 80
      AND instr(canonical_answer, char(10)) = 0
      AND instr(canonical_answer, char(13)) = 0
    ),
  accepted_aliases_json TEXT NOT NULL DEFAULT '[]'
    CHECK (
      json_valid(accepted_aliases_json)
      AND json_type(accepted_aliases_json) = 'array'
    ),
  spelling_variants_json TEXT NOT NULL DEFAULT '[]'
    CHECK (
      json_valid(spelling_variants_json)
      AND json_type(spelling_variants_json) = 'array'
    ),
  preferred_hidden_step_index INTEGER NOT NULL
    CHECK (preferred_hidden_step_index BETWEEN 0 AND 31),
  content_version TEXT NOT NULL
    CHECK (
      content_version = trim(content_version)
      AND length(content_version) BETWEEN 1 AND 80
    ),
  content_sha256 TEXT NOT NULL
    CHECK (
      length(content_sha256) = 64
      AND content_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_challenge_short_recall_prompts_version
  ON challenge_short_recall_prompts (content_version, challenge_id);
