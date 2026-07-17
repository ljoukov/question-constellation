import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	EXPECTED_STUDY_CARD_OFFERING_IDS,
	buildOfferingProfileStatements,
	classifyUnexpectedApiWrite,
	parseStudyCardOfferingBrowserArgs,
	validateExactOfferingCatalog,
	validateOfferingDeckRows,
	validateOfferingProfileSnapshot
} from '../../../scripts/validate-study-card-offering-browser.mjs';
import { DEV_AUTH_CLEANUP_CONFIRMATION } from '../../../scripts/cleanup-dev-auth-data.mjs';

const catalog = JSON.parse(
	readFileSync(path.resolve('data/curricula/curriculum-catalog.json'), 'utf8')
);
type OfferingPlan = {
	id: string;
	board: string;
	qualification: string;
	profileSubject: string;
	course: string;
	tier: string;
	specificationCode: string;
	specificationVersion: string;
	officialSourceUrl: string;
	selectableComponentIds: string[];
	browserTopicIds: string[] | null;
	literatureSelection: {
		modernText: string;
		nineteenthCenturyNovel: string;
		poetryCluster: string;
		shakespearePlay: string;
	} | null;
};
const plans = validateExactOfferingCatalog(catalog) as OfferingPlan[];
const biology = plans[0]!;
const literature = plans.at(-1)!;

describe('study-card 17-offering browser harness', () => {
	it('is read-only by default and requires both the write flag and exact confirmation', () => {
		expect(parseStudyCardOfferingBrowserArgs([])).toMatchObject({
			executeOfferingMatrix: false,
			confirm: null
		});
		expect(() =>
			parseStudyCardOfferingBrowserArgs([`--confirm=${DEV_AUTH_CLEANUP_CONFIRMATION}`])
		).toThrow(/only valid together/);
		expect(() =>
			parseStudyCardOfferingBrowserArgs(['--execute-offering-matrix', '--confirm=wrong'])
		).toThrow(/requires --confirm/);
		expect(
			parseStudyCardOfferingBrowserArgs([
				'--execute-offering-matrix',
				`--confirm=${DEV_AUTH_CLEANUP_CONFIRMATION}`
			])
		).toMatchObject({ executeOfferingMatrix: true });
	});

	it('locks the exact ordered 17 offerings and their official selectable topics', () => {
		expect(plans.map((plan) => plan.id)).toEqual(EXPECTED_STUDY_CARD_OFFERING_IDS);
		expect(plans).toHaveLength(17);
		expect(plans.every((plan) => plan.selectableComponentIds.length > 0)).toBe(true);
		expect(literature.browserTopicIds).toHaveLength(4);

		const missing = structuredClone(catalog);
		missing.offerings.pop();
		expect(() => validateExactOfferingCatalog(missing)).toThrow(/exact ordered 17-offering/);

		const wrongScope = structuredClone(catalog);
		wrongScope.offerings[0].selectableComponentIds[0] = 'not-an-official-topic';
		expect(() => validateExactOfferingCatalog(wrongScope)).toThrow(/non-selectable topic/);
	});

	it('accepts canonical three- and four-choice runtime cards in one exact offering', () => {
		const threeChoice = runtimeRow({ id: 'three-choice-card', choiceCount: 3 });
		const fourChoice = runtimeRow({ id: 'four-choice-card', choiceCount: 4 });
		const deck = validateOfferingDeckRows(biology, [threeChoice, fourChoice]);
		expect(deck.cards.map((card) => card.choiceCount)).toEqual([3, 4]);
		expect(deck.browserCards).toHaveLength(2);
		expect(deck.cardSetHash).toMatch(/^[a-f0-9]{64}$/);
	});

	it('fails closed for zero, duplicate, wrong-offering, and wrong-topic runtime rows', () => {
		expect(() => validateOfferingDeckRows(biology, [])).toThrow(/zero cards/);
		const row = runtimeRow({ id: 'duplicate' });
		expect(() => validateOfferingDeckRows(biology, [row, row])).toThrow(/duplicate card/);
		expect(() =>
			validateOfferingDeckRows(biology, [runtimeRow({ offeringId: 'wrong-offering' })])
		).toThrow(/wrong or incomplete scope/);
		expect(() =>
			validateOfferingDeckRows(biology, [runtimeRow({ topicComponentId: 'wrong-topic' })])
		).toThrow(/wrong or incomplete scope/);
	});

	it('requires the runtime card identities to equal the accepted artifact identities', () => {
		const row = runtimeRow({ id: 'exact-card' });
		const expected = [
			{
				id: row.id,
				releaseId: row.release_id,
				offeringId: row.offering_id,
				topicComponentId: row.topic_component_id,
				curriculumComponentId: row.curriculum_component_id,
				contentRevision: row.content_revision,
				contentHash: row.content_hash,
				choiceCount: 3
			}
		];
		expect(() => validateOfferingDeckRows(biology, [row], expected)).not.toThrow();
		expect(() =>
			validateOfferingDeckRows(biology, [row], [{ ...expected[0], contentHash: 'b'.repeat(64) }])
		).toThrow(/accepted local artifact union/);
	});

	it('builds one exact disposable Personal scope and validates its stored identity', () => {
		const statements = buildOfferingProfileStatements(biology);
		expect(statements.some((row) => row.sql.includes('user_subject_curriculum_scopes'))).toBe(true);
		expect(statements.some((row) => row.sql.includes("'all', '[]'"))).toBe(true);
		expect(statements.flatMap((row) => row.params ?? [])).toContain(biology.course);

		expect(validateOfferingProfileSnapshot(biology, profileSnapshot(biology))).toMatchObject({
			status: 'exact',
			scopeMode: 'all'
		});
		const wrong = profileSnapshot(biology);
		wrong.subjects[0].tier = 'Higher';
		expect(() => validateOfferingProfileSnapshot(biology, wrong)).toThrow(/exact offering/);
	});

	it('uses the exact four-text Literature scope and no generic curriculum-scope row', () => {
		const statements = buildOfferingProfileStatements(literature);
		expect(
			statements.some((row) => row.sql.includes('INSERT INTO user_english_literature_selections'))
		).toBe(true);
		expect(
			statements.some((row) => row.sql.includes('INSERT INTO user_subject_curriculum_scopes'))
		).toBe(false);
		expect(validateOfferingProfileSnapshot(literature, profileSnapshot(literature))).toMatchObject({
			status: 'exact',
			scopeMode: 'four-locked-texts'
		});
	});

	it('allows only Analytics writes and classifies recall/model writes as release failures', () => {
		const baseUrl = 'http://127.0.0.1:5173';
		expect(
			classifyUnexpectedApiWrite(
				{ method: 'POST', url: `${baseUrl}/api/analytics/events` },
				baseUrl
			)
		).toBeNull();
		expect(
			classifyUnexpectedApiWrite({ method: 'POST', url: `${baseUrl}/api/recall/review` }, baseUrl)
		).toBe('recall-review');
		expect(
			classifyUnexpectedApiWrite(
				{ method: 'POST', url: `${baseUrl}/api/questions/q1/grade` },
				baseUrl
			)
		).toBe('learner-model-or-grade');
		expect(
			classifyUnexpectedApiWrite(
				{ method: 'POST', url: `${baseUrl}/api/profile/import-local` },
				baseUrl
			)
		).toBe('unexpected-api-write');
	});
});

function runtimeRow({
	id = 'runtime-card',
	offeringId = biology.id,
	topicComponentId = biology.selectableComponentIds[0]!,
	choiceCount = 3
}: {
	id?: string;
	offeringId?: string;
	topicComponentId?: string;
	choiceCount?: 3 | 4;
} = {}) {
	const choices = Array.from({ length: choiceCount }, (_, index) => ({
		key: String.fromCharCode(97 + index),
		text: index === 0 ? 'Correct' : `Distractor ${index}`,
		isCorrect: index === 0,
		feedback: index === 0 ? 'Correct.' : 'Not correct.',
		misconception: index === 0 ? null : `misconception-${index}`
	}));
	return {
		id,
		release_id: 'release-id',
		board: biology.board,
		qualification: biology.qualification,
		subject: biology.profileSubject,
		offering_id: offeringId,
		topic_component_id: topicComponentId,
		curriculum_component_id: `${topicComponentId}:child`,
		front: 'What is the exact concept?',
		back: 'Correct',
		content_revision: 1,
		content_hash: 'a'.repeat(64),
		choices_json: JSON.stringify(choices)
	};
}

function profileSnapshot(plan: (typeof plans)[number]) {
	const snapshot = {
		profiles: [
			{
				selected_board: plan.board,
				selected_qualification: plan.qualification,
				selected_subject: plan.profileSubject,
				selected_tier: plan.tier
			}
		],
		subjects: [
			'Biology',
			'Chemistry',
			'Physics',
			'Computer Science',
			'Geography',
			'History',
			'English Language',
			'English Literature'
		].map((subject) => ({
			subject,
			board:
				subject === plan.profileSubject
					? plan.board
					: subject.startsWith('English ')
						? 'OCR'
						: 'AQA',
			qualification: plan.qualification,
			course:
				subject === plan.profileSubject
					? plan.course
					: ['Biology', 'Chemistry', 'Physics'].includes(subject)
						? 'Combined Science'
						: 'GCSE Subject',
			tier: subject === plan.profileSubject ? plan.tier : 'Higher',
			enabled: subject === plan.profileSubject ? 1 : 0
		})),
		scopes: [] as Array<Record<string, unknown>>,
		literature: [] as Array<Record<string, unknown>>
	};
	if (plan.profileSubject === 'English Literature') {
		snapshot.literature.push({
			board: 'OCR',
			specification_code: 'J352',
			modern_text: plan.literatureSelection!.modernText,
			nineteenth_century_novel: plan.literatureSelection!.nineteenthCenturyNovel,
			poetry_cluster: plan.literatureSelection!.poetryCluster,
			shakespeare_play: plan.literatureSelection!.shakespearePlay
		});
	} else {
		snapshot.scopes.push({
			subject: plan.profileSubject,
			board: plan.board,
			qualification: plan.qualification,
			course: plan.course,
			tier: plan.tier,
			specification_code: plan.specificationCode,
			specification_version: plan.specificationVersion,
			official_source_url: plan.officialSourceUrl,
			scope_mode: 'all',
			selected_component_ids_json: '[]'
		});
	}
	return snapshot;
}
