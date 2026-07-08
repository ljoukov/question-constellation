CREATE TABLE IF NOT EXISTS question_board_availability (
  qualification TEXT NOT NULL DEFAULT 'GCSE',
  subject TEXT NOT NULL,
  board TEXT NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (qualification, subject, board)
);

INSERT OR REPLACE INTO question_board_availability (
  qualification,
  subject,
  board,
  question_count,
  enabled,
  source,
  updated_at
)
VALUES
  ('GCSE', 'Biology', 'AQA', 64, 1, 'current_import_snapshot', CURRENT_TIMESTAMP),
  ('GCSE', 'Chemistry', 'AQA', 40, 1, 'current_import_snapshot', CURRENT_TIMESTAMP),
  ('GCSE', 'Physics', 'AQA', 356, 1, 'current_import_snapshot', CURRENT_TIMESTAMP),
  ('GCSE', 'Computer Science', 'AQA', 228, 1, 'current_import_snapshot', CURRENT_TIMESTAMP),
  ('GCSE', 'Geography', 'AQA', 507, 1, 'current_import_snapshot', CURRENT_TIMESTAMP),
  ('GCSE', 'History', 'AQA', 355, 1, 'current_import_snapshot', CURRENT_TIMESTAMP),
  ('GCSE', 'English Language', 'OCR', 116, 1, 'current_import_snapshot', CURRENT_TIMESTAMP),
  ('GCSE', 'English Literature', 'OCR', 255, 1, 'current_import_snapshot', CURRENT_TIMESTAMP);
