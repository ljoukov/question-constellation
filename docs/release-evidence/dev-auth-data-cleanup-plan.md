# Disposable development-auth cleanup

The fixed local-test identity is `ux-cleanup-test-user`. Its data must remain in
place until browser and learner-facing model validation are finished. No cleanup
has been executed as part of preparing this plan.

## Fail-closed command

Read-only inventory:

```sh
node scripts/cleanup-dev-auth-data.mjs
```

The inventory refuses to proceed if the exact Personal or Analytics table set
has changed, or if any directly associated analytics row is not tagged
`development`. It does not print row contents, credentials, session IDs, or
model prompts.

After all validation is complete, deletion requires both write flags:

```sh
node scripts/cleanup-dev-auth-data.mjs \
  --write \
  --confirm=delete-ux-cleanup-test-user
```

The command uses guarded D1 batches and verifies zero directly traceable rows
afterward. The Analytics and Personal databases cannot share one transaction;
the two batches are exact and idempotent so an interrupted run can be retried.

## Personal database scope

The script enumerates all 13 current user tables before it will write. It
deletes derived/logical children before their source/profile rows:

1. `user_recommendation_decisions`
2. `user_learner_component_states`
3. `user_recall_coverage_misses`
4. `user_gap_builder_runs`
5. `user_chain_gaps`
6. `user_learning_evidence`
7. `user_question_attempts`
8. `user_question_drafts`
9. `user_recall_card_reviews`
10. `user_subject_curriculum_scopes`
11. `user_english_literature_selections`
12. `user_profile_subjects`
13. `user_profiles`

Every predicate is exact: `user_id = 'ux-cleanup-test-user'`, except
`user_profiles.uid`.

## Analytics database scope and consequences

The target session set is the union of sessions, events, and model runs whose
stored `user_id` is the disposable uid. Cleanup removes:

- every request and event in those development sessions, including anonymous
  events earlier in the same session;
- every model run in those sessions, plus sessionless model runs with the exact
  uid;
- the target session rows themselves;
- AI summaries only when `requested_by` is the uid or the literal uid occurs in
  their stored source snapshot, prompt, reasoning, or result;
- admin-audit rows with the exact requester or literal uid in metadata.

An admin-audit match blocks automatic cleanup because that table has no
environment column. Any production-tagged session, request, event, model run,
or directly matched AI summary also blocks the guarded batch.

`analytics_ai_summaries` does not retain the source session IDs that contributed
to an overview. Therefore a development summary may have indirectly aggregated
test sessions without containing the literal uid; exact uid-scoped deletion
cannot identify such a row. Development overviews should be regenerated or
disregarded after cleanup. Production analytics are never broadened into this
cleanup scope.
