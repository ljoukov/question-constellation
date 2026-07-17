import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	supplementalRecoveryModelGate,
	validateSupplementalRecoveryPlan,
	validateSupplementalReplacementCard
} from '../../../scripts/lib/standard-study-card-supplemental-recovery.mjs';

const planPath = path.join(
	process.cwd(),
	'data/study-cards/supplemental-source-recovery/aqa-8525-hardware-software-mark-scheme-v1.json'
);

function loadPlan() {
	return validateSupplementalRecoveryPlan(JSON.parse(readFileSync(planPath, 'utf8')));
}

function replacementFixture(): Record<string, unknown> {
	const plan = loadPlan();
	const source = plan.sources.find((entry) => entry.id === plan.answerSourceId)!;
	return {
		...plan.requiredIdentity,
		kind: plan.retrieval.kind,
		visualCue: '💻',
		front: plan.retrieval.front,
		back: plan.retrieval.back,
		reverseFront: null,
		reverseBack: null,
		explanation:
			'The mark scheme defines software as program code or instructions and links it directly to hardware through execution or control.',
		memoryTip: null,
		choices: [
			{
				key: 'a',
				text: plan.retrieval.back,
				isCorrect: true,
				feedback:
					'Correct: the answer gives both the definition and the stated hardware relationship.',
				misconception: null
			},
			{
				key: 'b',
				text: 'Only the data stored by a computer.',
				isCorrect: false,
				feedback: 'This omits program, code or instructions and their relationship to hardware.',
				misconception: 'confuses-software-with-data-only'
			},
			{
				key: 'c',
				text: 'Instructions that operate without hardware.',
				isCorrect: false,
				feedback: 'The evidence explicitly relates the instructions to hardware.',
				misconception: 'separates-software-from-hardware'
			}
		],
		sourceExcerpt: source.excerpt,
		sourceLocator: source.locator
	};
}

describe('supplemental source study-card recovery', () => {
	it('pins the failed shard, exact AQA source identity, locator and excerpt', () => {
		const plan = loadPlan();
		const source = plan.sources.find((entry) => entry.id === plan.answerSourceId)!;

		expect(plan.batchId).toBe(
			'aqa-computer-science-8525-computer-science-all-descendants-01-ea3593b819-v1'
		);
		expect(plan.expectedBase).toMatchObject({
			candidateCount: 18,
			acceptedCount: 17,
			rejectedCount: 1
		});
		expect(source.kind).toBe('mark-scheme');
		expect(source.url).toBe(
			'https://cdn.sanity.io/files/p28bar15/green/642bc63cc1a2bde5150267668b706cbdaa16b9fc.pdf'
		);
		expect(source.sha256).toBe('f32360582e4f42933eabd545fd13e080fbf56ee6aa7e12c3996fc8f00593c21a');
		expect(source.locator).toBe('PDF page 9; question 09.1');
		expect(source.excerpt).toBe(
			'program / code / instructions (executed by / controls the operation of the\nhardware);'
		);
	});

	it('rejects source drift and any replacement that changes pinned evidence or identity', () => {
		const raw = JSON.parse(readFileSync(planPath, 'utf8'));
		raw.sources[1].locator = 'PDF page 8; question 08.1';
		expect(() => validateSupplementalRecoveryPlan(raw)).toThrow(/pinned PDF page 9/);

		const plan = loadPlan();
		const replacement = replacementFixture();
		expect(validateSupplementalReplacementCard(replacement, plan)).toBe(replacement);
		expect(() =>
			validateSupplementalReplacementCard(
				{ ...replacement, sourceExcerpt: 'Software controls hardware.' },
				plan
			)
		).toThrow(/pinned exact mark-scheme excerpt/);
		expect(() =>
			validateSupplementalReplacementCard(
				{ ...replacement, curriculumComponentId: `${replacement.curriculumComponentId}-other` },
				plan
			)
		).toThrow(/preserved identity/);
	});

	it('keeps model use off by default and requires both terminal queue and exact confirmation', () => {
		expect(
			supplementalRecoveryModelGate({
				generate: false,
				confirmRecovery: null,
				recoveryId: 'recovery-v1',
				queueTerminal: true,
				activeJobCount: 0
			})
		).toEqual({ allowed: false, reason: 'preflight-only' });
		expect(() =>
			supplementalRecoveryModelGate({
				generate: true,
				confirmRecovery: 'wrong',
				recoveryId: 'recovery-v1',
				queueTerminal: true,
				activeJobCount: 0
			})
		).toThrow(/confirm-recovery=recovery-v1/);
		expect(() =>
			supplementalRecoveryModelGate({
				generate: true,
				confirmRecovery: 'recovery-v1',
				recoveryId: 'recovery-v1',
				queueTerminal: false,
				activeJobCount: 2
			})
		).toThrow(/not terminal \(2 queued\/running job/);
	});
});
