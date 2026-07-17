-- Earlier approval importers checked extraction completeness but not the
-- runtime's full-paper grading constraint. Keep review evidence, but withdraw
-- every approval whose reviewed overlay contains a marked drawing/canvas/none
-- response that cannot produce a complete automatic paper score.
UPDATE question_paper_sitting_reviews
   SET status = 'withdrawn',
       updated_at = CURRENT_TIMESTAMP
 WHERE status = 'approved'
   AND EXISTS (
     SELECT 1
       FROM questions q
       JOIN question_rendering_overlays qro
         ON qro.question_id = q.id
        AND qro.overlay_version = question_paper_sitting_reviews.overlay_version
        AND qro.needs_human_review = 0
      WHERE q.source_document_id = question_paper_sitting_reviews.source_document_id
        AND q.marks > 0
        AND json_extract(qro.render_json, '$.response.kind') IN (
          'none',
          'asset-canvas',
          'drawing-box'
        )
   );
