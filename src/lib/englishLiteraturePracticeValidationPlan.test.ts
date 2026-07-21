import { classifyEnglishLiteratureTask } from './server/questionData';
import {
	ENGLISH_LITERATURE_VALIDATION_TASK_KINDS,
	auditEnglishLiteratureValidationCandidate,
	buildEnglishLiteraturePracticeValidationPlan,
	classifyEnglishLiteratureValidationTask,
	validateCompletedEnglishLiteraturePracticeEvidence,
	type EnglishLiteratureValidationCandidate,
	type EnglishLiteratureValidationTaskKind
} from './englishLiteraturePracticeValidationPlan';
import { describe, expect, it } from 'vitest';

const promptByTaskKind: Record<EnglishLiteratureValidationTaskKind, string> = {
	'poetry-comparison': 'Compare how these two poems present conflict.',
	'extract-comparison': 'Compare how fear is presented in these two extracts.',
	'extract-and-wider':
		'Explore how Shakespeare presents fear. Refer to this extract and elsewhere in the play.',
	'whole-text-judgement':
		"'The character is selfish.' How far do you agree? Explore at least two moments from the novel.",
	'single-text-analysis':
		'Explore another moment in the novel where the character shows responsibility.'
};

function makeCandidate(
	taskKind: EnglishLiteratureValidationTaskKind,
	index: number,
	overrides: Partial<EnglishLiteratureValidationCandidate> = {}
): EnglishLiteratureValidationCandidate {
	const questionId = `${taskKind}-${index}`;
	const sourceDependent = ['poetry-comparison', 'extract-comparison', 'extract-and-wider'].includes(
		taskKind
	);
	const requiredSourceCount = taskKind === 'extract-and-wider' ? 1 : 2;
	const labels = sourceDependent
		? Array.from(
				{ length: requiredSourceCount },
				(_, sourceIndex) => `${questionId} printed source ${sourceIndex + 1}`
			)
		: [];
	const assets = labels.map((label, sourceIndex) => ({
		id: `${questionId}-source-${sourceIndex + 1}`,
		publicPath: `/images/${questionId}-source-${sourceIndex + 1}.png`,
		role: 'source-page',
		sourceLabel: label,
		altText: label,
		required: true,
		needsHumanReview: false
	}));
	const markId = `${questionId}-ms-1`;
	return {
		questionId,
		sourceDocumentId: `ocr-j352-${index % 2 === 0 ? '01' : '02'}-qp-jun24`,
		sourceQuestionRef: `${index + 1}.0`,
		promptText: promptByTaskKind[taskKind],
		contextText: sourceDependent ? 'The complete printed source is shown above.' : null,
		selfContainedPromptText: promptByTaskKind[taskKind],
		selfContainmentJson: JSON.stringify(
			sourceDependent
				? {
						status: 'source_complete',
						requires_context: true,
						requires_assets: true,
						required_source_count: requiredSourceCount,
						required_asset_labels: labels
					}
				: {
						status: 'self_contained',
						is_self_contained: true,
						requires_context: false,
						requires_assets: false,
						required_source_count: 0
					}
		),
		status: 'published',
		needsHumanReview: false,
		board: 'OCR',
		subject: 'English Literature',
		paper: index % 2 === 0 ? 'J352/01' : 'J352/02',
		series: 'June 2024',
		topic: `${taskKind} topic ${index}`,
		overlayId: `${questionId}-overlay`,
		overlayNeedsHumanReview: false,
		renderingOverlay: {
			stemBlocks: assets.map((asset) => ({ kind: 'figure', assetId: asset.id })),
			promptBlocks: [{ kind: 'paragraph', text: promptByTaskKind[taskKind] }]
		},
		assets,
		markSchemeItems: [
			{
				id: markId,
				itemType: 'level_descriptor',
				text: 'Develop a clear response using precise textual references and analysis.',
				marks: 20,
				sourceRef: 'MS p.12 row 3',
				sourceDocumentId: `ocr-j352-${index % 2 === 0 ? '01' : '02'}-ms-jun24`
			}
		],
		checklistItems: [
			{
				id: `${questionId}-check-1`,
				text: 'Use precise evidence and explain the writer’s methods.',
				required: true,
				markSchemeItemIds: [markId],
				needsHumanReview: false
			}
		],
		modelAnswers: [
			{
				id: `${questionId}-model`,
				answerText:
					'The writer makes the character’s fear visible through a precise shift in language, then develops its significance across the response.',
				derivation: 'generated_from_mark_scheme',
				supportingMarkSchemeItemIds: [markId],
				needsHumanReview: false
			}
		],
		primaryChain: {
			id: `${questionId}-chain`,
			status: 'published',
			needsHumanReview: false,
			linkNeedsHumanReview: false,
			stepCount: 4
		},
		routeProbe: {
			checked: true,
			available: true,
			status: 307,
			location: `/questions/${questionId}/practice/task`,
			stepStatus: 200
		},
		...overrides
	};
}

describe('English Literature post-import validation planning', () => {
	it.each(ENGLISH_LITERATURE_VALIDATION_TASK_KINDS)(
		'matches the runtime task classifier for %s',
		(taskKind) => {
			const candidate = makeCandidate(taskKind, 0);
			expect(
				classifyEnglishLiteratureValidationTask({
					subject: candidate.subject,
					promptText: candidate.promptText,
					contextText: candidate.contextText,
					paper: candidate.paper
				})
			).toBe(taskKind);
			expect(
				classifyEnglishLiteratureTask({
					subject: candidate.subject,
					promptText: candidate.promptText,
					contextText: candidate.contextText,
					paper: candidate.paper
				})
			).toBe(taskKind);
		}
	);

	it('fails a two-extract comparison unless both complete sources are visible', () => {
		const complete = makeCandidate('extract-comparison', 0);
		expect(auditEnglishLiteratureValidationCandidate(complete).blockingIssues).toEqual([]);

		const oneAsset = complete.assets?.slice(0, 1) ?? [];
		const incomplete = {
			...complete,
			assets: oneAsset,
			renderingOverlay: {
				stemBlocks: oneAsset.map((asset) => ({ kind: 'figure', assetId: asset.id })),
				promptBlocks: [{ kind: 'paragraph', text: complete.promptText }]
			}
		};
		expect(auditEnglishLiteratureValidationCandidate(incomplete).blockingIssues).toEqual(
			expect.arrayContaining([
				'runtime_practice_source_gate_failed',
				'required_source_asset_missing',
				'present_source_count_mismatch'
			])
		);
	});

	it('requires the canonical source_complete status for source-dependent tasks', () => {
		const candidate = makeCandidate('extract-and-wider', 0, {
			selfContainmentJson: JSON.stringify({
				status: 'self_contained',
				requires_context: true,
				requires_assets: true,
				required_source_count: 1,
				required_asset_labels: ['extract-and-wider-0 printed source 1']
			})
		});
		expect(auditEnglishLiteratureValidationCandidate(candidate).blockingIssues).toContain(
			'self_containment_status_not_source_complete'
		);
	});

	it('fails closed when examiner guidance has no exact document and locator provenance', () => {
		const candidate = makeCandidate('whole-text-judgement', 0);
		const ungrounded = {
			...candidate,
			renderingOverlay: {
				...(candidate.renderingOverlay as Record<string, unknown>),
				metadata: {
					examinerReportGuidance: ['Candidates needed a controlled line of argument.']
				}
			}
		};
		expect(auditEnglishLiteratureValidationCandidate(ungrounded).blockingIssues).toContain(
			'examiner_guidance_provenance_missing'
		);

		const grounded = {
			...ungrounded,
			renderingOverlay: {
				...(ungrounded.renderingOverlay as Record<string, unknown>),
				metadata: {
					examinerReportGuidance: ['Candidates needed a controlled line of argument.'],
					examinerReportProvenance: {
						sourceDocumentId: 'ocr-j352-01-er-jun24',
						sourceRef: 'ER p.7, Question 4'
					}
				}
			}
		};
		expect(auditEnglishLiteratureValidationCandidate(grounded).blockingIssues).toEqual([]);
	});

	it('rejects guided rubric provenance and placeholder model-answer outlines', () => {
		const candidate = makeCandidate('whole-text-judgement', 0);
		const mark = candidate.markSchemeItems![0];
		const broken = {
			...candidate,
			markSchemeItems: [{ ...mark, sourceRef: 'guided-rubric' }],
			modelAnswers: [
				{
					...candidate.modelAnswers![0],
					answerText: 'A strong response would use precise references and sustained analysis.'
				}
			]
		};
		expect(auditEnglishLiteratureValidationCandidate(broken).blockingIssues).toEqual(
			expect.arrayContaining([
				'raw_mark_scheme_evidence_missing',
				'checklist_not_grounded_in_raw_mark_row',
				'reviewed_source_grounded_model_answer_missing'
			])
		);
	});

	it('selects ten diverse real-question slots and materializes the full protocol matrix', () => {
		const candidates = ENGLISH_LITERATURE_VALIDATION_TASK_KINDS.flatMap((taskKind) => [
			makeCandidate(taskKind, 0),
			makeCandidate(taskKind, 1),
			makeCandidate(taskKind, 2)
		]);
		const plan = buildEnglishLiteraturePracticeValidationPlan(candidates);

		expect(plan.status).toBe('ready_for_browser_execution');
		expect(plan.requirements.runtimeSourceStatusContract).toContain('status=source_complete');
		expect(plan.selectedQuestions).toHaveLength(10);
		expect(plan.coverage.every((row) => row.selectedCount === 2 && row.shortfall === 0)).toBe(true);
		expect(new Set(plan.selectedQuestions.map((row) => row.sourceDocumentId)).size).toBe(2);
		expect(plan.execution.scenarios.map((row) => row.profile)).toEqual([
			'blank',
			'irrelevant',
			'plausible-but-vague',
			'partially-successful',
			'feedback-driven-retry',
			'secure'
		]);
		expect(plan.execution.replays).toHaveLength(20);
		expect(plan.execution.layouts).toHaveLength(40);
		expect(plan.execution.questionAudits).toHaveLength(10);
		expect(plan.execution.questionAudits.every((row) => row.stageContract.length === 5)).toBe(true);
		expect(plan.selectedQuestions[0].rawMarkSchemeItems[0]).toMatchObject({
			sourceRef: 'MS p.12 row 3'
		});
		expect(
			plan.selectedQuestions
				.filter((row) => row.requiresSourceContext)
				.every((row) => row.sourceAssets.length > 0)
		).toBe(true);
	});

	it('reports the exact task-shape shortfall instead of substituting another shape', () => {
		const candidates = ENGLISH_LITERATURE_VALIDATION_TASK_KINDS.filter(
			(taskKind) => taskKind !== 'extract-comparison'
		).flatMap((taskKind) => [makeCandidate(taskKind, 0), makeCandidate(taskKind, 1)]);
		const plan = buildEnglishLiteraturePracticeValidationPlan(candidates);

		expect(plan.status).toBe('blocked');
		expect(plan.coverage.find((row) => row.taskKind === 'extract-comparison')).toMatchObject({
			candidateCount: 0,
			eligibleCount: 0,
			selectedCount: 0,
			shortfall: 2
		});
		expect(plan.blockers).toContain('extract-comparison has 0 eligible question(s); 2 required.');
	});

	it('keeps a complete selection pending until real routes are probed', () => {
		const candidates = ENGLISH_LITERATURE_VALIDATION_TASK_KINDS.flatMap((taskKind) => [
			makeCandidate(taskKind, 0, { routeProbe: { checked: false, available: false } }),
			makeCandidate(taskKind, 1, { routeProbe: { checked: false, available: false } })
		]);
		expect(buildEnglishLiteraturePracticeValidationPlan(candidates).status).toBe(
			'route_probe_pending'
		);
	});

	it('fails incomplete browser evidence and replay instability deterministically', () => {
		const candidates = ENGLISH_LITERATURE_VALIDATION_TASK_KINDS.flatMap((taskKind) => [
			makeCandidate(taskKind, 0),
			makeCandidate(taskKind, 1)
		]);
		const plan = buildEnglishLiteraturePracticeValidationPlan(candidates);
		const issues = validateCompletedEnglishLiteraturePracticeEvidence(plan);
		expect(issues).toContain('input-blank:exact_input_missing');
		expect(issues).toContain('release_decision_not_passed');
		expect(issues).toContain(`${plan.selectedQuestions[0].questionId}:mobile:light:sourceReadable`);
	});

	it('accepts a fully completed matrix and catches replay drift', () => {
		const candidates = ENGLISH_LITERATURE_VALIDATION_TASK_KINDS.flatMap((taskKind) => [
			makeCandidate(taskKind, 0),
			makeCandidate(taskKind, 1)
		]);
		const completed = JSON.parse(
			JSON.stringify(buildEnglishLiteraturePracticeValidationPlan(candidates))
		);
		for (const audit of completed.execution.questionAudits) {
			for (const stage of audit.stageContract) {
				stage.observedTitle = `Observed ${stage.stageId}`;
				stage.observedGoal = `Goal for ${stage.stageId}`;
				stage.observedSuccessCriteria = [
					{ id: `${stage.stageId}-criterion`, label: 'Criterion', description: 'Description' }
				];
				stage.observedHints = [{ title: 'Hint', text: 'Question-specific hint.' }];
				stage.criterionChecks = [
					{
						criterionId: `${stage.stageId}-criterion`,
						probeInput: 'A bounded criterion probe.',
						observedStatus: 'met',
						feedback: 'The criterion is evidenced by the named phrase.',
						learnerEvidence: 'named phrase',
						independentlyVerified: true
					}
				];
				stage.fitsExactQuestion = true;
			}
			audit.sourceGrounding.verified = true;
			audit.sourceGrounding.examinerGuidanceObserved = false;
			audit.sourceGrounding.runtimeMarkRowsMatch = true;
			audit.sourceGrounding.runtimeSourceAssetsMatch = true;
			audit.sourceGrounding.runtimeExaminerGuidanceMatches = true;
			audit.sourceGrounding.runtimeModelAnswerMatches = true;
			for (const key of Object.keys(audit.navigation)) {
				if (key !== 'notes') audit.navigation[key] = true;
			}
		}
		for (const scenario of completed.execution.scenarios) {
			scenario.exactInput = scenario.profile === 'blank' ? '' : `Exact ${scenario.profile} input.`;
			if (scenario.profile === 'blank') {
				scenario.result = {
					submissionOutcome: 'client-blocked',
					modelCallObserved: false,
					checkControlDisabled: true,
					decision: null,
					checks: [],
					nextImprovement: null,
					coachingNote: null,
					activeStageAfter: scenario.stageId,
					unlockedStageIds: [scenario.stageId],
					feedbackCitesLearnerText: null,
					isolatesOnlyMissingMove: null,
					movedGoalposts: null,
					acknowledgedRepairedWeakness: null
				};
				continue;
			}
			const pass = ['feedback-driven-retry', 'secure'].includes(scenario.profile);
			scenario.result = {
				submissionOutcome: 'graded',
				modelCallObserved: true,
				checkControlDisabled: false,
				decision: pass ? 'pass' : 'revise',
				checks: [
					{
						id: 'task-criterion',
						status: pass ? 'met' : 'not_yet',
						feedback: 'Your phrase shows the exact move under review.',
						learnerEvidence: scenario.profile === 'blank' ? '(blank response)' : 'Exact'
					}
				],
				nextImprovement: pass ? 'Continue to evidence.' : 'Add the missing analytical move.',
				coachingNote: 'The feedback remains limited to the active goal.',
				activeStageAfter: pass ? 'evidence' : 'task',
				unlockedStageIds: pass ? ['task', 'evidence'] : ['task'],
				feedbackCitesLearnerText: true,
				isolatesOnlyMissingMove: true,
				movedGoalposts: false,
				acknowledgedRepairedWeakness: scenario.profile === 'feedback-driven-retry'
			};
		}
		for (const replay of completed.execution.replays) {
			replay.exactInput = `Variant ${replay.variant} wording.`;
			replay.decision = 'revise';
			replay.missingSkill = `Stable ${replay.taskKind} skill`;
			replay.passThreshold = `Stable ${replay.taskKind} threshold`;
			replay.nextAction = `Stable ${replay.taskKind} next action`;
		}
		for (const layout of completed.execution.layouts) {
			layout.sourceReadable = true;
			layout.noClipping = true;
			layout.noOverflow = true;
			layout.stableHeight = true;
			layout.feedbackReadable = true;
			layout.screenshot = `/evidence/${layout.questionId}-${layout.viewport}-${layout.theme}.png`;
		}
		completed.execution.releaseDecision.status = 'passed';

		expect(validateCompletedEnglishLiteraturePracticeEvidence(completed)).toEqual([]);
		completed.execution.replays[1].nextAction = 'A different next action';
		expect(validateCompletedEnglishLiteraturePracticeEvidence(completed)).toContain(
			'replay-poetry-comparison:nextAction_inconsistent'
		);
	});
});
