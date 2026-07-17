import {
	ENGLISH_LITERATURE_BROWSER_INPUT_SCHEMA,
	ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID,
	assertEnglishLiteratureModelExecutionGate,
	buildEnglishLiteratureBrowserInputTemplate,
	buildEnglishLiteratureLayoutMatrix,
	buildSyntheticEnglishPracticeState,
	englishLiteratureModelRunDefinitions,
	extractEnglishLiteraturePracticeContract,
	modelExecutionConfirmation,
	planFingerprint,
	runtimeContractGroundingIssues,
	sanitizeTrackedEvidenceText,
	validateEnglishLiteratureBrowserInputs
} from '../../../scripts/lib/english-literature-browser-validation.mjs';
import { assertResumableModelRun } from '../../../scripts/validate-english-literature-practice-browser.mjs';
import { describe, expect, it } from 'vitest';

const taskKinds = [
	'poetry-comparison',
	'extract-comparison',
	'extract-and-wider',
	'whole-text-judgement',
	'single-text-analysis'
] as const;

const stageIds = ['task', 'evidence', 'method', 'develop', 'full-answer'];

type MutableBrowserInputs = {
	schemaVersion: string;
	reviewer: {
		name: string | null;
		reviewedAt: string | null;
		attestsQuestionSpecificInputs: boolean;
		attestsNoInventedQuotations: boolean;
		attestsNoInventedExaminerGuidance: boolean;
	};
	scenarios: Array<{
		profile: string;
		exactInput: string;
		sourceSafety: ReturnType<typeof reviewedSafety>;
	}>;
	replays: Array<{
		taskKind: string;
		variant: number;
		exactInput: string;
		sourceSafety: ReturnType<typeof reviewedSafety>;
	}>;
	questions: Array<{
		sourceGroundingReview: { verified: boolean | null; notes: string };
		stageReviews: Array<{
			stageId: string;
			fitsExactQuestion: boolean | null;
			fitNotes: string;
			prerequisiteAnswers: Array<{
				stageId: string;
				exactInput: string;
				sourceSafety: ReturnType<typeof reviewedSafety>;
			}>;
			criterionProbes: Array<{
				criterionId: string;
				exactInput: string;
				sourceSafety: ReturnType<typeof reviewedSafety>;
			}>;
		}>;
	}>;
};

type ModelRunDefinition = {
	kind: string;
	id: string;
	questionId: string;
	stageId: string;
	criterionId?: string | null;
	exactInput: string;
};

function fixtureEvidence() {
	const selectedQuestions = taskKinds.flatMap((taskKind) =>
		[0, 1].map((index) => ({
			questionId: `${taskKind}-${index}`,
			taskKind,
			sourceDocumentId: `paper-${index}`,
			sourceQuestionRef: `${index + 1}`,
			requiresSourceContext: taskKind.includes('extract') || taskKind.includes('poetry'),
			rawMarkSchemeItemIds: [`${taskKind}-${index}-mark`],
			examinerGuidanceEvidence: []
		}))
	);
	const representative = (taskKind: string) =>
		selectedQuestions.find((question) => question.taskKind === taskKind)!.questionId;
	return {
		schemaVersion: 'english-literature-practice-validation-preflight-v2',
		plan: {
			schemaVersion: 'english-literature-practice-validation-plan-v2',
			status: 'ready_for_browser_execution',
			requirements: {
				learnerProfile: 'Capable GCSE Grade 5-6 learner aiming for Grades 8-9'
			},
			selectedQuestions,
			execution: {
				scenarios: [
					['input-blank', 'blank', 'poetry-comparison'],
					['input-irrelevant', 'irrelevant', 'extract-comparison'],
					['input-vague', 'plausible-but-vague', 'extract-and-wider'],
					['input-partial', 'partially-successful', 'whole-text-judgement'],
					['input-retry', 'feedback-driven-retry', 'whole-text-judgement'],
					['input-secure', 'secure', 'single-text-analysis']
				].map(([id, profile, taskKind]) => ({
					id,
					profile,
					taskKind,
					questionId: representative(taskKind),
					stageId: 'task',
					...(id === 'input-retry' ? { priorScenarioId: 'input-partial' } : {})
				})),
				replays: taskKinds.flatMap((taskKind) =>
					Array.from({ length: 4 }, (_, index) => ({
						groupId: `replay-${taskKind}`,
						variant: index + 1,
						taskKind,
						questionId: representative(taskKind),
						stageId: 'task'
					}))
				),
				questionAudits: selectedQuestions.map((question) => ({
					questionId: question.questionId,
					taskKind: question.taskKind,
					stageContract: stageIds.map((stageId) => ({ stageId }))
				})),
				layouts: []
			}
		}
	};
}

function fixtureContracts(evidence = fixtureEvidence()) {
	return evidence.plan.selectedQuestions.map((question) => ({
		questionId: question.questionId,
		taskKind: question.taskKind,
		question: {
			id: question.questionId,
			sourceRef: 'Q1',
			title: 'Question title',
			prompt: `Prompt for ${question.questionId}`,
			context: 'Exact question context.',
			assets: []
		},
		stages: stageIds.map((stageId) => ({
			id: stageId,
			title: `Title ${stageId}`,
			shortTitle: stageId,
			revealedText: `Revealed ${stageId}`,
			prompt: `Prompt ${stageId}`,
			goal: `Goal ${stageId}`,
			successCriteria: [
				{
					id: `${stageId}-criterion`,
					label: `Criterion ${stageId}`,
					description: `Description ${stageId}`
				}
			],
			hints: [{ title: `Hint ${stageId}`, text: `Hint text ${stageId}` }]
		})),
		markSchemeItems: [],
		examinerGuidance: [],
		_runtimeUserId: ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID
	}));
}

function reviewedSafety() {
	return {
		humanReviewed: true,
		containsQuotation: false,
		quotationVerifiedExact: null,
		quotationSourceRef: null,
		usesExaminerClaim: false,
		examinerSourceDocumentId: null,
		examinerSourceRef: null
	};
}

function completeInputs(evidence = fixtureEvidence()) {
	const inputs = buildEnglishLiteratureBrowserInputTemplate({
		evidence,
		contracts: fixtureContracts(evidence),
		generatedAt: '2026-07-16T00:00:00.000Z'
	}) as unknown as MutableBrowserInputs;
	inputs.reviewer = {
		name: 'Validation reviewer',
		reviewedAt: '2026-07-16T01:00:00.000Z',
		attestsQuestionSpecificInputs: true,
		attestsNoInventedQuotations: true,
		attestsNoInventedExaminerGuidance: true
	};
	for (const scenario of inputs.scenarios) {
		scenario.exactInput = scenario.profile === 'blank' ? '' : `Exact ${scenario.profile} response.`;
		scenario.sourceSafety = reviewedSafety();
	}
	for (const replay of inputs.replays) {
		replay.exactInput = `Exact replay ${replay.taskKind} ${replay.variant}.`;
		replay.sourceSafety = reviewedSafety();
	}
	for (const question of inputs.questions) {
		question.sourceGroundingReview = { verified: true, notes: 'Checked against selected rows.' };
		for (const stage of question.stageReviews) {
			stage.fitsExactQuestion = true;
			stage.fitNotes = 'Question-specific fit checked.';
			for (const prerequisite of stage.prerequisiteAnswers) {
				prerequisite.exactInput = `Exact prerequisite ${prerequisite.stageId}.`;
				prerequisite.sourceSafety = reviewedSafety();
			}
			for (const probe of stage.criterionProbes) {
				probe.exactInput = `Exact isolated probe for ${probe.criterionId}.`;
				probe.sourceSafety = reviewedSafety();
			}
		}
	}
	return inputs;
}

function flatten(value: unknown) {
	const values: unknown[] = [];
	const add = (item: unknown): number => {
		if (item === undefined) return -1;
		const index = values.length;
		values.push(null);
		if (Array.isArray(item)) {
			values[index] = item.map(add);
		} else if (item && typeof item === 'object') {
			values[index] = Object.fromEntries(
				Object.entries(item as Record<string, unknown>).map(([key, nested]) => [key, add(nested)])
			);
		} else {
			values[index] = item;
		}
		return index;
	};
	add(value);
	return values;
}

describe('English Literature real-Chrome validation evidence', () => {
	it('materializes exactly 40 mobile/desktop light/dark layouts', () => {
		const matrix = buildEnglishLiteratureLayoutMatrix(fixtureEvidence()) as Array<{
			viewport: string;
			theme: string;
		}>;
		expect(matrix).toHaveLength(40);
		expect(new Set(matrix.map((row) => `${row.viewport}:${row.theme}`))).toEqual(
			new Set(['mobile:light', 'mobile:dark', 'desktop:light', 'desktop:dark'])
		);
	});

	it('decodes only the exact SvelteKit page-data practice contract and omits identity', () => {
		const contract = fixtureContracts()[0];
		const payload = {
			type: 'data',
			nodes: [
				{
					type: 'data',
					data: flatten({
						user: { uid: ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID },
						englishPractice: contract
					})
				}
			]
		};
		const extracted = extractEnglishLiteraturePracticeContract(payload, contract.questionId);
		expect(extracted.stages).toHaveLength(5);
		expect(extracted.stages[0].successCriteria[0].id).toBe('task-criterion');
		expect(extracted._runtimeUserId).toBe(ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID);
		expect(JSON.stringify(extracted)).not.toContain('email');
	});

	it('requires reviewed exact inputs and builds the complete, explicit model-call count', () => {
		const evidence = fixtureEvidence();
		const contracts = fixtureContracts(evidence);
		const incomplete = buildEnglishLiteratureBrowserInputTemplate({
			evidence,
			contracts
		});
		expect(incomplete.schemaVersion).toBe(ENGLISH_LITERATURE_BROWSER_INPUT_SCHEMA);
		expect(
			validateEnglishLiteratureBrowserInputs({
				evidence,
				inputs: incomplete,
				contracts,
				requireComplete: true
			})
		).toContain('reviewer:attestsNoInventedQuotations');

		const inputs = completeInputs(evidence);
		expect(
			validateEnglishLiteratureBrowserInputs({
				evidence,
				inputs,
				contracts,
				requireComplete: true
			})
		).toEqual([]);
		expect(englishLiteratureModelRunDefinitions(inputs)).toHaveLength(75);
		expect(modelExecutionConfirmation(inputs)).toBe('execute-75-english-literature-model-calls');
	});

	it('gates model execution on local dev, fixed cleanup uid, dynamic count and final plan hash', () => {
		const evidence = fixtureEvidence();
		const inputs = completeInputs(evidence);
		const contracts = fixtureContracts(evidence);
		const confirmation = modelExecutionConfirmation(inputs);
		const confirmedPlanSha256 = planFingerprint(evidence);
		expect(() =>
			assertEnglishLiteratureModelExecutionGate({
				evidence,
				inputs,
				baseUrl: 'https://example.test',
				confirmation,
				confirmedPlanSha256,
				contracts,
				environment: { DEV_AUTH_USER_ID: ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID }
			})
		).toThrow('local HTTP');
		expect(() =>
			assertEnglishLiteratureModelExecutionGate({
				evidence,
				inputs,
				baseUrl: 'http://127.0.0.1:5173',
				confirmation,
				confirmedPlanSha256,
				contracts,
				environment: { DEV_AUTH_USER_ID: 'someone-else' }
			})
		).toThrow('disposable uid');

		expect(
			assertEnglishLiteratureModelExecutionGate({
				evidence,
				inputs,
				baseUrl: 'http://127.0.0.1:5173',
				confirmation,
				confirmedPlanSha256,
				contracts,
				environment: { DEV_AUTH_USER_ID: ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID }
			})
		).toMatchObject({ expectedModelCalls: 75 });
	});

	it('rejects runtime-contract drift before any learner-model execution', () => {
		const evidence = fixtureEvidence();
		const inputs = completeInputs(evidence);
		const contracts = fixtureContracts(evidence);
		const changedContract = structuredClone(contracts);
		changedContract[0].stages[0].goal = 'Changed after the reviewed input snapshot.';
		expect(
			validateEnglishLiteratureBrowserInputs({
				evidence,
				inputs,
				contracts: changedContract,
				requireComplete: true
			})
		).toContain('input_runtime_contract_fingerprint_mismatch');

		const changedMarks = structuredClone(contracts) as unknown as Array<{
			questionId: string;
			markSchemeItems: Array<{
				id: string;
				itemType: string;
				text: string;
				marks: number;
				sourceRef: string;
			}>;
		}>;
		changedMarks[0].markSchemeItems.push({
			id: 'unexpected-mark-row',
			itemType: 'marking_point',
			text: 'Unexpected changed row.',
			marks: 1,
			sourceRef: 'MS p.99'
		});
		expect(runtimeContractGroundingIssues(evidence, changedMarks)).toContain(
			`${changedMarks[0].questionId}:runtime_mark_rows_mismatch`
		);
	});

	it('labels synthetic navigation state and never presents it as model evidence', () => {
		const contract = fixtureContracts()[0];
		const state = buildSyntheticEnglishPracticeState(contract, {
			activeStageId: 'method'
		}) as unknown as {
			stepResults: Record<string, { model: string; decision: string }>;
		};
		expect(state.stepResults.task.model).toBe('synthetic-ui-fixture');
		expect(state.stepResults.evidence.decision).toBe('pass');
		expect(state.stepResults.method.decision).toBe('revise');
		expect(JSON.stringify(state)).toContain('not learner evidence');
	});

	it('preserves exact safe text, hashes it and reports any secret redaction', () => {
		const exact = sanitizeTrackedEvidenceText('  This exact learner wording stays.  ');
		expect(exact.text).toBe('  This exact learner wording stays.  ');
		expect(exact.redactionCount).toBe(0);
		expect(exact.sha256).toMatch(/^[a-f0-9]{64}$/);

		const unsafe = sanitizeTrackedEvidenceText('Bearer abc.def.ghi');
		expect(unsafe.text).toBe('<redacted>');
		expect(unsafe.redactionCount).toBe(1);
	});

	it('resumes only an exact, single-call learner-model checkpoint', () => {
		const definition = englishLiteratureModelRunDefinitions(
			completeInputs()
		)[0] as ModelRunDefinition;
		const exact = sanitizeTrackedEvidenceText(definition.exactInput, 5000);
		const checkpoint = {
			kind: definition.kind,
			id: definition.id,
			questionId: definition.questionId,
			stageId: definition.stageId,
			criterionId: definition.criterionId ?? null,
			status: 'passed',
			evidenceKind: 'learner-model',
			exactInput: exact.text,
			exactInputSha256: exact.sha256,
			gradeRequestsObserved: [{ path: '/grade-step' }],
			result: {
				decision: 'revise',
				checkedAnswer: exact.text,
				checks: [{ id: 'task-criterion', status: 'not_yet' }]
			}
		};
		expect(() => assertResumableModelRun(checkpoint, definition)).not.toThrow();
		expect(() =>
			assertResumableModelRun({ ...checkpoint, exactInput: `${exact.text} changed` }, definition)
		).toThrow('Refusing to repeat or trust invalid model checkpoint');
	});
});
