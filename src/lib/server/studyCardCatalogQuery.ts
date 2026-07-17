export const STUDY_CARD_RUNTIME_IMPORT_OWNER = 'study-card-import/v1';

/** Positional parameter order for `studyCardRuntimeCatalogQuery`. */
export const studyCardRuntimeCatalogParameters = [
	'board',
	'subject',
	'offeringId',
	'topicComponentId'
] as const;

/**
 * Runtime-safe, one-row-per-card catalog query. Import/review/coverage gates
 * are deliberately part of the SQL contract so callers cannot accidentally
 * expose an accepted-but-incomplete release or a withheld deck.
 */
export const studyCardRuntimeCatalogQuery = `
WITH requested_scope(board, subject, offering_id, topic_component_id) AS (
  SELECT ?, ?, ?, ?
)
SELECT card.id,
       card.release_id,
       card.concept_key,
       card.board,
       card.qualification,
       card.subject,
       card.kind,
       card.emoji,
       card.front,
       card.back,
       card.reverse_front,
       card.reverse_back,
       card.explanation,
       card.memory_tip,
       card.content_revision,
       card.content_hash,
       target.offering_id,
       target.curriculum_component_id,
       target.topic_component_id,
       target.is_primary,
       target.confidence,
       target_component.code AS target_code,
       topic_component.code AS topic_code,
       topic_component.title AS topic_title,
       topic_component.paper AS topic_paper,
       (
         SELECT source.source_kind
         FROM study_card_sources source
         WHERE source.card_id = card.id
           AND source.import_owner = '${STUDY_CARD_RUNTIME_IMPORT_OWNER}'
         ORDER BY source.id
         LIMIT 1
       ) AS source_kind,
       (
         SELECT source.source_url
         FROM study_card_sources source
         WHERE source.card_id = card.id
           AND source.import_owner = '${STUDY_CARD_RUNTIME_IMPORT_OWNER}'
         ORDER BY source.id
         LIMIT 1
       ) AS source_url,
       (
         SELECT source.source_title
         FROM study_card_sources source
         WHERE source.card_id = card.id
           AND source.import_owner = '${STUDY_CARD_RUNTIME_IMPORT_OWNER}'
         ORDER BY source.id
         LIMIT 1
       ) AS source_title,
       (
         SELECT source.source_locator
         FROM study_card_sources source
         WHERE source.card_id = card.id
           AND source.import_owner = '${STUDY_CARD_RUNTIME_IMPORT_OWNER}'
         ORDER BY source.id
         LIMIT 1
       ) AS source_locator,
       (
         SELECT source.rights_basis
         FROM study_card_sources source
         WHERE source.card_id = card.id
           AND source.import_owner = '${STUDY_CARD_RUNTIME_IMPORT_OWNER}'
         ORDER BY source.id
         LIMIT 1
       ) AS rights_basis,
       (
         SELECT json_group_array(
           json_object(
             'key', ordered_choice.choice_key,
             'text', ordered_choice.text,
             'isCorrect', CASE WHEN ordered_choice.is_correct = 1 THEN json('true') ELSE json('false') END,
             'feedback', ordered_choice.feedback,
             'misconception', ordered_choice.misconception
           )
         )
         FROM (
           SELECT choice_key, text, is_correct, feedback, misconception
           FROM study_card_choices
           WHERE card_id = card.id
             AND import_owner = '${STUDY_CARD_RUNTIME_IMPORT_OWNER}'
           ORDER BY display_order
         ) ordered_choice
       ) AS choices_json
FROM study_card_releases release
JOIN requested_scope requested
JOIN study_cards card
  ON card.release_id = release.id
JOIN study_card_targets target
  ON target.card_id = card.id
JOIN study_deck_coverage coverage
  ON coverage.release_id = card.release_id
 AND coverage.offering_id = target.offering_id
 AND coverage.topic_component_id = target.topic_component_id
JOIN curriculum_offerings offering
  ON offering.id = target.offering_id
JOIN curriculum_components target_component
  ON target_component.id = target.curriculum_component_id
 AND target_component.specification_id = offering.specification_id
JOIN curriculum_components topic_component
  ON topic_component.id = target.topic_component_id
 AND topic_component.specification_id = offering.specification_id
WHERE release.status = 'imported'
  AND release.schema_version = 'standard-study-deck-v1'
  AND release.import_owner = '${STUDY_CARD_RUNTIME_IMPORT_OWNER}'
  AND card.status = 'published'
  AND card.needs_human_review = 0
  AND card.import_owner = '${STUDY_CARD_RUNTIME_IMPORT_OWNER}'
  AND target.reviewed = 1
  AND target.import_owner = '${STUDY_CARD_RUNTIME_IMPORT_OWNER}'
  AND coverage.status = 'ready'
  AND coverage.reviewed = 1
  AND coverage.import_owner = '${STUDY_CARD_RUNTIME_IMPORT_OWNER}'
  AND offering.enabled = 1
  AND offering.board = card.board
  AND offering.qualification = card.qualification
  AND offering.profile_subject = card.subject
  AND topic_component.selectable = 1
  AND json_valid(offering.selectable_component_ids_json) = 1
  AND EXISTS (
    SELECT 1
    FROM json_each(offering.selectable_component_ids_json)
    WHERE value = target.topic_component_id
  )
  AND card.board = requested.board
  AND card.subject = requested.subject
  AND target.offering_id = requested.offering_id
  AND target.topic_component_id = COALESCE(
    requested.topic_component_id,
    target.topic_component_id
  )
  AND target.curriculum_component_id = (
    SELECT candidate.curriculum_component_id
    FROM study_card_targets candidate
    WHERE candidate.card_id = card.id
      AND candidate.offering_id = requested.offering_id
      AND candidate.reviewed = 1
      AND candidate.import_owner = '${STUDY_CARD_RUNTIME_IMPORT_OWNER}'
      AND candidate.topic_component_id = COALESCE(
        requested.topic_component_id,
        candidate.topic_component_id
      )
    ORDER BY candidate.is_primary DESC,
             candidate.confidence DESC,
             candidate.topic_component_id,
             candidate.curriculum_component_id
    LIMIT 1
  )
ORDER BY card.kind, card.concept_key, card.id
`;
