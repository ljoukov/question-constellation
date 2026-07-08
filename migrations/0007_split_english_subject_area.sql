PRAGMA foreign_keys = ON;

-- English Language and English Literature are separate GCSE exam entries.
-- The legacy shared "English" subject_area is retained only as a read fallback.

UPDATE source_documents
SET subject_area = subject
WHERE subject IN ('English Language', 'English Literature')
  AND COALESCE(subject_area, '') IN ('', 'English');

UPDATE questions
SET subject_area = subject
WHERE subject IN ('English Language', 'English Literature')
  AND COALESCE(subject_area, '') IN ('', 'English');

UPDATE answer_chains
SET subject_area = subject
WHERE subject IN ('English Language', 'English Literature')
  AND COALESCE(subject_area, '') IN ('', 'English');

UPDATE chain_families
SET subject_area = subject
WHERE subject IN ('English Language', 'English Literature')
  AND COALESCE(subject_area, '') IN ('', 'English');

UPDATE constellations
SET subject_area = subject
WHERE subject IN ('English Language', 'English Literature')
  AND COALESCE(subject_area, '') IN ('', 'English');

UPDATE cross_subject_chain_family_members
SET subject_area = subject
WHERE subject IN ('English Language', 'English Literature')
  AND COALESCE(subject_area, '') IN ('', 'English');

INSERT OR IGNORE INTO user_profile_subjects (
  user_id,
  subject,
  board,
  qualification,
  course,
  tier,
  enabled,
  current_grade,
  target_grade,
  created_at,
  updated_at
)
SELECT
  user_id,
  'English Language',
  board,
  qualification,
  'GCSE Subject',
  tier,
  enabled,
  current_grade,
  target_grade,
  created_at,
  CURRENT_TIMESTAMP
FROM user_profile_subjects
WHERE subject = 'English';

INSERT OR IGNORE INTO user_profile_subjects (
  user_id,
  subject,
  board,
  qualification,
  course,
  tier,
  enabled,
  current_grade,
  target_grade,
  created_at,
  updated_at
)
SELECT
  user_id,
  'English Literature',
  board,
  qualification,
  'GCSE Subject',
  tier,
  enabled,
  current_grade,
  target_grade,
  created_at,
  CURRENT_TIMESTAMP
FROM user_profile_subjects
WHERE subject = 'English';

DELETE FROM user_profile_subjects
WHERE subject = 'English';

UPDATE user_profiles
SET selected_subject = 'English Language',
    updated_at = CURRENT_TIMESTAMP
WHERE selected_subject = 'English';

UPDATE user_chain_gaps
SET subject = (
  SELECT q.subject
  FROM questions q
  WHERE q.id = user_chain_gaps.source_question_id
    AND q.subject IN ('English Language', 'English Literature')
)
WHERE EXISTS (
  SELECT 1
  FROM questions q
  WHERE q.id = user_chain_gaps.source_question_id
    AND q.subject IN ('English Language', 'English Literature')
)
AND COALESCE(subject, '') IN ('', 'English');

UPDATE user_recall_card_reviews
SET subject = 'English Language',
    updated_at = CURRENT_TIMESTAMP
WHERE subject = 'English';
