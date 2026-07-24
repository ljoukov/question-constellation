import { describe, expect, it } from 'vitest';
import {
	buildChainEcho,
	buildDiagnosisReasonItems,
	buildEvidenceSweep,
	buildLinkOrder,
	challengeInterludeDefinitions,
	challengeInterludeScore,
	challengeMemorySteps,
	isLinkOrderCorrect,
	restoreLinkOrder,
	shuffledDiagnosisReasons,
	weaknessLensOptions
} from './challengeInterludes';

describe('challenge interludes', () => {
	it('splits both authored arrow forms into compact memory steps', () => {
		expect(challengeMemorySteps('Cause → mechanism ⟶ outcome')).toEqual([
			'Cause',
			'mechanism',
			'outcome'
		]);
		expect(challengeMemorySteps('Different feature, clear direction, requested count')).toEqual([
			'Different feature',
			'clear direction',
			'requested count'
		]);
		expect(challengeMemorySteps('Thinking distance = speed × reaction time')).toEqual([
			'Thinking distance',
			'speed × reaction time'
		]);
	});

	it('builds a stable middle-link echo without elimination choices', () => {
		const first = buildChainEcho('Antigen → specific antibody → memory → faster response');
		const second = buildChainEcho('Antigen → specific antibody → memory → faster response');

		expect(first).toEqual(second);
		expect(first.hiddenIndex).toBe(2);
		expect(first.hiddenStep).toBe('memory');
		expect(first).not.toHaveProperty('options');
	});

	it('keeps one earning statement and up to two reviewed near misses in a mark sweep', () => {
		const items = buildEvidenceSweep(
			[
				{ id: 'correct', text: 'Complete link', feedback: 'Earns it.', correct: true },
				{
					id: 'near',
					text: 'Relevant but vague',
					feedback: 'Needs the mechanism.',
					correct: false
				},
				{
					id: 'wrong',
					text: 'Wrong direction',
					feedback: 'Direction is reversed.',
					correct: false
				},
				{ id: 'extra', text: 'Fourth option', feedback: 'Unused.', correct: false }
			],
			'biology-example'
		);

		expect(items).toHaveLength(3);
		expect(items.filter((item) => item.earnsMark)).toHaveLength(1);
		expect(items.map((item) => item.id)).not.toContain('extra');
		expect(items.map((item) => item.id)).not.toEqual(['correct', 'near', 'wrong']);
		expect(
			buildEvidenceSweep(
				[
					{ id: 'correct', text: 'Complete link', feedback: 'Earns it.', correct: true },
					{
						id: 'near',
						text: 'Relevant but vague',
						feedback: 'Needs the mechanism.',
						correct: false
					},
					{
						id: 'wrong',
						text: 'Wrong direction',
						feedback: 'Direction is reversed.',
						correct: false
					}
				],
				'biology-example'
			)
		).toEqual(items);
	});

	it('builds a deterministic, initially shuffled chain that can be restored without drag and drop', () => {
		const first = buildLinkOrder(['Cause', 'Mechanism', 'Outcome'], 'biology-example');
		const second = buildLinkOrder(['Cause', 'Mechanism', 'Outcome'], 'biology-example');

		expect(first).toEqual(second);
		expect(isLinkOrderCorrect(first)).toBe(false);
		expect(restoreLinkOrder(first).map((item) => item.label)).toEqual([
			'Cause',
			'Mechanism',
			'Outcome'
		]);
		expect(isLinkOrderCorrect(restoreLinkOrder(first))).toBe(true);
	});

	it('builds a stable diagnosis-to-reviewed-reason matching set', () => {
		const choices = [
			{ id: 'right', text: 'Missing mechanism', feedback: 'The link is absent.', correct: true },
			{ id: 'near', text: 'Missing unit', feedback: 'No calculation is needed.', correct: false },
			{ id: 'wrong', text: 'Too concise', feedback: 'Length is not the issue.', correct: false }
		];
		const items = buildDiagnosisReasonItems(choices, 'biology-example');
		const reasons = shuffledDiagnosisReasons(items, 'biology-example');

		expect(items).toHaveLength(3);
		expect(reasons).toHaveLength(3);
		expect(new Set(reasons.map((reason) => reason.id))).toEqual(
			new Set(choices.map((choice) => choice.id))
		);
		expect(reasons.map((reason) => reason.id)).not.toEqual(items.map((item) => item.id));
		expect(buildDiagnosisReasonItems(choices, 'biology-example')).toEqual(items);
	});

	it('offers two beats at each of three energy levels without rewarding harder choices', () => {
		expect(challengeInterludeDefinitions.map((definition) => definition.id)).toEqual([
			'faded-examiner',
			'chain-echo',
			'evidence-sweep',
			'weakness-lens',
			'link-order',
			'reason-match'
		]);
		expect(
			Object.groupBy(challengeInterludeDefinitions, (definition) => definition.intensity)
		).toMatchObject({
			Calm: expect.arrayContaining([
				expect.objectContaining({ id: 'faded-examiner' }),
				expect.objectContaining({ id: 'weakness-lens' })
			]),
			Light: expect.arrayContaining([
				expect.objectContaining({ id: 'chain-echo' }),
				expect.objectContaining({ id: 'link-order' })
			]),
			Sharp: expect.arrayContaining([
				expect.objectContaining({ id: 'evidence-sweep' }),
				expect.objectContaining({ id: 'reason-match' })
			])
		});
		expect(weaknessLensOptions).toHaveLength(4);
		expect(
			new Set(
				challengeInterludeDefinitions.map((definition) => challengeInterludeScore(definition.id))
			)
		).toEqual(new Set([50]));
	});
});
