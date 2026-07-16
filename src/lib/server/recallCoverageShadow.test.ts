import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecallCard } from '$lib/recall/aqaScienceRecall';

const mocks = vi.hoisted(() => ({
	executePersonalQuery: vi.fn(),
	getCurriculumOffering: vi.fn(),
	getLearnerProfileSettings: vi.fn(),
	queryPersonalFirst: vi.fn(),
	queryPersonalRows: vi.fn(),
	queryRows: vi.fn()
}));

vi.mock('./db', () => ({
	executePersonalQuery: mocks.executePersonalQuery,
	queryPersonalFirst: mocks.queryPersonalFirst,
	queryPersonalRows: mocks.queryPersonalRows,
	queryRows: mocks.queryRows
}));
vi.mock('./curriculumCatalog', () => ({
	getCurriculumOffering: mocks.getCurriculumOffering
}));
vi.mock('./personalLearning', () => ({
	getLearnerProfileSettings: mocks.getLearnerProfileSettings
}));

import { isStableRecallCoverageGap, recordRecallCoverageMisses } from './recallCoverageShadow';

const user = {
	uid: 'learner-a',
	email: 'learner-a@example.test',
	name: 'Learner A',
	photoUrl: null
};

const stableGap = {
	id: 'gap-1',
	answer_chain_id: 'chain-1',
	chain_step_id: 'step-1',
	source_question_id: 'question-1',
	status: 'active',
	evidence_count: 2,
	distinct_item_count: 2,
	state: 'developing',
	uncertainty: 'medium'
};

function canonicalCard(componentId: string): RecallCard {
	return {
		id: 'canonical-card',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		topicId: 'biology-cell-biology',
		specRef: '4.1.1',
		kind: 'fact',
		visualCue: '🔬',
		front: 'Where is the genetic material enclosed?',
		back: 'Nucleus',
		distractors: ['Cytoplasm'],
		choiceKeys: { Nucleus: 'correct', Cytoplasm: 'wrong-location' },
		sourceUrl: 'https://example.test/specification',
		sourceTitle: 'Official specification',
		offeringId: 'offering-1',
		curriculumComponentId: componentId,
		topicComponentId: 'topic-1',
		contentRevision: 1,
		contentHash: 'a'.repeat(64)
	};
}

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.getLearnerProfileSettings.mockResolvedValue({
		subjects: [
			{
				enabled: true,
				subject: 'Biology',
				board: 'AQA',
				qualification: 'GCSE',
				course: 'Combined Science',
				tier: 'Higher'
			}
		]
	});
	mocks.getCurriculumOffering.mockResolvedValue({
		id: 'offering-1',
		specification: { id: 'spec-1' }
	});
	mocks.queryPersonalFirst.mockResolvedValue({
		board: 'AQA',
		qualification: 'GCSE',
		course: 'Combined Science',
		tier: 'Higher',
		scope_mode: 'all',
		selected_component_ids_json: '[]'
	});
	mocks.queryPersonalRows.mockResolvedValue([stableGap]);
	mocks.queryRows.mockResolvedValue([
		{
			question_id: 'question-1',
			curriculum_component_id: 'component-1',
			topic_component_id: 'topic-1'
		}
	]);
	mocks.executePersonalQuery.mockResolvedValue(undefined);
});

describe('recall coverage shadow', () => {
	it('requires an active repeated gap on distinct items', () => {
		expect(isStableRecallCoverageGap(stableGap)).toBe(true);
		expect(isStableRecallCoverageGap({ ...stableGap, evidence_count: 1 })).toBe(false);
		expect(isStableRecallCoverageGap({ ...stableGap, distinct_item_count: 1 })).toBe(false);
		expect(isStableRecallCoverageGap({ ...stableGap, status: 'awaiting_check' })).toBe(false);
		expect(isStableRecallCoverageGap({ ...stableGap, state: 'secure' })).toBe(false);
		expect(isStableRecallCoverageGap({ ...stableGap, source_question_id: null })).toBe(false);
	});

	it('records an idempotent private signal only when the exact reviewed target is uncovered', async () => {
		await expect(
			recordRecallCoverageMisses({ user, subject: 'Biology', canonicalCards: [] })
		).resolves.toBe(1);
		expect(mocks.executePersonalQuery).toHaveBeenCalledTimes(1);
		const [sql, params] = mocks.executePersonalQuery.mock.calls[0];
		expect(String(sql)).toContain(
			'ON CONFLICT(user_id, gap_id, offering_id, curriculum_component_id) DO UPDATE'
		);
		expect(String(sql)).toContain("'stable_gap_no_exact_reviewed_card'");
		expect(params).toEqual(
			expect.arrayContaining([user.uid, 'gap-1', 'question-1', 'component-1', 'topic-1'])
		);

		const firstId = params[0];
		mocks.executePersonalQuery.mockClear();
		await recordRecallCoverageMisses({ user, subject: 'Biology', canonicalCards: [] });
		expect(mocks.executePersonalQuery.mock.calls[0][1][0]).toBe(firstId);
	});

	it('does not signal when an exact reviewed canonical card exists', async () => {
		await expect(
			recordRecallCoverageMisses({
				user,
				subject: 'Biology',
				canonicalCards: [canonicalCard('component-1')]
			})
		).resolves.toBe(0);
		expect(mocks.executePersonalQuery).not.toHaveBeenCalled();
	});

	it('does not treat a nearby card as exact coverage', async () => {
		await expect(
			recordRecallCoverageMisses({
				user,
				subject: 'Biology',
				canonicalCards: [canonicalCard('component-nearby')]
			})
		).resolves.toBe(1);
	});

	it('does not signal outside the learner-selected official scope', async () => {
		mocks.queryPersonalFirst.mockResolvedValue({
			board: 'AQA',
			qualification: 'GCSE',
			course: 'Combined Science',
			tier: 'Higher',
			scope_mode: 'selected',
			selected_component_ids_json: JSON.stringify(['topic-other'])
		});
		await expect(
			recordRecallCoverageMisses({ user, subject: 'Biology', canonicalCards: [] })
		).resolves.toBe(0);
		expect(mocks.executePersonalQuery).not.toHaveBeenCalled();
	});

	it('uses authenticated-user predicates for every personal read and write', async () => {
		await recordRecallCoverageMisses({ user, subject: 'Biology', canonicalCards: [] });
		expect(mocks.queryPersonalFirst.mock.calls[0][1]).toEqual([user.uid, 'Biology']);
		expect(mocks.queryPersonalRows.mock.calls[0][1][0]).toBe(user.uid);
		expect(mocks.executePersonalQuery.mock.calls[0][1][1]).toBe(user.uid);
		expect(
			mocks.queryPersonalFirst.mock.calls[0][1].includes('learner-b') ||
				mocks.queryPersonalRows.mock.calls[0][1].includes('learner-b')
		).toBe(false);
	});
});
