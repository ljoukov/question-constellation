PRAGMA foreign_keys = OFF;

-- Personal learning moved to PERSONAL_DB. These are the retired QUESTION_DB copies.
DROP TABLE IF EXISTS user_gap_builder_runs;
DROP TABLE IF EXISTS user_chain_gaps;
DROP TABLE IF EXISTS user_question_attempts;
DROP TABLE IF EXISTS user_question_drafts;
DROP TABLE IF EXISTS user_recall_card_reviews;
DROP TABLE IF EXISTS user_profile_subjects;
DROP TABLE IF EXISTS user_profiles;

PRAGMA foreign_keys = ON;

-- English Language and English Literature are canonical subject areas after migration 0007.
UPDATE source_documents
SET subject_area = subject
WHERE subject IN ('English Language', 'English Literature')
  AND subject_area IS NOT subject;

UPDATE questions
SET subject_area = subject
WHERE subject IN ('English Language', 'English Literature')
  AND subject_area IS NOT subject;

UPDATE answer_chains
SET subject_area = subject
WHERE subject IN ('English Language', 'English Literature')
  AND subject_area IS NOT subject;

UPDATE chain_families
SET subject_area = subject
WHERE subject IN ('English Language', 'English Literature')
  AND subject_area IS NOT subject;

UPDATE constellations
SET subject_area = subject
WHERE subject IN ('English Language', 'English Literature')
  AND subject_area IS NOT subject;

UPDATE cross_subject_chain_family_members
SET subject_area = subject
WHERE subject IN ('English Language', 'English Literature')
  AND subject_area IS NOT subject;

UPDATE curriculum_notices
SET body = 'OCR first assessed its revised anthology in June 2024. Questions from earlier years use the previous version. We keep those questions for essay practice.',
    evidence_json = '[{"sourceType":"official_board_update","label":"OCR anthology update","sourceUrl":"https://www.ocr.org.uk/administration/support-and-tools/subject-updates/gcse-english-literature-texts-655335/"},{"sourceType":"question_paper","label":"OCR J352/02 June 2023 question paper","sourceDocumentId":"ocr-j352-02-qp-jun23","sourceUrl":"https://www.ocr.org.uk/Images/705070-question-paper-exploring-poetry-and-shakespeare.pdf"},{"sourceType":"question_paper","label":"OCR J352/02 June 2024 question paper","sourceDocumentId":"ocr-j352-02-qp-jun24","sourceUrl":"https://www.ocr.org.uk/Images/727831-question-paper-exploring-poetry-and-shakespeare.pdf"}]',
    source = 'ocr_subject_update_with_editorial_policy',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'ocr-j352-poetry-anthology-transition-2024';
