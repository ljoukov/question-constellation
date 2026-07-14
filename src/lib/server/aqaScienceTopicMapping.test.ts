import { describe, expect, it } from 'vitest';
import {
	REVIEWED_TOPIC_BACKFILL_ROWS,
	aqaScienceTopicFieldsForImport
} from '../../../scripts/lib/aqa-science-topic-mapping.mjs';

describe('AQA science topic mapping', () => {
	it('freezes the reviewed eligible Biology/Chemistry snapshot without forcing method items', () => {
		expect(REVIEWED_TOPIC_BACKFILL_ROWS).toHaveLength(104);
		expect(new Set(REVIEWED_TOPIC_BACKFILL_ROWS.map((row) => row.id)).size).toBe(104);
		expect(REVIEWED_TOPIC_BACKFILL_ROWS.filter((row) => row.topicCode)).toHaveLength(91);
		expect(REVIEWED_TOPIC_BACKFILL_ROWS.filter((row) => !row.topicCode)).toHaveLength(13);
		expect(
			REVIEWED_TOPIC_BACKFILL_ROWS.filter((row) => !row.topicCode).every(
				(row) =>
					row.reason?.includes('Working-scientifically') || row.reason?.includes('investigation')
			)
		).toBe(true);
	});

	it('resolves every reviewed mapped row only when its full source identity agrees', () => {
		for (const row of REVIEWED_TOPIC_BACKFILL_ROWS.filter((candidate) => candidate.topicCode)) {
			const mapped = aqaScienceTopicFieldsForImport({
				id: row.id,
				sourceDocumentId: row.sourceDocumentId,
				sourceQuestionRef: row.sourceQuestionRef,
				subjectArea: row.subjectArea,
				sourceSubject: row.course === 'Combined Science' ? 'Combined Science' : row.subjectArea,
				componentCode: row.componentCode,
				topicPath: [],
				specRef: null
			});
			expect(mapped.specRef, row.id).toBe(row.topicCode);
			expect(mapped.topicPath, row.id).toEqual([row.subjectArea, mapped.topic?.title]);
			expect(mapped.provenance, row.id).toContain('reviewed_question_mapping');

			const wrongSource = aqaScienceTopicFieldsForImport({
				id: row.id,
				sourceDocumentId: `${row.sourceDocumentId}-wrong`,
				sourceQuestionRef: row.sourceQuestionRef,
				subjectArea: row.subjectArea,
				sourceSubject: row.course === 'Combined Science' ? 'Combined Science' : row.subjectArea,
				componentCode: row.componentCode,
				topicPath: [],
				specRef: null
			});
			expect(wrongSource.topic, row.id).toBeNull();
		}
	});

	it('leaves deliberately unresolved working-scientifically questions unmapped', () => {
		for (const row of REVIEWED_TOPIC_BACKFILL_ROWS.filter((candidate) => !candidate.topicCode)) {
			const mapped = aqaScienceTopicFieldsForImport({
				id: row.id,
				sourceDocumentId: row.sourceDocumentId,
				sourceQuestionRef: row.sourceQuestionRef,
				subjectArea: row.subjectArea,
				sourceSubject: row.subjectArea,
				componentCode: row.componentCode,
				topicPath: [],
				specRef: null,
				promptText: 'A photosynthesis graph asks for a mean and an anomalous result.'
			});
			expect(mapped.topic, row.id).toBeNull();
			expect(mapped.topicPath, row.id).toEqual([]);
			expect(mapped.specRef, row.id).toBeNull();
		}
	});

	it('canonicalizes an explicit official sub-reference or exact chapter title', () => {
		expect(
			aqaScienceTopicFieldsForImport({
				subjectArea: 'Chemistry',
				sourceSubject: 'Combined Science',
				componentCode: '8464C2H',
				specRef: '5.8.1.2',
				topicPath: []
			})
		).toMatchObject({
			specRef: '5.8',
			topicPath: ['Chemistry', 'Chemical analysis'],
			provenance: 'explicit_official_topic'
		});

		expect(
			aqaScienceTopicFieldsForImport({
				subjectArea: 'Biology',
				sourceSubject: 'Biology',
				componentCode: '8461/2H',
				specRef: null,
				topicPath: ['AQA Biology', 'Inheritance, variation and evolution']
			})
		).toMatchObject({
			specRef: '4.6',
			topicPath: ['Biology', 'Inheritance, variation and evolution'],
			provenance: 'explicit_official_topic'
		});
	});

	it('derives a future reused chain only when that chain is chapter-specific and curated', () => {
		expect(
			aqaScienceTopicFieldsForImport({
				id: 'future-question',
				subjectArea: 'Chemistry',
				sourceSubject: 'Combined Science',
				componentCode: '8464C2H',
				answerChainId: 'chem-chain-chromatography-rf-relationship',
				topicPath: [],
				specRef: null
			})
		).toMatchObject({
			specRef: '5.8',
			topicPath: ['Chemistry', 'Chemical analysis'],
			provenance: 'reviewed_chain_mapping'
		});

		expect(
			aqaScienceTopicFieldsForImport({
				id: 'future-question',
				subjectArea: 'Biology',
				sourceSubject: 'Biology',
				componentCode: '8461/1H',
				answerChainId: 'bio-chain-control-variable-kept-constant-valid-investigation',
				topicPath: [],
				specRef: null
			})
		).toMatchObject({ topic: null, topicPath: [], specRef: null, provenance: null });
	});

	it('does not overwrite conflicting trusted source fields', () => {
		const mapped = aqaScienceTopicFieldsForImport({
			subjectArea: 'Chemistry',
			sourceSubject: 'Combined Science',
			componentCode: '8464C2H',
			specRef: '5.7.1',
			topicPath: ['Chemistry', 'Chemical analysis']
		});
		expect(mapped).toMatchObject({
			specRef: '5.7.1',
			topicPath: ['Chemistry', 'Chemical analysis'],
			topic: null,
			provenance: 'conflicting_trusted_evidence'
		});

		expect(
			aqaScienceTopicFieldsForImport({
				subjectArea: 'Biology',
				sourceSubject: 'Biology',
				componentCode: '8461/1H',
				specRef: '4.4.1.1; 4.1.1.2',
				topicPath: []
			})
		).toMatchObject({
			specRef: '4.4.1.1; 4.1.1.2',
			topicPath: [],
			topic: null,
			provenance: 'conflicting_trusted_evidence'
		});
	});
});
