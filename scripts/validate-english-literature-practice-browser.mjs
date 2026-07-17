#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- This operator CLI validates dynamic SvelteKit page data and raw CDP events.

import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadEnv } from 'vite';
import {
	CdpClient,
	captureScreenshot,
	collectLayoutEvidence,
	delay,
	evaluate,
	forceTheme,
	launchChrome,
	safeUrl,
	sanitizeText,
	settlePageAssets,
	waitForDocumentReady,
	waitForNetworkIdle,
	waitUntil
} from './lib/real-chrome-cdp.mjs';
import {
	ENGLISH_LITERATURE_BROWSER_REPORT_SCHEMA,
	ENGLISH_LITERATURE_BROWSER_VIEWPORTS,
	ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID,
	assertEnglishLiteratureModelExecutionGate,
	assertReadyEnglishLiteraturePlan,
	buildEnglishLiteratureBrowserInputTemplate,
	buildEnglishLiteratureLayoutMatrix,
	buildSyntheticEnglishPracticeState,
	englishLiteratureModelRunDefinitions,
	fetchEnglishLiteraturePracticeContract,
	modelExecutionConfirmation,
	planFingerprint,
	runtimeContractGroundingIssues,
	runtimeContractsFingerprint,
	sanitizeTrackedEvidenceText,
	selectionFingerprint,
	sha256,
	validateEnglishLiteratureBrowserInputs,
	validationPlanFromEvidence
} from './lib/english-literature-browser-validation.mjs';

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const CLEANUP_CONFIRMATION = `delete-${ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID}`;
const READ_ONLY_INTERCEPT_PATHS = ['/api/analytics/events', '/api/question-drafts'];

const usage = `Usage:
node scripts/validate-english-literature-practice-browser.mjs <mode> [options]

Modes (choose exactly one):
  --prepare-input-template   Read the exact SvelteKit runtime contracts and create the
                             human-review/input template. No Chrome and no model calls.
  --read-only-browser        Run all 10 questions in real Chrome, including 40 layout
                             states and synthetic-only navigation fixtures. No model calls.
  --execute-model-validation Run the reviewed scenario, replay and independent-criterion
                             matrix. This is deliberately gated and always cleans the fixed
                             disposable dev-auth uid before and after execution.

Options:
  --plan=<preflight.json>    Required. Output from prepare-english-literature-practice-validation.
  --inputs=<inputs.json>     Required for model execution; optional for read-only review merge.
  --base-url=http://127.0.0.1:5173
  --output=<directory>       Default: docs/release-evidence/english-literature-practice-browser
  --chrome-bin=/usr/bin/google-chrome
  --timeout-ms=180000
  --settle-ms=750
  --no-screenshots
  --fail-on-issues
  --resume                   Model mode only. Resume the matching atomic report and skip every
                             already verified exact-input model run.
  --confirm=<dynamic-token>  Model mode only. The token includes the exact planned call count.
  --confirm-plan-sha256=<sha256> Model mode only. Must match the final imported plan.
  --help

The template and read-only modes never submit learner work. Synthetic results are labelled
synthetic-ui-fixture and count only as navigation/layout evidence. Model mode refuses non-local
origins, stale plans, unreviewed inputs, unverified quotations/examiner claims, or any dev-auth uid
other than ${ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID}.`;

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(usage);
		return;
	}
	const evidence = JSON.parse(await readFile(path.resolve(rootDir, options.plan), 'utf8'));
	const plan = assertReadyEnglishLiteraturePlan(evidence);
	await assertLocalDevServer(options.baseUrl);
	const contracts = await fetchRuntimeContracts(evidence, options);

	if (options.mode === 'prepare-input-template') {
		const template = buildEnglishLiteratureBrowserInputTemplate({ evidence, contracts });
		const definitions = englishLiteratureModelRunDefinitions(template);
		const output = path.join(options.output, 'reviewed-inputs.json');
		await writeJsonAtomic(output, template);
		console.log(
			JSON.stringify(
				{
					status: 'template-prepared',
					selectedQuestionCount: plan.selectedQuestions.length,
					replayCount: template.replays.length,
					criterionProbeCount: template.questions.reduce(
						(sum, question) =>
							sum +
							question.stageReviews.reduce(
								(stageSum, stage) => stageSum + stage.criterionProbes.length,
								0
							),
						0
					),
					plannedModelCalls: definitions.length,
					requiredConfirmation: modelExecutionConfirmation(template),
					planFingerprintSha256: planFingerprint(evidence),
					runtimeContractsFingerprintSha256: runtimeContractsFingerprint(contracts),
					output: path.relative(rootDir, output),
					modelCalls: 0
				},
				null,
				2
			)
		);
		return;
	}

	const inputs = options.inputs
		? JSON.parse(await readFile(path.resolve(rootDir, options.inputs), 'utf8'))
		: null;
	if (inputs) {
		const inputIssues = validateEnglishLiteratureBrowserInputs({
			evidence,
			inputs,
			contracts,
			requireComplete: options.mode === 'execute-model-validation'
		});
		if (inputIssues.length > 0) {
			throw new Error(`Input evidence failed validation:\n- ${inputIssues.join('\n- ')}`);
		}
	}

	let executionGate = null;
	let cleanupBefore = null;
	const env = loadEnv('development', rootDir, '');
	if (options.mode === 'execute-model-validation') {
		if (!inputs) throw new Error('--execute-model-validation requires --inputs.');
		executionGate = assertEnglishLiteratureModelExecutionGate({
			evidence,
			inputs,
			baseUrl: options.baseUrl,
			confirmation: options.confirm,
			confirmedPlanSha256: options.confirmPlanSha256,
			contracts,
			environment: env
		});
		cleanupBefore = await cleanupDisposableDevUser();
	}

	const reportPath = path.join(options.output, 'report.json');
	const freshReport = initialReport({
		evidence,
		inputs,
		contracts,
		options,
		executionGate,
		cleanupBefore
	});
	const report = options.resume
		? await resumeReport({
				reportPath,
				freshReport,
				evidence,
				inputs,
				contracts,
				options
			})
		: freshReport;
	await mkdir(path.join(options.output, 'screenshots'), { recursive: true });
	await writeJsonAtomic(reportPath, report);

	let chrome = null;
	let fatalError = null;
	try {
		chrome = await launchChrome(options);
		report.chrome = { binary: chrome.binary, version: chrome.version, headless: true };
		await runReadOnlyEvidence({ chrome, report, evidence, contracts, inputs, options, reportPath });
		if (options.mode === 'execute-model-validation') {
			await runModelEvidence({ chrome, report, inputs, contracts, options, reportPath });
		}
	} catch (error) {
		fatalError = error instanceof Error ? error.stack || error.message : String(error);
		report.fatalError = sanitizeText(fatalError);
	} finally {
		if (chrome) await chrome.close();
		if (options.mode === 'execute-model-validation') {
			try {
				report.cleanup.after = await cleanupDisposableDevUser();
			} catch (error) {
				const cleanupError = error instanceof Error ? error.stack || error.message : String(error);
				report.cleanup.after = { status: 'failed', error: sanitizeText(cleanupError) };
				report.fatalError = report.fatalError
					? `${report.fatalError}\nCleanup failed: ${sanitizeText(cleanupError)}`
					: `Cleanup failed: ${sanitizeText(cleanupError)}`;
			}
		}
	}

	finalizeReport(report);
	await writeJsonAtomic(reportPath, report);
	await writeFile(path.join(options.output, 'summary.md'), markdownSummary(report));
	console.log(
		JSON.stringify(
			{
				status: report.status,
				mode: report.mode,
				layoutCases: report.summary.layoutCaseCount,
				questionAudits: report.summary.questionAuditCount,
				modelRuns: report.summary.modelRunCount,
				modelCallsObserved: report.summary.modelCallsObserved,
				issues: report.summary.issueCount,
				cleanup: report.cleanup,
				output: path.relative(rootDir, reportPath)
			},
			null,
			2
		)
	);
	if (fatalError || (options.failOnIssues && report.status !== 'passed')) process.exitCode = 1;
}

function initialReport({ evidence, inputs, contracts, options, executionGate, cleanupBefore }) {
	const plan = structuredClone(validationPlanFromEvidence(evidence));
	mergeRuntimeContracts(plan, contracts);
	mergeHumanReviews(plan, inputs);
	return {
		schemaVersion: ENGLISH_LITERATURE_BROWSER_REPORT_SCHEMA,
		status: 'running',
		mode: options.mode,
		startedAt: new Date().toISOString(),
		finishedAt: null,
		baseUrl: safeUrl(options.baseUrl),
		planFingerprintSha256: planFingerprint(evidence),
		selectionFingerprintSha256: selectionFingerprint(evidence),
		inputFingerprintSha256: inputs ? sha256(inputs) : null,
		chrome: null,
		configuration: {
			selectedQuestionCount: plan.selectedQuestions.length,
			viewports: ENGLISH_LITERATURE_BROWSER_VIEWPORTS,
			themes: ['light', 'dark'],
			screenshots: options.screenshots,
			readOnlyWriteInterception: READ_ONLY_INTERCEPT_PATHS,
			runtimeContractsFingerprintSha256: runtimeContractsFingerprint(contracts),
			executionGate
		},
		provenance: {
			learnerModelEvidence:
				'Only modelRuns entries with evidenceKind=learner-model are grading evidence.',
			syntheticUiEvidence:
				'Synthetic fixtures exercise locks, review, invalidation, reset and rendering only; they are never learner or source evidence.',
			runtimeContract:
				'Stage contracts are decoded from each exact SvelteKit __data.json response and compared with the rendered Chrome DOM.'
		},
		cleanup: {
			required: options.mode === 'execute-model-validation',
			userId:
				options.mode === 'execute-model-validation'
					? ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID
					: null,
			before: cleanupBefore,
			after: null
		},
		plan,
		questionAudits: [],
		layouts: [],
		modelRuns: [],
		interceptedWrites: [],
		issues: [],
		fatalError: null,
		summary: {}
	};
}

async function resumeReport({ reportPath, freshReport, evidence, inputs, contracts, options }) {
	let previous;
	try {
		previous = JSON.parse(await readFile(reportPath, 'utf8'));
	} catch (error) {
		if (error?.code === 'ENOENT') {
			throw new Error(
				`--resume requires an existing report at ${path.relative(rootDir, reportPath)}.`,
				{ cause: error }
			);
		}
		throw error;
	}
	const expectedPlan = planFingerprint(evidence);
	const expectedInputs = sha256(inputs);
	if (previous.schemaVersion !== ENGLISH_LITERATURE_BROWSER_REPORT_SCHEMA) {
		throw new Error('The resume report has an incompatible schema.');
	}
	if (previous.mode !== options.mode || previous.mode !== 'execute-model-validation') {
		throw new Error('Only a matching execute-model-validation report can be resumed.');
	}
	if (previous.planFingerprintSha256 !== expectedPlan) {
		throw new Error('The resume report belongs to a different final validation plan.');
	}
	if (previous.inputFingerprintSha256 !== expectedInputs) {
		throw new Error('The resume report belongs to different reviewed exact inputs.');
	}
	if (new URL(previous.baseUrl).origin !== new URL(options.baseUrl).origin) {
		throw new Error('The resume report belongs to a different local development origin.');
	}
	const definitions = englishLiteratureModelRunDefinitions(inputs);
	const byKey = new Map(definitions.map((definition) => [modelRunKey(definition), definition]));
	const seen = new Set();
	for (const run of previous.modelRuns ?? []) {
		const key = modelRunKey(run);
		if (seen.has(key)) throw new Error(`Duplicate model checkpoint in resume report: ${key}.`);
		seen.add(key);
		const definition = byKey.get(key);
		if (!definition) throw new Error(`Unexpected model checkpoint in resume report: ${key}.`);
		assertResumableModelRun(run, definition);
	}

	const previousStatus = previous.status;
	previous.status = 'running';
	previous.finishedAt = null;
	previous.fatalError = null;
	previous.issues = [];
	previous.chrome = null;
	previous.configuration = freshReport.configuration;
	previous.cleanup = freshReport.cleanup;
	previous.resumptions = [
		...(previous.resumptions ?? []),
		{
			resumedAt: new Date().toISOString(),
			previousStatus,
			verifiedModelCheckpoints: seen.size
		}
	];
	mergeRuntimeContracts(previous.plan, contracts);
	mergeHumanReviews(previous.plan, inputs);
	return previous;
}

function modelRunKey(value) {
	return `${value.kind}:${value.id}`;
}

function assertResumableModelRun(run, definition) {
	const sanitized = sanitizeTrackedEvidenceText(definition.exactInput, 5000);
	const issues = [];
	if (sanitized.redactionCount || sanitized.truncated)
		issues.push('definition_input_not_exactly_trackable');
	if (run.status !== 'passed') issues.push('status');
	if (run.evidenceKind !== 'learner-model') issues.push('evidence_kind');
	if (run.questionId !== definition.questionId) issues.push('question_id');
	if (run.stageId !== definition.stageId) issues.push('stage_id');
	if ((run.criterionId ?? null) !== (definition.criterionId ?? null)) issues.push('criterion_id');
	if (run.exactInput !== sanitized.text || run.exactInputSha256 !== sanitized.sha256) {
		issues.push('exact_input');
	}
	if (run.result?.checkedAnswer !== sanitized.text) issues.push('checked_answer');
	if (!Array.isArray(run.result?.checks) || run.result.checks.length === 0) issues.push('checks');
	if (!['pass', 'revise'].includes(run.result?.decision)) issues.push('decision');
	if (!Array.isArray(run.gradeRequestsObserved) || run.gradeRequestsObserved.length !== 1) {
		issues.push('grade_request_count');
	}
	if (
		definition.criterionId &&
		!run.result?.checks?.some((check) => check.id === definition.criterionId)
	) {
		issues.push('criterion_result');
	}
	if (issues.length > 0) {
		throw new Error(
			`Refusing to repeat or trust invalid model checkpoint ${modelRunKey(run)}: ${issues.join(', ')}.`
		);
	}
}

async function fetchRuntimeContracts(evidence, options) {
	const plan = assertReadyEnglishLiteraturePlan(evidence);
	const contracts = [];
	for (const selected of plan.selectedQuestions) {
		const contract = await fetchEnglishLiteraturePracticeContract({
			baseUrl: options.baseUrl,
			questionId: selected.questionId,
			timeoutMs: options.timeoutMs
		});
		if (contract.taskKind !== selected.taskKind) {
			throw new Error(
				`${selected.questionId} runtime task kind ${contract.taskKind} does not match ${selected.taskKind}.`
			);
		}
		contracts.push(contract);
	}
	const groundingIssues = runtimeContractGroundingIssues(evidence, contracts);
	if (groundingIssues.length > 0) {
		throw new Error(`Runtime contract grounding failed:\n- ${groundingIssues.join('\n- ')}`);
	}
	return contracts;
}

function mergeRuntimeContracts(plan, contracts) {
	const byQuestion = new Map(contracts.map((contract) => [contract.questionId, contract]));
	const groundingIssues = runtimeContractGroundingIssues(plan, contracts);
	for (const audit of plan.execution.questionAudits) {
		const contract = byQuestion.get(audit.questionId);
		if (!contract) continue;
		for (const stageAudit of audit.stageContract) {
			const stage = contract.stages.find((item) => item.id === stageAudit.stageId);
			if (!stage) continue;
			stageAudit.observedTitle = stage.title;
			stageAudit.observedGoal = stage.goal;
			stageAudit.observedSuccessCriteria = structuredClone(stage.successCriteria);
			stageAudit.observedHints = structuredClone(stage.hints);
			stageAudit.runtimeContractSource = 'sveltekit-data-endpoint';
		}
		audit.sourceGrounding.runtimeMarkRowsMatch = !groundingIssues.includes(
			`${audit.questionId}:runtime_mark_rows_mismatch`
		);
		audit.sourceGrounding.runtimeSourceAssetsMatch = !groundingIssues.some((issue) =>
			issue.startsWith(`${audit.questionId}:runtime_source_asset_missing:`)
		);
		audit.sourceGrounding.runtimeExaminerGuidanceMatches = !groundingIssues.includes(
			`${audit.questionId}:runtime_examiner_guidance_mismatch`
		);
		audit.sourceGrounding.runtimeModelAnswerMatches = !groundingIssues.includes(
			`${audit.questionId}:runtime_model_answer_mismatch`
		);
		audit.sourceGrounding.examinerGuidanceObserved = contract.examinerGuidance.length > 0;
	}
}

function mergeHumanReviews(plan, inputs) {
	if (!inputs) return;
	const byQuestion = new Map(inputs.questions.map((question) => [question.questionId, question]));
	for (const audit of plan.execution.questionAudits) {
		const review = byQuestion.get(audit.questionId);
		if (!review) continue;
		audit.sourceGrounding.verified = review.sourceGroundingReview?.verified ?? null;
		for (const stage of audit.stageContract) {
			const stageReview = review.stageReviews.find((item) => item.stageId === stage.stageId);
			if (!stageReview) continue;
			stage.fitsExactQuestion = stageReview.fitsExactQuestion;
			stage.notes = stageReview.fitNotes;
		}
	}
}

async function runReadOnlyEvidence({
	chrome,
	report,
	evidence,
	contracts,
	inputs,
	options,
	reportPath
}) {
	for (const contract of contracts) {
		const existingIndex = report.questionAudits.findIndex(
			(audit) => audit.questionId === contract.questionId
		);
		if (
			existingIndex >= 0 &&
			completeQuestionAudit(report.questionAudits[existingIndex], contract)
		) {
			console.log(`SKIPPED audited question ${contract.questionId} (verified checkpoint)`);
			continue;
		}
		if (existingIndex >= 0) report.questionAudits.splice(existingIndex, 1);
		const selected = validationPlanFromEvidence(evidence).selectedQuestions.find(
			(question) => question.questionId === contract.questionId
		);
		const audit = await auditQuestionInChrome({ chrome, contract, selected, options, report });
		report.questionAudits.push(audit);
		mergeQuestionAudit(report.plan, audit);
		await writeJsonAtomic(reportPath, report);
	}

	for (const layoutCase of buildEnglishLiteratureLayoutMatrix(evidence)) {
		const contract = contracts.find((item) => item.questionId === layoutCase.questionId);
		const existingIndex = report.layouts.findIndex(
			(layout) =>
				layout.questionId === layoutCase.questionId &&
				layout.viewport === layoutCase.viewport &&
				layout.theme === layoutCase.theme
		);
		if (existingIndex >= 0 && report.layouts[existingIndex].status === 'passed') {
			console.log(
				`SKIPPED layout ${layoutCase.questionId} ${layoutCase.viewport}/${layoutCase.theme} (verified checkpoint)`
			);
			continue;
		}
		if (existingIndex >= 0) report.layouts.splice(existingIndex, 1);
		const layout = await runLayoutCase({ chrome, contract, layoutCase, options, report });
		report.layouts.push(layout);
		mergeLayoutEvidence(report.plan, layout);
		await writeJsonAtomic(reportPath, report);
		console.log(
			`${layout.status.toUpperCase()} layout ${layoutCase.questionId} ${layoutCase.viewport}/${layoutCase.theme}`
		);
	}

	const blank = report.plan.execution.scenarios.find((scenario) => scenario.profile === 'blank');
	if (blank) {
		blank.exactInput = '';
		blank.result.submissionOutcome = 'client-blocked';
		blank.result.modelCallObserved = false;
		blank.result.checkControlDisabled = report.questionAudits.some(
			(audit) => audit.questionId === blank.questionId && audit.blankInput.checkControlDisabled
		);
		blank.result.activeStageAfter = blank.stageId;
		blank.result.unlockedStageIds = [blank.stageId];
	}

	if (inputs) mergeExactInputs(report.plan, inputs);
}

function completeQuestionAudit(audit, contract) {
	return (
		audit?.issues?.length === 0 &&
		audit.directRoute?.redirectsToTask === true &&
		audit.blankInput?.checkControlDisabled === true &&
		audit.blankInput?.modelRequestsObserved === 0 &&
		contract.stages.every((stage) =>
			audit.stages?.some(
				(observation) =>
					observation.activeStageId === stage.id && observation.matchesRuntimeContract === true
			)
		) &&
		Object.entries(audit.navigation ?? {}).every(
			([key, value]) => key === 'notes' || value === true
		)
	);
}

async function auditQuestionInChrome({ chrome, contract, selected, options, report }) {
	const questionAudit = {
		questionId: contract.questionId,
		taskKind: contract.taskKind,
		evidenceKind: 'synthetic-ui-fixture',
		directRoute: null,
		blankInput: null,
		stages: [],
		navigation: null,
		issues: []
	};

	const emptyState = buildEmptyPracticeState(contract);
	const direct = await openPracticePage({
		chrome,
		contract,
		pathname: `/questions/${encodeURIComponent(contract.questionId)}/practice`,
		viewport: ENGLISH_LITERATURE_BROWSER_VIEWPORTS.desktop,
		theme: 'light',
		state: emptyState,
		options,
		interceptWrites: true,
		report
	});
	try {
		const directDom = await collectPracticeDom(direct.cdp, contract.stages);
		questionAudit.directRoute = {
			requestedPath: `/questions/${contract.questionId}/practice`,
			finalPath: new URL(directDom.url).pathname,
			redirectsToTask:
				new URL(directDom.url).pathname ===
				`/questions/${contract.questionId}/practice/step-by-step/task`
		};
		questionAudit.blankInput = {
			checkControlDisabled: directDom.primaryDisabled === true,
			activeStageId: directDom.activeStageId,
			unlockedStageIds: directDom.unlockedStageIds,
			modelRequestsObserved: direct.gradeRequests.length
		};
	} finally {
		await direct.close();
	}

	for (const stage of contract.stages) {
		const state = buildSyntheticEnglishPracticeState(contract, { activeStageId: stage.id });
		const page = await openPracticePage({
			chrome,
			contract,
			pathname: `/questions/${encodeURIComponent(contract.questionId)}/practice/step-by-step/${encodeURIComponent(stage.id)}`,
			viewport: ENGLISH_LITERATURE_BROWSER_VIEWPORTS.desktop,
			theme: 'light',
			state,
			options,
			interceptWrites: true,
			report
		});
		try {
			const observation = await observeStage(page.cdp, stage.hints.length, contract.stages);
			observation.expected = {
				title: stage.title,
				goal: stage.goal,
				criterionLabels: stage.successCriteria.map((criterion) => criterion.label),
				hints: stage.hints
			};
			observation.matchesRuntimeContract =
				observation.activeStageId === stage.id &&
				observation.title === stage.title &&
				observation.goal === stage.goal &&
				JSON.stringify(observation.criterionLabels) ===
					JSON.stringify(stage.successCriteria.map((criterion) => criterion.label)) &&
				JSON.stringify(observation.hints) === JSON.stringify(stage.hints);
			questionAudit.stages.push(observation);
		} finally {
			await page.close();
		}
	}

	questionAudit.navigation = await auditNavigation({ chrome, contract, options, report });
	if (!questionAudit.directRoute.redirectsToTask) questionAudit.issues.push('direct_route_failed');
	if (
		!questionAudit.blankInput.checkControlDisabled ||
		questionAudit.blankInput.modelRequestsObserved
	) {
		questionAudit.issues.push('blank_input_gate_failed');
	}
	if (questionAudit.stages.some((stage) => !stage.matchesRuntimeContract)) {
		questionAudit.issues.push('stage_contract_render_mismatch');
	}
	for (const [key, value] of Object.entries(questionAudit.navigation)) {
		if (key !== 'notes' && value !== true) questionAudit.issues.push(`navigation:${key}`);
	}
	if (selected.requiresSourceContext && contract.question.assets.length === 0) {
		questionAudit.issues.push('required_source_assets_missing_from_runtime_contract');
	}
	return questionAudit;
}

async function auditNavigation({ chrome, contract, options, report }) {
	const thirdStage = contract.stages[2];
	const state = buildSyntheticEnglishPracticeState(contract, {
		activeStageId: thirdStage.id,
		includeFeedback: true
	});
	const page = await openPracticePage({
		chrome,
		contract,
		pathname: `/questions/${encodeURIComponent(contract.questionId)}/practice/step-by-step/${encodeURIComponent(thirdStage.id)}`,
		viewport: ENGLISH_LITERATURE_BROWSER_VIEWPORTS.desktop,
		theme: 'light',
		state,
		options,
		interceptWrites: true,
		report
	});
	try {
		const before = await collectPracticeDom(page.cdp, contract.stages);
		const review = await evaluate(page.cdp, () => {
			const task = [...document.querySelectorAll('[aria-label="Answer steps"] button')].find(
				(button) => /open task/i.test(button.getAttribute('aria-label') ?? '')
			);
			if (!task || task.disabled) return false;
			task.click();
			return true;
		});
		if (review) {
			await waitUntil(
				async () => (await collectPracticeDom(page.cdp, contract.stages)).activeStageId === 'task',
				options.timeoutMs,
				100
			);
		}
		await replaceEditorText(page.cdp, 'Edited synthetic UI fixture; no learner evidence.');
		const afterEdit = await collectPracticeDom(page.cdp, contract.stages);
		const resetClicked = await evaluate(page.cdp, () => {
			const button = [...document.querySelectorAll('button')].find(
				(item) => item.textContent?.replace(/\s+/g, ' ').trim() === 'Reset practice'
			);
			if (!button) return false;
			button.click();
			return true;
		});
		if (resetClicked) await delay(150);
		const afterReset = await collectPracticeDom(page.cdp, contract.stages);
		return {
			laterStageLockedBeforePass: before.lockedStageIds.length >= contract.stages.length - 3,
			passedStageReviewable: review && afterEdit.activeStageId === 'task',
			editingEarlierStageInvalidatesDownstream:
				afterEdit.unlockedStageIds.length === 1 && afterEdit.unlockedStageIds[0] === 'task',
			resetClearsAttempt:
				resetClicked &&
				afterReset.activeStageId === 'task' &&
				afterReset.answer === '' &&
				afterReset.completedCount === 0,
			notes:
				'Uses explicitly labelled synthetic session state; no grading model result is asserted.'
		};
	} finally {
		await page.close();
	}
}

async function runLayoutCase({ chrome, contract, layoutCase, options, report }) {
	const state = buildSyntheticEnglishPracticeState(contract, { activeStageId: 'task' });
	const page = await openPracticePage({
		chrome,
		contract,
		pathname: `/questions/${encodeURIComponent(contract.questionId)}/practice/step-by-step/task`,
		viewport: ENGLISH_LITERATURE_BROWSER_VIEWPORTS[layoutCase.viewport],
		theme: layoutCase.theme,
		state,
		options,
		interceptWrites: true,
		report
	});
	try {
		const before = await collectStabilityMetrics(page.cdp);
		await delay(300);
		const after = await collectStabilityMetrics(page.cdp);
		const layout = await collectLayoutEvidence(page.cdp);
		const content = await collectPracticeLayoutContent(page.cdp);
		const permittedClipping = (item) =>
			/\.qc-stepper|\.qc-step-number/.test(item.selector) || (item.textSample?.length ?? 0) === 0;
		const substantiveClipping = layout.clippedContent.filter((item) => !permittedClipping(item));
		const permittedScroll = layout.horizontalScrollRegions.every((item) =>
			/\.qc-stepper/.test(item.selector)
		);
		const stableHeight =
			Math.abs(after.documentHeight - before.documentHeight) <= 2 &&
			Math.abs(after.workspaceHeight - before.workspaceHeight) <= 2 &&
			after.layoutShiftScore <= 0.1;
		const sourceReadable = layoutCase.requiresSourceContext
			? content.questionTextReadable &&
				content.sourceImages.length >= contract.question.assets.length &&
				content.sourceImages.every(
					(image) => image.loaded && image.width >= 180 && image.alt.trim().length > 0
				)
			: content.questionTextReadable;
		const feedbackReadable =
			content.feedback.visible &&
			content.feedback.width > 240 &&
			content.feedback.fontSizePx >= 12 &&
			!content.feedback.clipped;
		let screenshot = null;
		if (options.screenshots) {
			const filename = `${safeFilename(contract.questionId)}--${layoutCase.viewport}--${layoutCase.theme}.jpg`;
			const screenshotPath = path.join(options.output, 'screenshots', filename);
			await captureScreenshot(page.cdp, screenshotPath, 'full');
			screenshot = path.relative(options.output, screenshotPath);
		}
		const result = {
			...layoutCase,
			evidenceKind: 'synthetic-ui-fixture',
			status: 'passed',
			sourceReadable,
			noClipping: substantiveClipping.length === 0 && layout.viewportProtrusions.length === 0,
			noOverflow: !layout.documentHorizontalOverflow && permittedScroll,
			stableHeight,
			feedbackReadable,
			screenshot,
			stability: { before, after },
			content,
			layout,
			issues: []
		};
		for (const key of [
			'sourceReadable',
			'noClipping',
			'noOverflow',
			'stableHeight',
			'feedbackReadable'
		]) {
			if (!result[key]) result.issues.push(key);
		}
		if (options.screenshots && !screenshot) result.issues.push('screenshot');
		if (result.issues.length > 0) result.status = 'failed';
		return result;
	} finally {
		await page.close();
	}
}

async function runModelEvidence({ chrome, report, inputs, contracts, options, reportPath }) {
	const definitions = englishLiteratureModelRunDefinitions(inputs);
	for (const definition of definitions) {
		const checkpoints = report.modelRuns.filter(
			(run) => modelRunKey(run) === modelRunKey(definition)
		);
		if (checkpoints.length > 1) {
			throw new Error(`Duplicate model checkpoint: ${modelRunKey(definition)}.`);
		}
		if (checkpoints.length === 1) {
			assertResumableModelRun(checkpoints[0], definition);
			console.log(`SKIPPED model ${modelRunKey(definition)} (verified exact-input checkpoint)`);
			continue;
		}
		const contract = contracts.find((item) => item.questionId === definition.questionId);
		if (!contract) throw new Error(`Runtime contract missing for ${definition.questionId}.`);
		const priorResult =
			definition.kind === 'scenario' && definition.priorScenarioId
				? report.modelRuns.find(
						(run) => run.kind === 'scenario' && run.id === definition.priorScenarioId
					)
				: null;
		const modelRun = await runModelCase({
			chrome,
			contract,
			definition,
			priorResult,
			options,
			report
		});
		report.modelRuns.push(modelRun);
		mergeModelRun(report.plan, modelRun);
		await writeJsonAtomic(reportPath, report);
		console.log(`${modelRun.status.toUpperCase()} model ${modelRun.kind} ${modelRun.id}`);
		if (modelRun.status !== 'passed') throw new Error(`Model run failed: ${modelRun.id}`);
	}
}

async function runModelCase({ chrome, contract, definition, priorResult, options, report }) {
	const state = modelRunInitialState(contract, definition, priorResult);
	const page = await openPracticePage({
		chrome,
		contract,
		pathname: `/questions/${encodeURIComponent(contract.questionId)}/practice/step-by-step/${encodeURIComponent(definition.stageId)}`,
		viewport: ENGLISH_LITERATURE_BROWSER_VIEWPORTS.desktop,
		theme: 'light',
		state,
		options,
		interceptWrites: false,
		report
	});
	const startedAt = new Date().toISOString();
	try {
		const initial = await collectPracticeDom(page.cdp, contract.stages);
		if (!initial.signedIn) throw new Error('Model validation page is not signed in.');
		await replaceEditorText(page.cdp, definition.exactInput, true);
		const typed = await collectPracticeDom(page.cdp, contract.stages);
		if (typed.answer !== definition.exactInput)
			throw new Error('Chrome did not retain the exact input.');
		const clicked = await evaluate(page.cdp, () => {
			const button = [...document.querySelectorAll('button')].find((item) =>
				/^(check step|check again)$/i.test(item.textContent?.replace(/\s+/g, ' ').trim() ?? '')
			);
			if (!button || button.disabled) return false;
			button.click();
			return true;
		});
		if (!clicked) throw new Error('Chrome could not click the enabled step-check button.');
		await waitUntil(
			async () => {
				const snapshot = await readEnglishPracticeStorage(page.cdp, contract.questionId);
				const result = snapshot?.stepResults?.[definition.stageId];
				return result?.checkedAnswer === definition.exactInput;
			},
			options.timeoutMs,
			250
		);
		const storage = await readEnglishPracticeStorage(page.cdp, contract.questionId);
		const result = storage.stepResults[definition.stageId];
		const dom = await collectPracticeDom(page.cdp, contract.stages);
		const expectedCriterionIds = contract.stages
			.find((stage) => stage.id === definition.stageId)
			.successCriteria.map((criterion) => criterion.id);
		const resultCriterionIds = result.checks.map((check) => check.id);
		if (JSON.stringify(resultCriterionIds) !== JSON.stringify(expectedCriterionIds)) {
			throw new Error('Model result did not return every configured criterion in order.');
		}
		if (page.gradeRequests.length !== 1) {
			throw new Error(`Expected one grade-step request; observed ${page.gradeRequests.length}.`);
		}
		const sanitizedInput = sanitizeTrackedEvidenceText(definition.exactInput, 5000);
		const sanitizedResult = sanitizeEvidenceTree(result);
		if (sanitizedInput.redactionCount || sanitizedResult.redactionCount) {
			throw new Error(
				'Secret-like material was redacted; refusing to treat altered text as exact evidence.'
			);
		}
		return {
			kind: definition.kind,
			id: definition.id,
			questionId: definition.questionId,
			taskKind: definition.taskKind,
			stageId: definition.stageId,
			criterionId: definition.criterionId ?? null,
			evidenceKind: 'learner-model',
			status: 'passed',
			startedAt,
			finishedAt: new Date().toISOString(),
			exactInput: sanitizedInput.text,
			exactInputSha256: sanitizedInput.sha256,
			result: sanitizedResult.value,
			activeStageAfter: dom.activeStageId,
			unlockedStageIds: dom.unlockedStageIds,
			gradeRequestsObserved: page.gradeRequests,
			feedbackText: dom.feedbackText,
			manualReview: {
				feedbackCitesLearnerText: null,
				isolatesOnlyMissingMove: null,
				movedGoalposts: null,
				acknowledgedRepairedWeakness: null,
				learnerEvidenceByCriterion: {}
			}
		};
	} finally {
		await page.close();
	}
}

function modelRunInitialState(contract, definition, priorResult) {
	const stepAnswers = Object.fromEntries(contract.stages.map((stage) => [stage.id, '']));
	const stepResults = {};
	for (const prerequisite of definition.prerequisiteAnswers ?? []) {
		const stage = contract.stages.find((item) => item.id === prerequisite.stageId);
		if (!stage) throw new Error(`Unknown prerequisite stage ${prerequisite.stageId}.`);
		stepAnswers[stage.id] = prerequisite.exactInput;
		stepResults[stage.id] = syntheticPassingResult(stage, prerequisite.exactInput);
	}
	const attemptHistory = [];
	if (priorResult?.result) {
		stepAnswers[definition.stageId] = priorResult.exactInput;
		stepResults[definition.stageId] = priorResult.result;
		attemptHistory.push({
			stepId: priorResult.result.stepId,
			stepTitle: priorResult.result.stepTitle,
			answer: priorResult.exactInput,
			decision: priorResult.result.decision,
			checks: priorResult.result.checks,
			nextImprovement: priorResult.result.nextImprovement
		});
	}
	return {
		stepAnswers,
		stepResults,
		attemptHistory,
		externalInputSourcesByStep: {},
		activitySessionId: `english-validation-${sha256(definition.id).slice(0, 20)}`,
		responseStartedAt: Date.now(),
		pendingCheckId: '',
		pendingCheckSignature: '',
		pendingResponseDurationMs: null,
		updatedAt: Number.MAX_SAFE_INTEGER
	};
}

function syntheticPassingResult(stage, answer) {
	return {
		status: 'ok',
		decision: 'pass',
		stepId: stage.id,
		stepTitle: stage.title,
		checkedAnswer: answer,
		checks: stage.successCriteria.map((criterion) => ({
			id: criterion.id,
			label: criterion.label,
			status: 'met',
			feedback: 'Synthetic prerequisite unlock only; not learner grading evidence.'
		})),
		nextImprovement: 'Synthetic prerequisite unlock only.',
		coachingNote: 'Synthetic prerequisite unlock only.',
		learnerModel: {
			observedStrength: 'Synthetic prerequisite',
			recurringNeed: 'Synthetic prerequisite',
			nextStrategy: 'Synthetic prerequisite'
		},
		confidence: 0,
		model: 'synthetic-ui-fixture',
		modelVersion: 'synthetic-ui-fixture'
	};
}

async function openPracticePage({
	chrome,
	contract,
	pathname,
	viewport,
	theme,
	state,
	options,
	interceptWrites,
	report
}) {
	const target = await chrome.newTarget();
	const cdp = await CdpClient.connect(target.webSocketDebuggerUrl, options.timeoutMs);
	const requestIds = new Set();
	const gradeRequests = [];
	const intercepted = [];
	cdp.on('Network.requestWillBeSent', (event) => {
		if (
			['Document', 'Stylesheet', 'Image', 'Font', 'Script', 'XHR', 'Fetch'].includes(event.type)
		) {
			requestIds.add(event.requestId);
		}
		if (/\/api\/questions\/[^/]+\/grade-step$/.test(new URL(event.request.url).pathname)) {
			gradeRequests.push({
				method: event.request.method,
				path: new URL(event.request.url).pathname,
				timestamp: event.timestamp
			});
		}
	});
	cdp.on('Network.loadingFinished', (event) => requestIds.delete(event.requestId));
	cdp.on('Network.loadingFailed', (event) => requestIds.delete(event.requestId));
	cdp.on('Fetch.requestPaused', (event) => {
		const url = new URL(event.request.url);
		if (interceptWrites && READ_ONLY_INTERCEPT_PATHS.includes(url.pathname)) {
			const write = {
				questionId: contract.questionId,
				method: event.request.method,
				path: url.pathname,
				observedAt: new Date().toISOString()
			};
			intercepted.push(write);
			report.interceptedWrites.push(write);
			void cdp.send('Fetch.fulfillRequest', {
				requestId: event.requestId,
				responseCode: 204,
				responseHeaders: [{ name: 'content-type', value: 'application/json' }],
				body: ''
			});
		} else {
			void cdp.send('Fetch.continueRequest', { requestId: event.requestId });
		}
	});

	await Promise.all([
		cdp.send('Page.enable'),
		cdp.send('Runtime.enable'),
		cdp.send('Network.enable'),
		cdp.send('Fetch.enable', {
			patterns: READ_ONLY_INTERCEPT_PATHS.map((urlPattern) => ({
				urlPattern: `*${urlPattern}*`,
				requestStage: 'Request'
			}))
		})
	]);
	await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
	await cdp.send('Emulation.setDeviceMetricsOverride', {
		width: viewport.width,
		height: viewport.height,
		deviceScaleFactor: viewport.deviceScaleFactor,
		mobile: viewport.mobile,
		screenWidth: viewport.width,
		screenHeight: viewport.height,
		dontSetVisibleSize: false
	});
	await cdp.send('Emulation.setTouchEmulationEnabled', {
		enabled: viewport.touch,
		maxTouchPoints: viewport.touch ? 5 : 1
	});
	await cdp.send('Emulation.setEmulatedMedia', {
		media: 'screen',
		features: [
			{ name: 'prefers-color-scheme', value: theme },
			{ name: 'prefers-reduced-motion', value: 'reduce' }
		]
	});
	const identity = contract._runtimeUserId ?? 'anonymous';
	const storageKey = `question-constellation:english-practice:v3:${identity}:${contract.questionId}`;
	const queueKey = `question-constellation:practice-draft-queue:v1:${identity}`;
	await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
		source: `(() => {
			try {
				localStorage.setItem('question-constellation-theme', ${JSON.stringify(theme)});
				localStorage.removeItem(${JSON.stringify(queueKey)});
				sessionStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(state))});
				window.__qcEnglishValidationLayoutShifts = [];
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						if (!entry.hadRecentInput) window.__qcEnglishValidationLayoutShifts.push(entry.value);
					}
				}).observe({ type: 'layout-shift', buffered: true });
			} catch {}
		})();`
	});
	const load = cdp.waitFor('Page.loadEventFired', options.timeoutMs);
	await cdp.send('Page.navigate', { url: new URL(pathname, `${options.baseUrl}/`).toString() });
	await load;
	await waitForDocumentReady(cdp, options.timeoutMs);
	await waitForNetworkIdle(requestIds, options.timeoutMs, options.settleMs);
	await settlePageAssets(cdp, options.timeoutMs);
	await forceTheme(cdp, theme);
	return {
		cdp,
		gradeRequests,
		interceptedWrites: intercepted,
		async close() {
			cdp.close();
			await chrome.closeTarget(target.id);
		}
	};
}

async function observeStage(cdp, expectedHintCount, stages) {
	const before = await collectPracticeDom(cdp, stages);
	const hints = [];
	if (expectedHintCount > 0) {
		await evaluate(cdp, () => document.querySelector('.qc-hint-toggle')?.click());
		await delay(50);
		for (let index = 0; index < expectedHintCount; index += 1) {
			hints.push(
				await evaluate(cdp, () => ({
					title: document.querySelector('.qc-hint-body header p')?.textContent?.trim() ?? '',
					text:
						document
							.querySelector('.qc-hint-body > span')
							?.textContent?.replace(/\s+/g, ' ')
							.trim() ?? ''
				}))
			);
			if (index < expectedHintCount - 1) {
				await evaluate(cdp, () => document.querySelector('[aria-label="Next hint"]')?.click());
				await delay(30);
			}
		}
	}
	return { ...before, hints };
}

async function collectPracticeDom(cdp, stages) {
	return evaluate(
		cdp,
		(stageIds) => {
			const text = (selector) =>
				document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
			const buttons = [...document.querySelectorAll('[aria-label="Answer steps"] button')];
			const activeButton = buttons.find((button) => button.getAttribute('aria-current') === 'step');
			const activeLabel = activeButton?.getAttribute('aria-label') ?? '';
			const activeStageId = new URL(location.href).pathname.split('/').at(-1) ?? null;
			const primary = [...document.querySelectorAll('button')].find((button) =>
				/^(check step|check again|continue|finish practice)$/i.test(
					button.textContent?.replace(/\s+/g, ' ').trim() ?? ''
				)
			);
			const completed = text('.qc-step-footer span').match(/^(\d+)\//)?.[1];
			return {
				url: location.href,
				signedIn: Boolean(document.querySelector('[aria-label="Account menu"]')),
				activeStageId,
				activeLabel,
				title: text('#active-step-title'),
				goal: text('.qc-step-goal span'),
				criterionLabels: [...document.querySelectorAll('.qc-step-checks strong')].map((element) =>
					element.textContent?.replace(/\s+/g, ' ').trim()
				),
				feedbackText: text('[aria-label="Feedback"]'),
				answer: document.querySelector('.qc-step-answer textarea')?.value ?? '',
				primaryDisabled: primary?.disabled ?? null,
				unlockedStageIds: buttons
					.map((button, index) => (!button.disabled ? stageIds[index] : null))
					.filter(Boolean),
				lockedStageIds: buttons
					.map((button, index) => (button.disabled ? stageIds[index] : null))
					.filter(Boolean),
				completedCount: Number(completed ?? 0)
			};
		},
		stages.map((stage) => stage.id)
	);
}

async function replaceEditorText(cdp, value, realTyping = false) {
	await evaluate(cdp, () => {
		const editor = document.querySelector('.qc-step-answer textarea');
		if (!(editor instanceof HTMLTextAreaElement))
			throw new Error('Active response textarea missing.');
		editor.focus();
		editor.select();
	});
	if (realTyping) {
		await cdp.send('Input.dispatchKeyEvent', {
			type: 'keyDown',
			key: 'Backspace',
			code: 'Backspace',
			windowsVirtualKeyCode: 8,
			nativeVirtualKeyCode: 8
		});
		await cdp.send('Input.dispatchKeyEvent', {
			type: 'keyUp',
			key: 'Backspace',
			code: 'Backspace',
			windowsVirtualKeyCode: 8,
			nativeVirtualKeyCode: 8
		});
		await cdp.send('Input.insertText', { text: value });
	} else {
		await evaluate(
			cdp,
			(textValue) => {
				const editor = document.querySelector('.qc-step-answer textarea');
				const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
				setter?.call(editor, textValue);
				editor.dispatchEvent(
					new InputEvent('input', { bubbles: true, inputType: 'insertText', data: textValue })
				);
			},
			value
		);
	}
	await delay(50);
}

async function readEnglishPracticeStorage(cdp, questionId) {
	return evaluate(
		cdp,
		(id) => {
			const key = Object.keys(sessionStorage).find(
				(candidate) =>
					candidate.startsWith('question-constellation:english-practice:v3:') &&
					candidate.endsWith(`:${id}`)
			);
			return key ? JSON.parse(sessionStorage.getItem(key)) : null;
		},
		questionId
	);
}

async function collectStabilityMetrics(cdp) {
	return evaluate(cdp, () => ({
		documentHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
		workspaceHeight:
			document.querySelector('.qc-step-workspace')?.getBoundingClientRect().height ?? 0,
		layoutShiftScore: (window.__qcEnglishValidationLayoutShifts ?? []).reduce(
			(sum, value) => sum + value,
			0
		),
		pendingImages: [...document.images].filter((image) => !image.complete).length
	}));
}

async function collectPracticeLayoutContent(cdp) {
	return evaluate(cdp, () => {
		const visible = (element) => {
			if (!element) return false;
			const rect = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
		};
		const feedback = document.querySelector('[aria-label="Feedback"]');
		const feedbackRect = feedback?.getBoundingClientRect();
		const feedbackStyle = feedback ? getComputedStyle(feedback) : null;
		return {
			questionTextReadable:
				visible(document.querySelector('.qc-step-question .qc-exam-card')) &&
				(document.querySelector('.qc-step-question .qc-exam-card')?.textContent?.trim().length ??
					0) > 0,
			sourceImages: [...document.querySelectorAll('.qc-step-question .qc-exam-card img')]
				.filter(visible)
				.map((image) => ({
					loaded: image.complete && image.naturalWidth > 0,
					width: Math.round(image.getBoundingClientRect().width),
					height: Math.round(image.getBoundingClientRect().height),
					alt: image.alt
				})),
			feedback: {
				visible: visible(feedback),
				width: Math.round(feedbackRect?.width ?? 0),
				fontSizePx: Number.parseFloat(feedbackStyle?.fontSize ?? '0'),
				clipped:
					Boolean(feedback) &&
					(feedback.scrollWidth > feedback.clientWidth + 2 ||
						feedback.scrollHeight > feedback.clientHeight + 2)
			}
		};
	});
}

function buildEmptyPracticeState(contract) {
	return {
		stepAnswers: Object.fromEntries(contract.stages.map((stage) => [stage.id, ''])),
		stepResults: {},
		attemptHistory: [],
		externalInputSourcesByStep: {},
		activitySessionId: 'english-validation-empty-ui-fixture',
		responseStartedAt: 1,
		pendingCheckId: '',
		pendingCheckSignature: '',
		pendingResponseDurationMs: null,
		updatedAt: Number.MAX_SAFE_INTEGER
	};
}

function mergeQuestionAudit(plan, browserAudit) {
	const target = plan.execution.questionAudits.find(
		(audit) => audit.questionId === browserAudit.questionId
	);
	if (!target) return;
	for (const stage of target.stageContract) {
		const observation = browserAudit.stages.find((item) => item.activeStageId === stage.stageId);
		stage.browserObserved = observation ?? null;
	}
	target.navigation.directPracticeRedirectsToTask = browserAudit.directRoute.redirectsToTask;
	Object.assign(target.navigation, browserAudit.navigation);
}

function mergeLayoutEvidence(plan, browserLayout) {
	const target = plan.execution.layouts.find(
		(layout) =>
			layout.questionId === browserLayout.questionId &&
			layout.viewport === browserLayout.viewport &&
			layout.theme === browserLayout.theme
	);
	if (!target) return;
	for (const key of [
		'sourceReadable',
		'noClipping',
		'noOverflow',
		'stableHeight',
		'feedbackReadable',
		'screenshot'
	]) {
		target[key] = browserLayout[key];
	}
	target.notes = 'Synthetic feedback fixture used for visual rendering only.';
}

function mergeExactInputs(plan, inputs) {
	for (const scenario of plan.execution.scenarios) {
		const source = inputs.scenarios.find((item) => item.id === scenario.id);
		if (source) scenario.exactInput = source.exactInput;
	}
	for (const replay of plan.execution.replays) {
		const source = inputs.replays.find(
			(item) => item.groupId === replay.groupId && item.variant === replay.variant
		);
		if (source) replay.exactInput = source.exactInput;
	}
}

function mergeModelRun(plan, modelRun) {
	if (modelRun.kind === 'scenario') {
		const scenario = plan.execution.scenarios.find((item) => item.id === modelRun.id);
		if (!scenario) return;
		scenario.exactInput = modelRun.exactInput;
		scenario.result.submissionOutcome = 'graded';
		scenario.result.modelCallObserved = modelRun.gradeRequestsObserved.length === 1;
		scenario.result.checkControlDisabled = false;
		scenario.result.decision = modelRun.result.decision;
		scenario.result.checks = modelRun.result.checks.map((check) => ({
			...check,
			learnerEvidence: modelRun.manualReview.learnerEvidenceByCriterion[check.id] ?? ''
		}));
		scenario.result.nextImprovement = modelRun.result.nextImprovement;
		scenario.result.coachingNote = modelRun.result.coachingNote;
		scenario.result.activeStageAfter = modelRun.activeStageAfter;
		scenario.result.unlockedStageIds = modelRun.unlockedStageIds;
		for (const key of [
			'feedbackCitesLearnerText',
			'isolatesOnlyMissingMove',
			'movedGoalposts',
			'acknowledgedRepairedWeakness'
		]) {
			scenario.result[key] = modelRun.manualReview[key];
		}
		return;
	}
	if (modelRun.kind === 'replay') {
		const [groupId, variant] = modelRun.id.split(/:(?=\d+$)/);
		const replay = plan.execution.replays.find(
			(item) => item.groupId === groupId && item.variant === Number(variant)
		);
		if (!replay) return;
		replay.exactInput = modelRun.exactInput;
		replay.decision = modelRun.result.decision;
		replay.rawResult = modelRun.result;
		return;
	}
	const audit = plan.execution.questionAudits.find(
		(item) => item.questionId === modelRun.questionId
	);
	const stage = audit?.stageContract.find((item) => item.stageId === modelRun.stageId);
	const check = modelRun.result.checks.find((item) => item.id === modelRun.criterionId);
	if (!stage || !check) return;
	stage.criterionChecks.push({
		criterionId: modelRun.criterionId,
		probeInput: modelRun.exactInput,
		observedStatus: check.status,
		feedback: check.feedback,
		learnerEvidence: modelRun.manualReview.learnerEvidenceByCriterion[check.id] ?? '',
		independentlyVerified: false,
		rawResult: modelRun.result
	});
}

function sanitizeEvidenceTree(value) {
	let redactionCount = 0;
	let truncatedCount = 0;
	const visit = (item) => {
		if (typeof item === 'string') {
			const result = sanitizeTrackedEvidenceText(item);
			redactionCount += result.redactionCount;
			truncatedCount += Number(result.truncated);
			return result.text;
		}
		if (Array.isArray(item)) return item.map(visit);
		if (!item || typeof item !== 'object') return item;
		return Object.fromEntries(Object.entries(item).map(([key, nested]) => [key, visit(nested)]));
	};
	return { value: visit(value), redactionCount, truncatedCount };
}

function finalizeReport(report) {
	report.issues = [];
	for (const audit of report.questionAudits) {
		report.issues.push(...audit.issues.map((issue) => `${audit.questionId}:${issue}`));
	}
	for (const layout of report.layouts) {
		report.issues.push(
			...layout.issues.map(
				(issue) => `${layout.questionId}:${layout.viewport}:${layout.theme}:${issue}`
			)
		);
	}
	for (const run of report.modelRuns) {
		if (run.status !== 'passed') report.issues.push(`model:${run.id}:${run.status}`);
	}
	if (report.configuration.screenshots) {
		for (const layout of report.layouts) {
			if (!layout.screenshot) report.issues.push(`${layout.questionId}:screenshot_missing`);
		}
	}
	if (report.cleanup.required && report.cleanup.after?.status !== 'deleted-and-verified') {
		report.issues.push('dev_auth_cleanup_not_verified');
	}
	if (report.cleanup.required && report.cleanup.before?.status !== 'deleted-and-verified') {
		report.issues.push('dev_auth_cleanup_before_not_verified');
	}
	if (report.questionAudits.length !== report.configuration.selectedQuestionCount) {
		report.issues.push('question_audit_count_mismatch');
	}
	if (report.layouts.length !== report.configuration.selectedQuestionCount * 4) {
		report.issues.push('layout_case_count_mismatch');
	}
	const expectedModelCalls = report.configuration.executionGate?.expectedModelCalls ?? 0;
	if (
		report.mode === 'execute-model-validation' &&
		report.modelRuns.length !== expectedModelCalls
	) {
		report.issues.push('model_run_count_mismatch');
	}
	report.issues = [...new Set(report.issues)];
	report.finishedAt = new Date().toISOString();
	report.summary = {
		questionAuditCount: report.questionAudits.length,
		layoutCaseCount: report.layouts.length,
		layoutPassedCount: report.layouts.filter((layout) => layout.status === 'passed').length,
		modelRunCount: report.modelRuns.length,
		modelCallsObserved: report.modelRuns.reduce(
			(sum, run) => sum + run.gradeRequestsObserved.length,
			0
		),
		interceptedReadOnlyWriteCount: report.interceptedWrites.length,
		issueCount: report.issues.length
	};
	if (
		report.mode === 'execute-model-validation' &&
		report.summary.modelCallsObserved !== expectedModelCalls
	) {
		report.issues.push('model_call_count_mismatch');
		report.issues = [...new Set(report.issues)];
		report.summary.issueCount = report.issues.length;
	}
	report.status = report.fatalError || report.issues.length > 0 ? 'failed' : 'passed';
}

async function cleanupDisposableDevUser() {
	const { stdout } = await execFileAsync(
		process.execPath,
		[
			path.join(rootDir, 'scripts/cleanup-dev-auth-data.mjs'),
			`--user-id=${ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID}`,
			'--write',
			`--confirm=${CLEANUP_CONFIRMATION}`
		],
		{ cwd: rootDir, maxBuffer: 5 * 1024 * 1024 }
	);
	const parsed = JSON.parse(stdout);
	if (parsed.status !== 'deleted-and-verified')
		throw new Error('Dev-auth cleanup was not verified.');
	return {
		status: parsed.status,
		userId: parsed.userId,
		before: {
			personalRows: parsed.before?.personal?.total ?? null,
			analyticsRows: parsed.before?.analytics?.total ?? null
		},
		after: {
			personalRows: parsed.after?.personal?.total ?? null,
			analyticsRows: parsed.after?.analytics?.total ?? null
		}
	};
}

async function assertLocalDevServer(baseUrl) {
	const url = new URL(baseUrl);
	if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || url.protocol !== 'http:') {
		throw new Error('English Literature browser validation is restricted to local HTTP.');
	}
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);
	try {
		const response = await fetch(url, { signal: controller.signal });
		const html = await response.text();
		if (!response.ok || !html.includes('/@vite/client')) {
			throw new Error('The base URL is not the local Vite development server.');
		}
	} finally {
		clearTimeout(timeout);
	}
}

function parseArgs(argv) {
	const result = {
		mode: null,
		plan: null,
		inputs: null,
		baseUrl: 'http://127.0.0.1:5173',
		output: path.resolve(rootDir, 'docs/release-evidence/english-literature-practice-browser'),
		chromeBin: '/usr/bin/google-chrome',
		timeoutMs: 180_000,
		settleMs: 750,
		screenshots: true,
		failOnIssues: false,
		confirm: null,
		confirmPlanSha256: null,
		resume: false,
		help: false
	};
	for (const argument of argv) {
		if (argument === '--help' || argument === '-h') result.help = true;
		else if (argument === '--prepare-input-template') setMode(result, 'prepare-input-template');
		else if (argument === '--read-only-browser') setMode(result, 'read-only-browser');
		else if (argument === '--execute-model-validation') {
			setMode(result, 'execute-model-validation');
		} else if (argument === '--no-screenshots') result.screenshots = false;
		else if (argument === '--fail-on-issues') result.failOnIssues = true;
		else if (argument === '--resume') result.resume = true;
		else if (argument.startsWith('--plan=')) result.plan = value(argument);
		else if (argument.startsWith('--inputs=')) result.inputs = value(argument);
		else if (argument.startsWith('--base-url='))
			result.baseUrl = value(argument).replace(/\/+$/, '');
		else if (argument.startsWith('--output='))
			result.output = path.resolve(rootDir, value(argument));
		else if (argument.startsWith('--chrome-bin=')) result.chromeBin = value(argument);
		else if (argument.startsWith('--timeout-ms=')) {
			result.timeoutMs = positiveInteger(value(argument), argument);
		} else if (argument.startsWith('--settle-ms=')) {
			result.settleMs = positiveInteger(value(argument), argument);
		} else if (argument.startsWith('--confirm=')) result.confirm = value(argument);
		else if (argument.startsWith('--confirm-plan-sha256=')) {
			result.confirmPlanSha256 = value(argument);
		} else throw new Error(`Unknown option: ${argument}\n\n${usage}`);
	}
	if (result.help) return result;
	if (!result.mode) throw new Error(`Choose one execution mode.\n\n${usage}`);
	if (!result.plan) throw new Error('--plan is required.');
	if (result.resume && result.mode !== 'execute-model-validation') {
		throw new Error('--resume is only valid with --execute-model-validation.');
	}
	new URL(result.baseUrl);
	return result;
}

function setMode(result, mode) {
	if (result.mode && result.mode !== mode) throw new Error('Choose exactly one execution mode.');
	result.mode = mode;
}

function value(argument) {
	return argument.slice(argument.indexOf('=') + 1);
}

function positiveInteger(raw, argument) {
	const parsed = Number(raw);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		throw new Error(`Expected a positive integer: ${argument}`);
	}
	return parsed;
}

function safeFilename(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

async function writeJsonAtomic(outputPath, value) {
	await mkdir(path.dirname(outputPath), { recursive: true });
	const temporary = `${outputPath}.tmp-${process.pid}`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
	await rename(temporary, outputPath);
}

function markdownSummary(report) {
	return `# English Literature real-browser validation

- Status: **${report.status}**
- Mode: \`${report.mode}\`
- Questions audited: ${report.summary.questionAuditCount}
- Layouts passed: ${report.summary.layoutPassedCount}/${report.summary.layoutCaseCount}
- Learner-model runs: ${report.summary.modelRunCount}
- Grade requests observed: ${report.summary.modelCallsObserved}
- Issues: ${report.summary.issueCount}
- Disposable-user cleanup: ${report.cleanup.required ? (report.cleanup.after?.status ?? 'not verified') : 'not required'}

Synthetic UI fixtures in this report prove rendering and navigation only. They are not learner,
mark-scheme, examiner-report or quotation evidence. Exact learner inputs and raw returned checks are
retained only in model-run rows whose \`evidenceKind\` is \`learner-model\`.
`;
}

export { assertResumableModelRun, parseArgs };

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
	await main();
}
