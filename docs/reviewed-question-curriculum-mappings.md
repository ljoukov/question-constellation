# Reviewed question-to-curriculum mappings

The ordinary curriculum importer maps a question only when the stored question carries an exact
official `spec_ref` or an unambiguous official component identity. It deliberately does not classify
prompt text or topic words. A reviewed mapping artifact is the fail-closed exception for a finite
question cohort whose stored source evidence is strong but whose topic identifiers were not imported.

An AQA Science `spec_ref` may contain several exact official section ids. The importer accepts it
only when the complete value consists of dotted section ids, separators, and known `RPA`/`RP`/`WS`
annotations. It maps every exact section id, makes the first source id primary, and records the
remaining mappings as secondary. An annotation is retained in `mapping_notes` but never converted
into a guessed curriculum component. Any unparsed text or missing component withholds the entire
compound mapping from the exact path.

## AQA Computer Science cohort

The checked-in artifact is
`data/curricula/question-mappings/aqa-computer-science-8525-reviewed-v1.json`. It accounts for every
clean published question in the six imported AQA Computer Science papers:

- 65 questions are from official components `85201` and `85202` in 2021. These are the withdrawn
  AQA 8520 qualification, not 8525. Every row retains prompt, answer-chain and mark-scheme evidence
  in the artifact and is explicitly withheld from both 8525 specifications.
- 163 questions are from official 8525 components in 2022–2024. Each is reviewed into one of the
  eight learner-selectable v1.2 chapters.
- The official v1.2-to-v1.3 source-PDF delta was reviewed separately. V1.3 removes optical storage,
  star/bus LAN topology, FTP/UDP and Ethernet/Wi-Fi protocol-family detail. One imported question,
  2023 Paper 2 Q13.3 on bus versus star topology, is therefore mapped to v1.2 but explicitly withheld
  from v1.3. The other 162 remain supported by the 2027 specification.

This produces 163 mapping rows for `aqa-gcse-computer-science-8525-v1.2-2026` and 162 mapping rows
for `aqa-gcse-computer-science-8525-v1.3-2027`. The current v1.3 chapter coverage is:

| Chapter                                      | Current questions |
| -------------------------------------------- | ----------------: |
| 3.1 Fundamentals of algorithms               |                 7 |
| 3.2 Programming                              |                29 |
| 3.3 Fundamentals of data representation      |                44 |
| 3.4 Computer systems                         |                37 |
| 3.5 Fundamentals of computer networks        |                12 |
| 3.6 Cyber security                           |                13 |
| 3.7 Relational databases and SQL             |                18 |
| 3.8 Ethical, legal and environmental impacts |                 2 |

## Residual Science and English Literature cohorts

Five additional checked-in ledgers account for previously unmapped clean questions without rerunning
the extraction models:

| Artifact                                                     | Scope | Mapped | Withheld |
| ------------------------------------------------------------ | ----: | -----: | -------: |
| `aqa-biology-8461-missing-spec-ref-reviewed-v1.json`         |    13 |      0 |       13 |
| `aqa-biology-8461-paper-2-missing-spec-ref-reviewed-v1.json` |    43 |     39 |        4 |
| `aqa-combined-physics-missing-spec-ref-reviewed-v1.json`     |    34 |     26 |        8 |
| `aqa-physics-8463-paper-1-missing-spec-ref-reviewed-v1.json` |    43 |     39 |        4 |
| `ocr-english-literature-j352-options-reviewed-v1.json`       |    72 |     68 |        4 |

The Science mappings target a learner-selectable chapter only when the official question and mark
evidence make that chapter deterministic. Generic calculation, scale, graph, uncertainty,
proportionality or study-validity items are explicitly withheld when the scientific setting alone
would be doing the classification work.

For AQA Separate Physics Paper 1 June 2024, the reviewed ledger maps 9 questions to Energy, 16 to
Electricity, 7 to Particle model of matter, and 7 to Atomic structure. It withholds Q02.5 because
the marks assess only a percentage-of-a-year calculation, plus Q07.1, Q07.3 and Q07.4 because their
marks assess generic error type, instrument resolution and zero-offset correction respectively.

The Literature ledger uses explicit paper id plus question reference decisions to target the exact
selectable studied text or poetry cluster. Four questions on the historical text _My Mother Said I
Never Should_ are withheld because that text is absent from the reviewed current option tree. They
are not mapped to the replacement text or to a generic paper.

These are artifact counts, not a claim about the final release database. New paper imports remain
eligible for the exact-reference path and the complete-disposition audit must be rerun after the last
cohort import and immediately before the curriculum write.

## Evidence and stale-data guards

Reviewed artifact schema v2 is used for every checked-in ledger. Every artifact entry contains the
official question-paper identity and file hash; each imported mark-scheme row now embeds its own
source-document identity, URL and file hash; imported
`spec_ref` and topic path; full stored learner prompt, self-contained prompt and context; the primary
answer-chain id, title, canonical text and fit note; and every imported mark-scheme row with its source
document and source reference. A stable SHA-256 digest covers that evidence. The import fails before
any write when:

- a whole-paper scope gains or loses a question, or an exact question-id scope loses an entry;
- a question id, paper id/hash, source reference, component, spec ref, topic path, year, prompt, chain
  or mark-scheme row changes;
- an official curriculum PDF hash/version changes;
- a target component no longer exists, moves specification, changes code, or ceases to be selectable;
- a question or target specification is not explicitly mapped or explicitly withheld; or
- the exact-identifier mapper and reviewed artifact disagree.

Mapping rows use `official_curriculum_importer:reviewed_artifact`, retain the artifact id and evidence
hash in `mapping_notes`, and remain subject to the existing ownership/conflict preflight.

## Commands

Rebuilding every artifact reads D1 evidence but does not mutate D1:

```sh
pnpm run build:reviewed-curriculum-mappings
```

The ordinary dry run now validates the checked-in artifact automatically:

```sh
pnpm run import:curricula -- --output=tmp/curriculum-import-dry-run.json
```

After all paper imports, require every clean published eligible question to be either mapped or
explicitly withheld. This command exits non-zero and lists every new gap:

```sh
pnpm run audit:curriculum-question-disposition
```

`--no-reviewed-mapping-artifacts` exists only for diagnostic comparison with the exact-identifier
path. A release write remains explicit and automatically enforces the same complete-disposition
preflight:

```sh
pnpm run import:curricula -- --write --output=tmp/curriculum-import-write.json
```

## Post-import checks

Run these against `QUESTION_DB` after the approved write. The write report's
`questionMapping.dispositionBySubjectArea` is the durable release-level mapped/withheld/unmapped
summary for the exact snapshot that was written.

Rerun the CLI audit as the authoritative pre- and post-write check. A raw `NOT EXISTS` SQL query is
not equivalent because explicitly withheld questions intentionally have no fake mapping row.

The Computer Science-specific invariants remain:

```sql
SELECT specification_id, COUNT(DISTINCT question_id) AS questions
FROM question_curriculum_components
WHERE mapping_source = 'official_curriculum_importer:reviewed_artifact'
  AND specification_id IN (
    'aqa-gcse-computer-science-8525-v1.2-2026',
    'aqa-gcse-computer-science-8525-v1.3-2027'
  )
GROUP BY specification_id
ORDER BY specification_id;
-- v1.2: 163; v1.3: 162
```

```sql
SELECT cc.code, COUNT(DISTINCT qcc.question_id) AS questions
FROM question_curriculum_components qcc
JOIN curriculum_components cc ON cc.id = qcc.curriculum_component_id
WHERE qcc.specification_id = 'aqa-gcse-computer-science-8525-v1.3-2027'
  AND qcc.mapping_source = 'official_curriculum_importer:reviewed_artifact'
GROUP BY cc.code
ORDER BY cc.code;
-- 3.1=7, 3.2=29, 3.3=44, 3.4=37, 3.5=12, 3.6=13, 3.7=18, 3.8=2
```

```sql
SELECT COUNT(*) AS invalid_legacy_mappings
FROM question_curriculum_components qcc
JOIN questions q ON q.id = qcc.question_id
WHERE q.component_code IN ('85201', '85202')
  AND qcc.specification_id IN (
    'aqa-gcse-computer-science-8525-v1.2-2026',
    'aqa-gcse-computer-science-8525-v1.3-2027'
  );
-- 0
```

```sql
SELECT COUNT(*) AS removed_topology_in_current
FROM question_curriculum_components
WHERE question_id = 'computer-science-2023-june-paper-2-computing-concepts-qp-13-3'
  AND specification_id = 'aqa-gcse-computer-science-8525-v1.3-2027';
-- 0
```

The focused tests are in
`src/lib/server/reviewedQuestionCurriculumMapping.test.ts`; the existing curriculum import tests also
exercise owner-guarded and idempotent D1 upserts.
