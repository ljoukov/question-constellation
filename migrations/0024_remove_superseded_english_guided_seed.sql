PRAGMA foreign_keys = ON;

-- The hand-authored Romeo and Juliet graph was a temporary bridge and is not
-- official paper content. There are no learner rows that require compatibility,
-- so remove the exact legacy identities unconditionally. Runtime eligibility
-- already fails closed until a separately reviewed official replacement exists.
-- This also makes the schema history valid for a clean database: every DELETE
-- is an idempotent no-op when the seed was never installed.

DELETE FROM public_route_payloads
 WHERE route_path LIKE '/questions/english-lit-romeo-juliet-fate-guided%'
    OR payload_json LIKE '%english-lit-romeo-juliet-fate-guided%'
    OR payload_json LIKE '%english-chain-romeo-juliet-fate%'
    OR payload_json LIKE '%english-constellation-romeo-juliet-fate%';

DELETE FROM constellation_questions
 WHERE constellation_id = 'english-constellation-romeo-juliet-fate'
    OR question_id = 'english-lit-romeo-juliet-fate-guided';

DELETE FROM constellations
 WHERE id = 'english-constellation-romeo-juliet-fate';

DELETE FROM common_weak_answers
 WHERE question_id = 'english-lit-romeo-juliet-fate-guided'
    OR answer_chain_id = 'english-chain-romeo-juliet-fate';

DELETE FROM question_answer_chains
 WHERE question_id = 'english-lit-romeo-juliet-fate-guided'
    OR answer_chain_id = 'english-chain-romeo-juliet-fate';

DELETE FROM questions
 WHERE id = 'english-lit-romeo-juliet-fate-guided';

DELETE FROM answer_chains
 WHERE id = 'english-chain-romeo-juliet-fate';

DELETE FROM source_documents
 WHERE id = 'ocr-j352-02-jun24-romeo-juliet-fate';

DELETE FROM content_imports
 WHERE id = 'english-guided-romeo-juliet-fate-seed-v1';

UPDATE question_board_availability
   SET question_count = (
         SELECT COUNT(*)
           FROM questions q
          WHERE q.qualification = question_board_availability.qualification
            AND q.subject_area = question_board_availability.subject
            AND q.board = question_board_availability.board
            AND q.status = 'published'
            AND q.needs_human_review = 0
       ),
       source = 'migration-0024-live-count',
       updated_at = CURRENT_TIMESTAMP
 WHERE qualification = 'GCSE'
   AND subject = 'English Literature'
   AND board = 'OCR';
