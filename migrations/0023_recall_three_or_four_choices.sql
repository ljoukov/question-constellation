-- Compiler-v10 recall cards may omit a contrived third distractor. The
-- artifact validator keeps compiler-v5 through compiler-v9 bundles frozen at
-- exactly four choices; this publication guard permits the current three- or
-- four-choice contract at the storage boundary.

DROP TRIGGER recall_cards_publish_choice_count;
DROP TRIGGER recall_cards_publish_unique_choice_text;

CREATE TRIGGER recall_cards_publish_choice_count
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND (
  SELECT COUNT(*) FROM recall_card_choices WHERE card_id = NEW.id
) NOT BETWEEN 3 AND 4
BEGIN
  SELECT RAISE(ABORT, 'recall card requires three or four choices');
END;

CREATE TRIGGER recall_cards_publish_unique_choice_text
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND (
  SELECT COUNT(DISTINCT lower(trim(text)))
  FROM recall_card_choices
  WHERE card_id = NEW.id
) <> (
  SELECT COUNT(*) FROM recall_card_choices WHERE card_id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'recall card choice text must be unique');
END;
