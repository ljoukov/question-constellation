ALTER TABLE user_profiles
ADD COLUMN visual_effects_enabled INTEGER NOT NULL DEFAULT 1
CHECK (visual_effects_enabled IN (0, 1));
