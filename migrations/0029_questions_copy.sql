UPDATE curriculum_notices
SET body = 'Questions from before 2024 use OCR''s earlier anthology. They are kept for essay practice and labelled with the other questions.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'ocr-j352-poetry-anthology-transition-2024';
