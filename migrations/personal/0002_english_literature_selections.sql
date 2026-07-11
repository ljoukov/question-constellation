CREATE TABLE IF NOT EXISTS user_english_literature_selections (
  user_id TEXT PRIMARY KEY,
  board TEXT NOT NULL DEFAULT 'OCR',
  specification_code TEXT NOT NULL DEFAULT 'J352',
  modern_text TEXT,
  nineteenth_century_novel TEXT,
  poetry_cluster TEXT,
  shakespeare_play TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
