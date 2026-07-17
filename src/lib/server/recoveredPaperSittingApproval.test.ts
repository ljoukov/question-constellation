import { describe, expect, it } from 'vitest';
import {
	extractSolvabilityReportPatch,
	parseRolloutJsonl,
	sha256Bytes,
	validateArchivedPhaseRollout,
	validateLivePaperState,
	validateRecoveredSolvabilityReport
} from '../../../scripts/lib/recovered-paper-sitting-review.mjs';

const sessionId = '019f6c61-e578-7b70-9d22-57ac77c1afab';
const turnId = '019f6c61-e875-7582-8159-3ce799320171';
const startedAt = '2026-07-16T19:23:03.716Z';
const finishedAt = '2026-07-16T19:29:28.486Z';

function reportFixture() {
	return {
		status: 'passed',
		sourceDocumentId: 'paper-1',
		minScore: 0.8,
		questionCount: 2,
		passed: 2,
		failed: 0,
		results: ['01.1', '01.2'].map((sourceQuestionRef) => ({
			sourceQuestionRef,
			status: 'passed',
			score: 1,
			studentVisibleSolvable: true,
			markSchemeFits: true,
			missingContext: [],
			renderFindings: [],
			requiredRepairs: [] as string[],
			rationale: `${sourceQuestionRef} has complete visible evidence.`
		})),
		rationale: 'Both questions are learner-visible and gradeable.'
	};
}

function rolloutFixture() {
	const report = `${JSON.stringify(reportFixture(), null, 2)}\n`;
	const patch = [
		'*** Begin Patch',
		'*** Add File: solvability-report.json',
		...report
			.trimEnd()
			.split('\n')
			.map((line) => `+${line}`),
		'*** End Patch'
	].join('\n');
	const records = [
		{
			timestamp: startedAt,
			type: 'session_meta',
			payload: { session_id: sessionId, id: sessionId }
		},
		{
			timestamp: startedAt,
			type: 'event_msg',
			payload: { type: 'task_started', turn_id: turnId }
		},
		{
			timestamp: '2026-07-16T19:23:05.517Z',
			type: 'turn_context',
			payload: {
				turn_id: turnId,
				model: 'gpt-5.6-sol',
				effort: 'max',
				collaboration_mode: {
					settings: { model: 'gpt-5.6-sol', reasoning_effort: 'max' }
				}
			}
		},
		{
			timestamp: '2026-07-16T19:25:00.000Z',
			type: 'turn_context',
			payload: {
				turn_id: turnId,
				model: 'gpt-5.6-sol',
				effort: 'max',
				collaboration_mode: {
					settings: { model: 'gpt-5.6-sol', reasoning_effort: 'max' }
				}
			}
		},
		{
			timestamp: '2026-07-16T19:28:00.000Z',
			type: 'response_item',
			payload: {
				type: 'custom_tool_call',
				name: 'exec',
				call_id: 'call-report',
				input: `const patch = ${JSON.stringify(patch)};\ntext(await tools.apply_patch(patch));\n`
			}
		},
		{
			timestamp: finishedAt,
			type: 'event_msg',
			payload: { type: 'task_complete', turn_id: turnId, last_agent_message: 'Passed.' }
		}
	];
	const bytes = Buffer.from(`${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
	return { records, bytes, report };
}

function phaseEvidence(bytes: Buffer) {
	return {
		status: 'passed',
		finalMessage: 'Passed.',
		run: {
			status: 'passed',
			threadId: sessionId,
			model: 'gpt-5.6-sol',
			thinkingLevel: 'max',
			startedAt,
			finishedAt
		},
		rollout: {
			fileName: 'rollout.jsonl',
			sha256: sha256Bytes(bytes),
			sessionId
		}
	};
}

function liveRow(ref: string, response: Record<string, unknown> = { kind: 'lines' }) {
	return {
		source_question_ref: ref,
		marks: 1,
		status: 'published',
		needs_human_review: 0,
		overlay_id: `overlay-${ref}`,
		overlay_version: 'vision-v3',
		overlay_needs_human_review: 0,
		render_json: JSON.stringify({ response }),
		mark_scheme_count: 1,
		mark_scheme_mark_total: 1,
		checklist_count: 1,
		required_checklist_count: 1,
		checklist_review_issues: 0,
		model_answer_count: response.kind === 'lines' ? 1 : 0,
		model_answer_review_issues: 0,
		asset_review_issues: 0,
		missing_asset_delivery: 0,
		primary_chain_count: 1
	};
}

describe('recovered current-model rollout validation', () => {
	it('verifies exact archive identity across compacted turn contexts', () => {
		const { bytes } = rolloutFixture();
		const audit = validateArchivedPhaseRollout({
			phaseName: 'solvability',
			phaseEvidence: phaseEvidence(bytes),
			rolloutPath: '/sessions/rollout.jsonl',
			rolloutBytes: bytes
		});
		expect(audit).toMatchObject({
			status: 'passed',
			sessionId,
			turnId,
			model: 'gpt-5.6-sol',
			thinkingLevel: 'max'
		});
	});

	it('rejects a tampered archive, model, thinking level, or completion state', () => {
		const { bytes, records } = rolloutFixture();
		const evidence = phaseEvidence(bytes);
		expect(() =>
			validateArchivedPhaseRollout({
				phaseName: 'solvability',
				phaseEvidence: evidence,
				rolloutPath: '/sessions/rollout.jsonl',
				rolloutBytes: Buffer.concat([bytes, Buffer.from(' ')])
			})
		).toThrow(/SHA-256 mismatch/);

		const wrongModel = structuredClone(records);
		wrongModel[2].payload.model = 'another-model';
		const wrongModelBytes = Buffer.from(
			`${wrongModel.map((row) => JSON.stringify(row)).join('\n')}\n`
		);
		expect(() =>
			validateArchivedPhaseRollout({
				phaseName: 'solvability',
				phaseEvidence: phaseEvidence(wrongModelBytes),
				rolloutPath: '/sessions/rollout.jsonl',
				rolloutBytes: wrongModelBytes
			})
		).toThrow(/unexpected model/);

		const incomplete = records.slice(0, -1);
		const incompleteBytes = Buffer.from(
			`${incomplete.map((row) => JSON.stringify(row)).join('\n')}\n`
		);
		expect(() =>
			validateArchivedPhaseRollout({
				phaseName: 'solvability',
				phaseEvidence: phaseEvidence(incompleteBytes),
				rolloutPath: '/sessions/rollout.jsonl',
				rolloutBytes: incompleteBytes
			})
		).toThrow(/task_complete/);
	});

	it('reconstructs the report bytes exactly from the recorded add-file patch', () => {
		const { bytes, report } = rolloutFixture();
		const records = parseRolloutJsonl(bytes.toString('utf8'));
		const recovered = extractSolvabilityReportPatch(records);
		expect(recovered.bytes.toString('utf8')).toBe(report);
		expect(recovered.sha256).toBe(sha256Bytes(Buffer.from(report)));
	});
});

describe('recovered solvability and live D1 gates', () => {
	it('requires the exact live ref set and zero report repairs', () => {
		const report = reportFixture();
		expect(
			validateRecoveredSolvabilityReport({
				report,
				sourceDocumentId: 'paper-1',
				expectedRefs: ['01.1', '01.2']
			})
		).toMatchObject({ status: 'passed', questionCount: 2, failed: 0 });
		report.results[0].requiredRepairs.push('restore source');
		expect(() =>
			validateRecoveredSolvabilityReport({
				report,
				sourceDocumentId: 'paper-1',
				expectedRefs: ['01.1', '01.2']
			})
		).toThrow(/required repairs/);
	});

	it('accepts fully graded written and fixed responses in one reviewed overlay version', () => {
		const rows = [
			liveRow('01.1'),
			liveRow('01.2', {
				kind: 'choice',
				options: ['A', 'B', 'C'],
				correctAnswers: { answer: 'B' }
			})
		];
		expect(
			validateLivePaperState({
				sourceDocumentId: 'paper-1',
				questionRows: rows,
				expectedQuestionCount: 2,
				expectedMarkTotal: 2
			})
		).toMatchObject({ status: 'passed', questionCount: 2, markTotal: 2 });
	});

	it.each(['none', 'asset-canvas', 'drawing-box'])(
		'rejects recovered approval for an unsupported %s response',
		(kind) => {
			expect(() =>
				validateLivePaperState({
					sourceDocumentId: 'paper-1',
					questionRows: [liveRow('01.1', { kind })],
					expectedQuestionCount: 1,
					expectedMarkTotal: 1
				})
			).toThrow(new RegExp(`unsupported full-paper response kind ${kind}`));
		}
	);

	it('refuses missing assets, grading evidence, or a unique clean primary chain', () => {
		for (const mutation of [
			{ missing_asset_delivery: 1 },
			{ checklist_count: 0 },
			{ primary_chain_count: 2 }
		]) {
			const row = { ...liveRow('01.1'), ...mutation };
			expect(() =>
				validateLivePaperState({
					sourceDocumentId: 'paper-1',
					questionRows: [row],
					expectedQuestionCount: 1,
					expectedMarkTotal: 1
				})
			).toThrow();
		}
	});

	it('refuses a recovered four-mark row with only one mark of official grading coverage', () => {
		const row = {
			...liveRow('01.1'),
			marks: 4,
			mark_scheme_mark_total: 1,
			required_checklist_count: 1
		};
		expect(() =>
			validateLivePaperState({
				sourceDocumentId: 'paper-1',
				questionRows: [row],
				expectedQuestionCount: 1,
				expectedMarkTotal: 4
			})
		).toThrow(/grading evidence for only 1 of 4 marks/);
	});
});
