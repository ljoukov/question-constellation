CREATE TABLE IF NOT EXISTS curriculum_notices (
  id TEXT PRIMARY KEY,
  board TEXT NOT NULL,
  qualification TEXT NOT NULL,
  subject TEXT NOT NULL,
  specification_code TEXT,
  content_area TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'curated',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_curriculum_notices_scope
  ON curriculum_notices (
    qualification,
    subject,
    board,
    specification_code,
    content_area,
    active,
    display_order
  );

INSERT INTO curriculum_notices (
  id,
  board,
  qualification,
  subject,
  specification_code,
  content_area,
  title,
  body,
  evidence_json,
  source,
  active,
  display_order,
  updated_at
)
VALUES (
  'ocr-j352-poetry-anthology-transition-2024',
  'OCR',
  'GCSE',
  'English Literature',
  'J352',
  'poetry',
  'Earlier poetry anthology',
  'Questions from before 2024 use OCR''s earlier anthology. They are kept for essay practice and labelled in the question bank.',
  '[{"sourceDocumentId":"ocr-j352-02-qp-jun23","sourceUrl":"https://www.ocr.org.uk/Images/705070-question-paper-exploring-poetry-and-shakespeare.pdf"},{"sourceDocumentId":"ocr-j352-02-qp-jun24","sourceUrl":"https://www.ocr.org.uk/Images/727831-question-paper-exploring-poetry-and-shakespeare.pdf"}]',
  'curated_cross_paper_review',
  1,
  10,
  CURRENT_TIMESTAMP
)
ON CONFLICT(id) DO UPDATE SET
  board = excluded.board,
  qualification = excluded.qualification,
  subject = excluded.subject,
  specification_code = excluded.specification_code,
  content_area = excluded.content_area,
  title = excluded.title,
  body = excluded.body,
  evidence_json = excluded.evidence_json,
  source = excluded.source,
  active = excluded.active,
  display_order = excluded.display_order,
  updated_at = CURRENT_TIMESTAMP;
