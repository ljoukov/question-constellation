PRAGMA foreign_keys = ON;

-- Runtime practice now requires the exact canonical `source_complete` status
-- for source-dependent English Literature tasks. These three June 2023 poetry rows are
-- the only pre-existing non-seed rows known to be affected. Their two printed
-- poem pages were already visually audited and are delivered through exact,
-- clean source-page assets. This migration updates metadata only after 0024
-- has removed the superseded guided seed. On a clean database these rows do
-- not exist, so the migration is an explicit no-op. If any targeted source,
-- question or asset does exist, the complete reviewed set is still required.
CREATE TABLE _migration_0025_expected_questions (
  question_id TEXT PRIMARY KEY,
  source_question_ref TEXT NOT NULL,
  first_label TEXT NOT NULL,
  second_label TEXT NOT NULL
);

INSERT INTO _migration_0025_expected_questions (
  question_id,
  source_question_ref,
  first_label,
  second_label
) VALUES
  (
    'ocr-j352-02-jun23-01-1a',
    '01.1a',
    'Question 1 printed poems page 4',
    'Question 1 printed poems page 5'
  ),
  (
    'ocr-j352-02-jun23-02-1a',
    '02.1a',
    'Question 2 printed poems page 6',
    'Question 2 printed poems page 7'
  ),
  (
    'ocr-j352-02-jun23-03-1a',
    '03.1a',
    'Question 3 printed poems page 8',
    'Question 3 printed poems page 9'
  );

CREATE TABLE _migration_0025_expected_assets (
  asset_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  public_path TEXT NOT NULL,
  r2_key TEXT NOT NULL
);

INSERT INTO _migration_0025_expected_assets (
  asset_id,
  question_id,
  source_label,
  public_path,
  r2_key
) VALUES
  (
    'ocr-j352-02-jun23-01-1a-asset-question-1-printed-poems-page-4',
    'ocr-j352-02-jun23-01-1a',
    'Question 1 printed poems page 4',
    '/images/papers/ocr-j352-02-qp-jun23/page-04.png',
    'images/papers/ocr-j352-02-qp-jun23/page-04.png'
  ),
  (
    'ocr-j352-02-jun23-01-1a-asset-question-1-printed-poems-page-5',
    'ocr-j352-02-jun23-01-1a',
    'Question 1 printed poems page 5',
    '/images/papers/ocr-j352-02-qp-jun23/page-05.png',
    'images/papers/ocr-j352-02-qp-jun23/page-05.png'
  ),
  (
    'ocr-j352-02-jun23-02-1a-asset-question-2-printed-poems-page-6',
    'ocr-j352-02-jun23-02-1a',
    'Question 2 printed poems page 6',
    '/images/papers/ocr-j352-02-qp-jun23/page-06.png',
    'images/papers/ocr-j352-02-qp-jun23/page-06.png'
  ),
  (
    'ocr-j352-02-jun23-02-1a-asset-question-2-printed-poems-page-7',
    'ocr-j352-02-jun23-02-1a',
    'Question 2 printed poems page 7',
    '/images/papers/ocr-j352-02-qp-jun23/page-07.png',
    'images/papers/ocr-j352-02-qp-jun23/page-07.png'
  ),
  (
    'ocr-j352-02-jun23-03-1a-asset-question-3-printed-poems-page-8',
    'ocr-j352-02-jun23-03-1a',
    'Question 3 printed poems page 8',
    '/images/papers/ocr-j352-02-qp-jun23/page-08.png',
    'images/papers/ocr-j352-02-qp-jun23/page-08.png'
  ),
  (
    'ocr-j352-02-jun23-03-1a-asset-question-3-printed-poems-page-9',
    'ocr-j352-02-jun23-03-1a',
    'Question 3 printed poems page 9',
    '/images/papers/ocr-j352-02-qp-jun23/page-09.png',
    'images/papers/ocr-j352-02-qp-jun23/page-09.png'
  );

CREATE TABLE _migration_0025_release_guard (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1)
);

INSERT INTO _migration_0025_release_guard (singleton)
SELECT CASE WHEN
  -- 0024 must already have removed the temporary guided seed.
  NOT EXISTS (
    SELECT 1 FROM questions
     WHERE id = 'english-lit-romeo-juliet-fate-guided'
  )
  AND (
    (
      -- Prove this is the exact reviewed official paper.
      EXISTS (
        SELECT 1
          FROM source_documents sd
         WHERE sd.id = 'ocr-j352-02-qp-jun23'
           AND sd.doc_type = 'question_paper'
           AND sd.board = 'OCR'
           AND sd.qualification = 'GCSE'
           AND sd.subject_area = 'English Literature'
           AND REPLACE(sd.component_code, ' ', '') = 'J352/02'
           AND sd.year = 2023
           AND REPLACE(sd.file_hash, 'sha256:', '') =
             'fac1175b0c234520f9cc9ea715fa86db3ac8f2072d396823dee13fe0b758a8ae'
      )
      -- Prove the exact three published question rows and their old metadata.
      AND (
        SELECT COUNT(*)
          FROM _migration_0025_expected_questions expected
          JOIN questions q ON q.id = expected.question_id
         WHERE q.source_document_id = 'ocr-j352-02-qp-jun23'
           AND q.source_question_ref = expected.source_question_ref
           AND q.board = 'OCR'
           AND q.qualification = 'GCSE'
           AND q.subject_area = 'English Literature'
           AND REPLACE(q.component_code, ' ', '') = 'J352/02'
           AND q.year = 2023
           AND q.marks = 20
           AND q.status = 'published'
           AND q.needs_human_review = 0
           AND json_valid(q.self_containment_json) = 1
           AND json_extract(q.self_containment_json, '$.status') = 'self_contained'
           AND json_type(q.self_containment_json, '$.required_asset_labels') = 'array'
           AND json_array_length(q.self_containment_json, '$.required_asset_labels') = 2
           AND EXISTS (
             SELECT 1
               FROM json_each(q.self_containment_json, '$.required_asset_labels') label
              WHERE label.value = expected.first_label
           )
           AND EXISTS (
             SELECT 1
               FROM json_each(q.self_containment_json, '$.required_asset_labels') label
              WHERE label.value = expected.second_label
           )
      ) = 3
      -- Prove all six exact, delivered, review-clean assets and no extra source
      -- asset for any of the three questions.
      AND (
        SELECT COUNT(*)
          FROM _migration_0025_expected_assets expected
          JOIN question_assets qa ON qa.id = expected.asset_id
         WHERE qa.question_id = expected.question_id
           AND qa.source_label = expected.source_label
           AND REPLACE(LOWER(COALESCE(qa.role, '')), '_', '-') = 'source-page'
           AND qa.required = 1
           AND qa.needs_human_review = 0
           AND qa.public_path = expected.public_path
           AND qa.r2_key = expected.r2_key
      ) = 6
      AND NOT EXISTS (
        SELECT 1
          FROM _migration_0025_expected_questions expected
         WHERE (
           SELECT COUNT(*)
             FROM question_assets qa
            WHERE qa.question_id = expected.question_id
              AND REPLACE(LOWER(COALESCE(qa.role, '')), '_', '-') IN (
                'source-page', 'source-text', 'printed-extract'
              )
         ) <> 2
      )
    )
    OR (
      -- A clean schema has none of the targeted content. Do not require a
      -- historical import merely to finish creating the database.
      NOT EXISTS (
        SELECT 1 FROM source_documents
         WHERE id = 'ocr-j352-02-qp-jun23'
      )
      AND NOT EXISTS (
        SELECT 1
          FROM _migration_0025_expected_questions expected
          JOIN questions q ON q.id = expected.question_id
      )
      AND NOT EXISTS (
        SELECT 1
          FROM _migration_0025_expected_assets expected
          JOIN question_assets qa ON qa.id = expected.asset_id
      )
    )
  )
THEN 1 ELSE 0 END;

UPDATE questions
   SET self_containment_json = json_set(
         self_containment_json,
         '$.status', 'source_complete',
         '$.requires_assets', json('true'),
         '$.required_source_count', 2,
         '$.complete_source_bundle', json('false')
       ),
       updated_at = CURRENT_TIMESTAMP
 WHERE id IN (
   'ocr-j352-02-jun23-01-1a',
   'ocr-j352-02-jun23-02-1a',
   'ocr-j352-02-jun23-03-1a'
 );

DELETE FROM _migration_0025_release_guard;

INSERT INTO _migration_0025_release_guard (singleton)
SELECT CASE WHEN
  (
    (
      SELECT COUNT(*)
        FROM _migration_0025_expected_questions expected
        JOIN questions q ON q.id = expected.question_id
       WHERE q.source_document_id = 'ocr-j352-02-qp-jun23'
         AND q.source_question_ref = expected.source_question_ref
         AND q.status = 'published'
         AND q.needs_human_review = 0
         AND json_valid(q.self_containment_json) = 1
         AND json_extract(q.self_containment_json, '$.status') = 'source_complete'
         AND json_extract(q.self_containment_json, '$.requires_assets') = 1
         AND CAST(json_extract(q.self_containment_json, '$.required_source_count') AS INTEGER) = 2
         AND json_extract(q.self_containment_json, '$.complete_source_bundle') = 0
         AND json_type(q.self_containment_json, '$.required_asset_labels') = 'array'
         AND json_array_length(q.self_containment_json, '$.required_asset_labels') = 2
         AND EXISTS (
           SELECT 1
             FROM json_each(q.self_containment_json, '$.required_asset_labels') label
            WHERE label.value = expected.first_label
         )
         AND EXISTS (
           SELECT 1
             FROM json_each(q.self_containment_json, '$.required_asset_labels') label
            WHERE label.value = expected.second_label
         )
    ) = 3
    AND (
      SELECT COUNT(*)
        FROM _migration_0025_expected_assets expected
        JOIN question_assets qa ON qa.id = expected.asset_id
       WHERE qa.question_id = expected.question_id
         AND qa.source_label = expected.source_label
         AND REPLACE(LOWER(COALESCE(qa.role, '')), '_', '-') = 'source-page'
         AND qa.required = 1
         AND qa.needs_human_review = 0
         AND qa.public_path = expected.public_path
         AND qa.r2_key = expected.r2_key
    ) = 6
  )
  OR (
    NOT EXISTS (
      SELECT 1 FROM source_documents
       WHERE id = 'ocr-j352-02-qp-jun23'
    )
    AND NOT EXISTS (
      SELECT 1
        FROM _migration_0025_expected_questions expected
        JOIN questions q ON q.id = expected.question_id
    )
    AND NOT EXISTS (
      SELECT 1
        FROM _migration_0025_expected_assets expected
        JOIN question_assets qa ON qa.id = expected.asset_id
    )
  )
THEN 1 ELSE 0 END;

DROP TABLE _migration_0025_release_guard;
DROP TABLE _migration_0025_expected_assets;
DROP TABLE _migration_0025_expected_questions;
