/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- This operator-only evidence helper validates external JSON/CDP shapes at runtime.

import { createHash } from 'node:crypto';

export const ENGLISH_LITERATURE_BROWSER_INPUT_SCHEMA =
	'english-literature-practice-browser-inputs-v1';
export const ENGLISH_LITERATURE_BROWSER_REPORT_SCHEMA =
	'english-literature-practice-real-chrome-evidence-v1';
export const ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID = 'ux-cleanup-test-user';

export const ENGLISH_LITERATURE_BROWSER_VIEWPORTS = Object.freeze({
	mobile: Object.freeze({
		width: 390,
		height: 844,
		deviceScaleFactor: 1,
		mobile: true,
		touch: true
	}),
	desktop: Object.freeze({
		width: 1440,
		height: 900,
		deviceScaleFactor: 1,
		mobile: false,
		touch: false
	})
});

const TASK_KINDS = Object.freeze([
	'poetry-comparison',
	'extract-comparison',
	'extract-and-wider',
	'whole-text-judgement',
	'single-text-analysis'
]);

const SECRET_PATTERNS = [
	/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
	/\b(?:CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ACCESS_TOKEN|GEMINI_API_KEY)=[^\s]+/gi,
	/([?&](?:token|secret|key|auth|code|password)=)[^&#\s]+/gi
];

function stableValue(value) {
	if (Array.isArray(value)) return value.map(stableValue);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, stableValue(value[key])])
	);
}

export function stableJson(value) {
	return JSON.stringify(stableValue(value));
}

export function sha256(value) {
	return createHash('sha256')
		.update(typeof value === 'string' ? value : stableJson(value))
		.digest('hex');
}

export function validationPlanFromEvidence(evidence) {
	const plan = evidence?.plan ?? evidence;
	if (!plan || typeof plan !== 'object')
		throw new Error('Validation evidence does not contain plan.');
	if (!Array.isArray(plan.selectedQuestions) || !plan.execution) {
		throw new Error('Validation plan is missing selectedQuestions or execution.');
	}
	return plan;
}

export function planFingerprint(evidence) {
	return sha256(validationPlanFromEvidence(evidence));
}

export function selectionFingerprint(evidence) {
	const plan = validationPlanFromEvidence(evidence);
	return sha256(
		plan.selectedQuestions.map((question) => ({
			questionId: question.questionId,
			taskKind: question.taskKind,
			sourceDocumentId: question.sourceDocumentId,
			sourceQuestionRef: question.sourceQuestionRef,
			rawMarkSchemeItemIds: question.rawMarkSchemeItemIds
		}))
	);
}

function trackedRuntimeContract(contract) {
	return {
		questionId: contract.questionId,
		taskKind: contract.taskKind,
		question: contract.question,
		stages: contract.stages,
		markSchemeItems: contract.markSchemeItems,
		examinerGuidance: contract.examinerGuidance,
		modelAnswer: contract.modelAnswer,
		weakAnswerText: contract.weakAnswerText,
		weakAnswerExplanation: contract.weakAnswerExplanation,
		isExtended: contract.isExtended
	};
}

export function runtimeContractsFingerprint(contracts) {
	return sha256(
		[...(contracts ?? [])]
			.map(trackedRuntimeContract)
			.sort((left, right) => left.questionId.localeCompare(right.questionId))
	);
}

function canonicalMarkRows(rows) {
	return [...(rows ?? [])]
		.map((row) => ({
			id: row.id,
			itemType: row.itemType,
			text: row.text,
			marks: row.marks ?? null,
			sourceRef: row.sourceRef ?? null
		}))
		.sort((left, right) => left.id.localeCompare(right.id));
}

function canonicalSourceAsset(asset) {
	return {
		id: asset.id ?? null,
		publicPath: asset.publicPath ?? null,
		sourceLabel: asset.sourceLabel ?? null,
		altText: asset.altText ?? null
	};
}

export function runtimeContractGroundingIssues(evidence, contracts) {
	const plan = assertReadyEnglishLiteraturePlan(evidence);
	const byQuestion = new Map((contracts ?? []).map((contract) => [contract.questionId, contract]));
	const issues = [];
	for (const selected of plan.selectedQuestions) {
		const contract = byQuestion.get(selected.questionId);
		if (!contract) {
			issues.push(`${selected.questionId}:runtime_contract_missing`);
			continue;
		}
		if (contract.taskKind !== selected.taskKind) {
			issues.push(`${selected.questionId}:runtime_task_kind_mismatch`);
		}
		if (
			stableJson(canonicalMarkRows(contract.markSchemeItems)) !==
			stableJson(canonicalMarkRows(selected.importedMarkSchemeItems ?? selected.rawMarkSchemeItems))
		) {
			issues.push(`${selected.questionId}:runtime_mark_rows_mismatch`);
		}
		const runtimeAssets = (contract.question?.assets ?? []).map(canonicalSourceAsset);
		for (const sourceAsset of selected.sourceAssets ?? []) {
			const expected = canonicalSourceAsset(sourceAsset);
			if (!runtimeAssets.some((asset) => stableJson(asset) === stableJson(expected))) {
				issues.push(
					`${selected.questionId}:runtime_source_asset_missing:${expected.id ?? expected.publicPath}`
				);
			}
		}
		const expectedGuidance = (selected.examinerGuidanceEvidence ?? [])
			.flatMap((item) => item.lines ?? [])
			.slice(0, 20);
		if (stableJson(contract.examinerGuidance ?? []) !== stableJson(expectedGuidance)) {
			issues.push(`${selected.questionId}:runtime_examiner_guidance_mismatch`);
		}
		if ((contract.modelAnswer ?? '') !== (selected.modelAnswer?.answerText ?? '')) {
			issues.push(`${selected.questionId}:runtime_model_answer_mismatch`);
		}
		const planStageIds = plan.execution.questionAudits
			.find((audit) => audit.questionId === selected.questionId)
			?.stageContract.map((stage) => stage.stageId);
		if (stableJson(contract.stages.map((stage) => stage.id)) !== stableJson(planStageIds ?? [])) {
			issues.push(`${selected.questionId}:runtime_stage_ids_mismatch`);
		}
	}
	if (byQuestion.size !== plan.selectedQuestions.length)
		issues.push('runtime_contract_count_mismatch');
	return [...new Set(issues)];
}

export function assertReadyEnglishLiteraturePlan(evidence) {
	const plan = validationPlanFromEvidence(evidence);
	if (plan.status !== 'ready_for_browser_execution') {
		throw new Error(`Validation plan is ${plan.status}; ready_for_browser_execution is required.`);
	}
	if (plan.selectedQuestions.length !== 10) {
		throw new Error(
			`Validation plan selected ${plan.selectedQuestions.length} questions; exactly 10 required.`
		);
	}
	for (const taskKind of TASK_KINDS) {
		const count = plan.selectedQuestions.filter(
			(question) => question.taskKind === taskKind
		).length;
		if (count !== 2)
			throw new Error(`Validation plan must select exactly two ${taskKind} questions.`);
	}
	return plan;
}

export function buildEnglishLiteratureLayoutMatrix(evidence) {
	const plan = assertReadyEnglishLiteraturePlan(evidence);
	return plan.selectedQuestions.flatMap((question) =>
		Object.keys(ENGLISH_LITERATURE_BROWSER_VIEWPORTS).flatMap((viewport) =>
			['light', 'dark'].map((theme) => ({
				questionId: question.questionId,
				taskKind: question.taskKind,
				requiresSourceContext: Boolean(question.requiresSourceContext),
				viewport,
				theme
			}))
		)
	);
}

// SvelteKit's __data.json endpoint uses devalue's flattened JSON representation.
// The practice payload contains only ordinary objects, arrays and primitives; reject every
// extended type instead of silently accepting a representation this evidence reader does not know.
export function unflattenSvelteData(parsed) {
	if (typeof parsed === 'number') {
		const special = hydrateSpecial(parsed);
		if (special.matched) return special.value;
		throw new Error('Invalid standalone flattened page-data reference.');
	}
	if (!Array.isArray(parsed) || parsed.length === 0)
		throw new Error('Invalid flattened page data.');
	const hydrated = new Array(parsed.length);
	const seen = new Set();

	function hydrate(index) {
		const special = hydrateSpecial(index);
		if (special.matched) return special.value;
		if (!Number.isInteger(index) || index < 0 || index >= parsed.length) {
			throw new Error('Invalid flattened page-data reference.');
		}
		if (Object.hasOwn(hydrated, index)) return hydrated[index];
		if (seen.has(index)) throw new Error('Circular flattened page data is not supported.');
		seen.add(index);
		const value = parsed[index];
		if (!value || typeof value !== 'object') {
			hydrated[index] = value;
		} else if (Array.isArray(value)) {
			if (typeof value[0] === 'string') {
				throw new Error(`Unsupported flattened page-data type: ${value[0]}`);
			}
			const array = [];
			hydrated[index] = array;
			for (const reference of value) {
				if (reference === -2) {
					array.length += 1;
				} else {
					array.push(hydrate(reference));
				}
			}
		} else {
			const object = {};
			hydrated[index] = object;
			for (const [key, reference] of Object.entries(value)) {
				if (key === '__proto__') throw new Error('Unsafe __proto__ page-data key.');
				object[key] = hydrate(reference);
			}
		}
		seen.delete(index);
		return hydrated[index];
	}

	return hydrate(0);
}

function hydrateSpecial(index) {
	if (index === -1) return { matched: true, value: undefined };
	if (index === -3) return { matched: true, value: Number.NaN };
	if (index === -4) return { matched: true, value: Number.POSITIVE_INFINITY };
	if (index === -5) return { matched: true, value: Number.NEGATIVE_INFINITY };
	if (index === -6) return { matched: true, value: -0 };
	return { matched: false, value: undefined };
}

export function extractEnglishLiteraturePracticeContract(payload, expectedQuestionId) {
	if (!payload || payload.type !== 'data' || !Array.isArray(payload.nodes)) {
		throw new Error('SvelteKit page-data payload is missing nodes.');
	}
	const pageData = Object.assign(
		{},
		...payload.nodes
			.filter((node) => node?.type === 'data' && Array.isArray(node.data))
			.map((node) => unflattenSvelteData(node.data))
	);
	const practice = pageData.englishPractice;
	if (!practice || practice.questionId !== expectedQuestionId) {
		throw new Error(`Page data did not contain English practice for ${expectedQuestionId}.`);
	}
	if (!Array.isArray(practice.stages) || practice.stages.length !== 5) {
		throw new Error(`${expectedQuestionId} must expose exactly five practice stages.`);
	}
	const stages = practice.stages.map((stage) => {
		if (
			!stage?.id ||
			!stage.title ||
			!stage.goal ||
			!Array.isArray(stage.successCriteria) ||
			stage.successCriteria.length === 0 ||
			!Array.isArray(stage.hints) ||
			stage.hints.length === 0
		) {
			throw new Error(
				`${expectedQuestionId}:${stage?.id ?? 'unknown'} has an incomplete stage contract.`
			);
		}
		return {
			id: String(stage.id),
			title: String(stage.title),
			shortTitle: String(stage.shortTitle ?? ''),
			revealedText: String(stage.revealedText ?? ''),
			prompt: String(stage.prompt ?? ''),
			goal: String(stage.goal),
			successCriteria: stage.successCriteria.map((criterion) => ({
				id: String(criterion.id),
				label: String(criterion.label),
				description: String(criterion.description)
			})),
			hints: stage.hints.map((hint) => ({
				title: String(hint.title ?? ''),
				text: String(hint.text)
			}))
		};
	});
	return {
		questionId: practice.questionId,
		taskKind: practice.taskKind,
		question: {
			id: practice.question?.id,
			sourceRef: practice.question?.sourceRef ?? null,
			title: practice.question?.title ?? null,
			prompt: practice.question?.prompt ?? '',
			context: practice.question?.context ?? '',
			meta: {
				board: practice.question?.meta?.board ?? null,
				qualification: practice.question?.meta?.qualification ?? null,
				subject: practice.question?.meta?.subject ?? null,
				paper: practice.question?.meta?.paper ?? null,
				marks: practice.question?.meta?.marks ?? null
			},
			assets: (practice.question?.assets ?? []).map((asset) => ({
				id: asset.id ?? null,
				publicPath: asset.publicPath,
				sourceLabel: asset.sourceLabel,
				altText: asset.altText
			}))
		},
		stages,
		markSchemeItems: (practice.markSchemeItems ?? []).map((item) => ({
			id: item.id,
			itemType: item.itemType,
			text: item.text,
			marks: item.marks ?? null,
			sourceRef: item.sourceRef ?? null
		})),
		examinerGuidance: [...(practice.examinerGuidance ?? [])].map(String),
		modelAnswer: String(practice.modelAnswer ?? ''),
		weakAnswerText: String(practice.weakAnswerText ?? ''),
		weakAnswerExplanation: String(practice.weakAnswerExplanation ?? ''),
		isExtended: Boolean(practice.isExtended),
		// Kept in-memory for storage-key selection. Report writers must omit this field.
		_runtimeUserId: typeof pageData.user?.uid === 'string' ? pageData.user.uid : null
	};
}

export async function fetchEnglishLiteraturePracticeContract({
	baseUrl,
	questionId,
	timeoutMs = 20_000,
	request = fetch
}) {
	const url = new URL(
		`/questions/${encodeURIComponent(questionId)}/practice/task/__data.json`,
		`${baseUrl}/`
	);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await request(url, {
			headers: { accept: 'application/json' },
			signal: controller.signal
		});
		if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}.`);
		return extractEnglishLiteraturePracticeContract(await response.json(), questionId);
	} finally {
		clearTimeout(timeout);
	}
}

function sourceSafetyTemplate() {
	return {
		humanReviewed: false,
		containsQuotation: null,
		quotationVerifiedExact: null,
		quotationSourceRef: null,
		usesExaminerClaim: null,
		examinerSourceDocumentId: null,
		examinerSourceRef: null
	};
}

function inputSlot(base, exactInput = null) {
	return { ...base, exactInput, sourceSafety: sourceSafetyTemplate() };
}

export function buildEnglishLiteratureBrowserInputTemplate({
	evidence,
	contracts,
	generatedAt = new Date().toISOString()
}) {
	const plan = assertReadyEnglishLiteraturePlan(evidence);
	const byQuestion = new Map(contracts.map((contract) => [contract.questionId, contract]));
	for (const selected of plan.selectedQuestions) {
		if (!byQuestion.has(selected.questionId)) {
			throw new Error(`Runtime contract missing for ${selected.questionId}.`);
		}
	}
	return {
		schemaVersion: ENGLISH_LITERATURE_BROWSER_INPUT_SCHEMA,
		generatedAt,
		planFingerprintSha256: planFingerprint(evidence),
		selectionFingerprintSha256: selectionFingerprint(evidence),
		runtimeContractsFingerprintSha256: runtimeContractsFingerprint(contracts),
		learnerProfile: plan.requirements.learnerProfile,
		reviewer: {
			name: null,
			reviewedAt: null,
			attestsQuestionSpecificInputs: false,
			attestsNoInventedQuotations: false,
			attestsNoInventedExaminerGuidance: false
		},
		scenarios: plan.execution.scenarios.map((scenario) =>
			inputSlot(
				{
					id: scenario.id,
					profile: scenario.profile,
					taskKind: scenario.taskKind,
					questionId: scenario.questionId,
					stageId: scenario.stageId,
					priorScenarioId: scenario.priorScenarioId ?? null
				},
				scenario.profile === 'blank' ? '' : null
			)
		),
		replays: plan.execution.replays.map((replay) =>
			inputSlot({
				groupId: replay.groupId,
				variant: replay.variant,
				taskKind: replay.taskKind,
				questionId: replay.questionId,
				stageId: replay.stageId
			})
		),
		questions: plan.selectedQuestions.map((selected) => {
			const contract = byQuestion.get(selected.questionId);
			return {
				questionId: selected.questionId,
				taskKind: selected.taskKind,
				prompt: contract.question.prompt,
				context: contract.question.context,
				gradingGrounding: {
					questionMeta: contract.question.meta,
					markSchemeItems: contract.markSchemeItems,
					examinerGuidance: contract.examinerGuidance,
					modelAnswer: contract.modelAnswer,
					weakAnswerText: contract.weakAnswerText,
					weakAnswerExplanation: contract.weakAnswerExplanation,
					isExtended: contract.isExtended
				},
				sourceGroundingReview: { verified: null, notes: null },
				stageReviews: contract.stages.map((stage, stageIndex) => ({
					stageId: stage.id,
					title: stage.title,
					goal: stage.goal,
					successCriteria: stage.successCriteria,
					hints: stage.hints,
					fitsExactQuestion: null,
					fitNotes: null,
					prerequisiteAnswers: contract.stages
						.slice(0, stageIndex)
						.map((prior) => inputSlot({ stageId: prior.id })),
					criterionProbes: stage.successCriteria.map((criterion) =>
						inputSlot({ criterionId: criterion.id })
					)
				}))
			};
		})
	};
}

function validateSourceSafety(slot, label, examinerEvidence) {
	const issues = [];
	const safety = slot?.sourceSafety;
	if (!safety || safety.humanReviewed !== true) issues.push(`${label}:source_safety_not_reviewed`);
	if (typeof safety?.containsQuotation !== 'boolean') {
		issues.push(`${label}:quotation_presence_not_declared`);
	} else if (safety.containsQuotation) {
		if (safety.quotationVerifiedExact !== true)
			issues.push(`${label}:quotation_not_verified_exact`);
		if (!normalized(safety.quotationSourceRef))
			issues.push(`${label}:quotation_source_ref_missing`);
	}
	if (typeof safety?.usesExaminerClaim !== 'boolean') {
		issues.push(`${label}:examiner_claim_presence_not_declared`);
	} else if (safety.usesExaminerClaim) {
		if (!normalized(safety.examinerSourceDocumentId) || !normalized(safety.examinerSourceRef)) {
			issues.push(`${label}:examiner_source_provenance_missing`);
		}
		const allowed = (examinerEvidence ?? []).some(
			(evidence) =>
				evidence.sourceDocumentId === safety.examinerSourceDocumentId &&
				evidence.sourceRef === safety.examinerSourceRef
		);
		if (!allowed) issues.push(`${label}:examiner_source_not_in_selected_question_evidence`);
	}
	return issues;
}

function normalized(value) {
	return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function selectedAudit(plan, questionId) {
	return plan.selectedQuestions.find((question) => question.questionId === questionId) ?? null;
}

export function validateEnglishLiteratureBrowserInputs({
	evidence,
	inputs,
	contracts,
	requireComplete = true
}) {
	const plan = assertReadyEnglishLiteraturePlan(evidence);
	const issues = [];
	const runtimeByQuestion = new Map(
		(contracts ?? []).map((contract) => [contract.questionId, contract])
	);
	if (inputs?.schemaVersion !== ENGLISH_LITERATURE_BROWSER_INPUT_SCHEMA) {
		issues.push('input_schema_version_mismatch');
	}
	if (inputs?.planFingerprintSha256 !== planFingerprint(evidence)) {
		issues.push('input_plan_fingerprint_mismatch');
	}
	if (inputs?.selectionFingerprintSha256 !== selectionFingerprint(evidence)) {
		issues.push('input_selection_fingerprint_mismatch');
	}
	if (!/^[a-f0-9]{64}$/.test(inputs?.runtimeContractsFingerprintSha256 ?? '')) {
		issues.push('input_runtime_contract_fingerprint_missing');
	} else if (
		contracts &&
		inputs.runtimeContractsFingerprintSha256 !== runtimeContractsFingerprint(contracts)
	) {
		issues.push('input_runtime_contract_fingerprint_mismatch');
	}
	if (requireComplete) {
		for (const key of [
			'attestsQuestionSpecificInputs',
			'attestsNoInventedQuotations',
			'attestsNoInventedExaminerGuidance'
		]) {
			if (inputs?.reviewer?.[key] !== true) issues.push(`reviewer:${key}`);
		}
		if (!normalized(inputs?.reviewer?.name)) issues.push('reviewer:name_missing');
		if (!normalized(inputs?.reviewer?.reviewedAt)) issues.push('reviewer:reviewed_at_missing');
	}

	const planScenarios = new Map(
		plan.execution.scenarios.map((scenario) => [scenario.id, scenario])
	);
	const inputScenarios = inputs?.scenarios ?? [];
	if (new Set(inputScenarios.map((scenario) => scenario.id)).size !== inputScenarios.length) {
		issues.push('scenario_identity_duplicate');
	}
	for (const scenario of inputScenarios) {
		const expected = planScenarios.get(scenario.id);
		if (
			!expected ||
			scenario.questionId !== expected.questionId ||
			scenario.stageId !== expected.stageId
		) {
			issues.push(`scenario:${scenario.id}:identity_mismatch`);
			continue;
		}
		const text = typeof scenario.exactInput === 'string' ? scenario.exactInput : null;
		if (scenario.profile === 'blank') {
			if (text !== '') issues.push(`scenario:${scenario.id}:blank_input_must_be_empty`);
		} else if (requireComplete && (!normalized(text) || text.length < 8 || text.length > 5000)) {
			issues.push(`scenario:${scenario.id}:exact_input_invalid`);
		}
		if (requireComplete) {
			issues.push(
				...validateSourceSafety(
					scenario,
					`scenario:${scenario.id}`,
					selectedAudit(plan, scenario.questionId)?.examinerGuidanceEvidence
				)
			);
		}
	}
	if ((inputs?.scenarios ?? []).length !== plan.execution.scenarios.length) {
		issues.push('scenario_count_mismatch');
	}
	for (const id of planScenarios.keys()) {
		if (!inputScenarios.some((scenario) => scenario.id === id)) {
			issues.push(`scenario:${id}:missing`);
		}
	}

	const replayKey = (row) => `${row.groupId}:${row.variant}`;
	const planReplays = new Map(plan.execution.replays.map((replay) => [replayKey(replay), replay]));
	const inputReplays = inputs?.replays ?? [];
	if (new Set(inputReplays.map(replayKey)).size !== inputReplays.length) {
		issues.push('replay_identity_duplicate');
	}
	for (const replay of inputReplays) {
		const expected = planReplays.get(replayKey(replay));
		if (
			!expected ||
			replay.questionId !== expected.questionId ||
			replay.stageId !== expected.stageId
		) {
			issues.push(`replay:${replayKey(replay)}:identity_mismatch`);
			continue;
		}
		if (
			requireComplete &&
			(!normalized(replay.exactInput) ||
				replay.exactInput.length < 8 ||
				replay.exactInput.length > 5000)
		) {
			issues.push(`replay:${replayKey(replay)}:exact_input_invalid`);
		}
		if (requireComplete) {
			issues.push(
				...validateSourceSafety(
					replay,
					`replay:${replayKey(replay)}`,
					selectedAudit(plan, replay.questionId)?.examinerGuidanceEvidence
				)
			);
		}
	}
	if ((inputs?.replays ?? []).length !== plan.execution.replays.length) {
		issues.push('replay_count_mismatch');
	}
	for (const key of planReplays.keys()) {
		if (!inputReplays.some((replay) => replayKey(replay) === key)) {
			issues.push(`replay:${key}:missing`);
		}
	}

	const inputQuestions = inputs?.questions ?? [];
	const questionInputs = new Map(inputQuestions.map((question) => [question.questionId, question]));
	if (inputQuestions.length !== plan.execution.questionAudits.length) {
		issues.push('question_count_mismatch');
	}
	if (questionInputs.size !== inputQuestions.length) issues.push('question_identity_duplicate');
	const plannedQuestionIds = new Set(
		plan.execution.questionAudits.map((audit) => audit.questionId)
	);
	for (const question of inputQuestions) {
		if (!plannedQuestionIds.has(question.questionId)) {
			issues.push(`question:${question.questionId}:unexpected`);
		}
	}
	for (const audit of plan.execution.questionAudits) {
		const question = questionInputs.get(audit.questionId);
		if (!question || question.taskKind !== audit.taskKind) {
			issues.push(`question:${audit.questionId}:identity_mismatch`);
			continue;
		}
		const runtimeContract = runtimeByQuestion.get(audit.questionId);
		if (
			runtimeContract &&
			(question.prompt !== runtimeContract.question.prompt ||
				question.context !== runtimeContract.question.context)
		) {
			issues.push(`question:${audit.questionId}:prompt_or_context_mismatch`);
		}
		if (requireComplete && question.sourceGroundingReview?.verified !== true) {
			issues.push(`question:${audit.questionId}:source_grounding_not_reviewed`);
		}
		const stages = new Map((question.stageReviews ?? []).map((stage) => [stage.stageId, stage]));
		if ((question.stageReviews ?? []).length !== audit.stageContract.length) {
			issues.push(`question:${audit.questionId}:stage_review_count_mismatch`);
		}
		if (stages.size !== (question.stageReviews ?? []).length) {
			issues.push(`question:${audit.questionId}:stage_review_duplicate`);
		}
		for (const contract of audit.stageContract) {
			const stage = stages.get(contract.stageId);
			if (!stage) {
				issues.push(`question:${audit.questionId}:${contract.stageId}:stage_review_missing`);
				continue;
			}
			if (requireComplete && stage.fitsExactQuestion !== true) {
				issues.push(`question:${audit.questionId}:${contract.stageId}:fit_not_reviewed`);
			}
			const runtimeStage = runtimeContract?.stages.find(
				(candidate) => candidate.id === contract.stageId
			);
			if (
				runtimeStage &&
				stableJson({
					title: stage.title,
					goal: stage.goal,
					successCriteria: stage.successCriteria,
					hints: stage.hints
				}) !==
					stableJson({
						title: runtimeStage.title,
						goal: runtimeStage.goal,
						successCriteria: runtimeStage.successCriteria,
						hints: runtimeStage.hints
					})
			) {
				issues.push(`question:${audit.questionId}:${contract.stageId}:runtime_contract_mismatch`);
			}
			const stageIndex = audit.stageContract.findIndex(
				(candidate) => candidate.stageId === contract.stageId
			);
			const expectedPrerequisites = audit.stageContract
				.slice(0, stageIndex)
				.map((candidate) => candidate.stageId);
			const actualPrerequisites = (stage.prerequisiteAnswers ?? []).map(
				(prerequisite) => prerequisite.stageId
			);
			if (stableJson(actualPrerequisites) !== stableJson(expectedPrerequisites)) {
				issues.push(
					`question:${audit.questionId}:${contract.stageId}:prerequisite_identity_mismatch`
				);
			}
			const criterionIds = new Set((stage.successCriteria ?? []).map((criterion) => criterion.id));
			const probes = new Map(
				(stage.criterionProbes ?? []).map((probe) => [probe.criterionId, probe])
			);
			if (probes.size !== (stage.criterionProbes ?? []).length) {
				issues.push(`question:${audit.questionId}:${contract.stageId}:criterion_probe_duplicate`);
			}
			if (probes.size !== criterionIds.size) {
				issues.push(
					`question:${audit.questionId}:${contract.stageId}:criterion_probe_count_mismatch`
				);
			}
			for (const criterionId of criterionIds) {
				const probe = probes.get(criterionId);
				const label = `criterion:${audit.questionId}:${contract.stageId}:${criterionId}`;
				if (!probe) {
					issues.push(`${label}:probe_missing`);
					continue;
				}
				if (requireComplete && (!normalized(probe.exactInput) || probe.exactInput.length < 8)) {
					issues.push(`${label}:exact_input_invalid`);
				}
				if (requireComplete) {
					issues.push(
						...validateSourceSafety(
							probe,
							label,
							selectedAudit(plan, audit.questionId)?.examinerGuidanceEvidence
						)
					);
				}
			}
			for (const prerequisite of stage.prerequisiteAnswers ?? []) {
				const label = `prerequisite:${audit.questionId}:${contract.stageId}:${prerequisite.stageId}`;
				if (
					requireComplete &&
					(!normalized(prerequisite.exactInput) || prerequisite.exactInput.length < 8)
				) {
					issues.push(`${label}:exact_input_invalid`);
				}
				if (requireComplete) {
					issues.push(
						...validateSourceSafety(
							prerequisite,
							label,
							selectedAudit(plan, audit.questionId)?.examinerGuidanceEvidence
						)
					);
				}
			}
		}
	}
	return [...new Set(issues)];
}

export function englishLiteratureModelRunDefinitions(inputs) {
	const runs = [];
	for (const scenario of inputs.scenarios ?? []) {
		if (scenario.profile === 'blank') continue;
		runs.push({ kind: 'scenario', id: scenario.id, ...scenario });
	}
	for (const replay of inputs.replays ?? []) {
		runs.push({ kind: 'replay', id: `${replay.groupId}:${replay.variant}`, ...replay });
	}
	for (const question of inputs.questions ?? []) {
		for (const stage of question.stageReviews ?? []) {
			for (const probe of stage.criterionProbes ?? []) {
				runs.push({
					kind: 'criterion-probe',
					id: `${question.questionId}:${stage.stageId}:${probe.criterionId}`,
					questionId: question.questionId,
					taskKind: question.taskKind,
					stageId: stage.stageId,
					criterionId: probe.criterionId,
					exactInput: probe.exactInput,
					sourceSafety: probe.sourceSafety,
					prerequisiteAnswers: stage.prerequisiteAnswers ?? []
				});
			}
		}
	}
	return runs;
}

export function modelExecutionConfirmation(inputs) {
	return `execute-${englishLiteratureModelRunDefinitions(inputs).length}-english-literature-model-calls`;
}

export function assertEnglishLiteratureModelExecutionGate({
	evidence,
	inputs,
	baseUrl,
	confirmation,
	confirmedPlanSha256,
	contracts,
	environment
}) {
	if (!Array.isArray(contracts)) {
		throw new Error('Exact runtime contracts are required before learner-model execution.');
	}
	const groundingIssues = runtimeContractGroundingIssues(evidence, contracts);
	if (groundingIssues.length > 0) {
		throw new Error(`Runtime contract grounding changed:\n- ${groundingIssues.join('\n- ')}`);
	}
	const issues = validateEnglishLiteratureBrowserInputs({
		evidence,
		inputs,
		contracts,
		requireComplete: true
	});
	if (issues.length > 0) {
		throw new Error(`Model input evidence is incomplete:\n- ${issues.join('\n- ')}`);
	}
	const url = new URL(baseUrl);
	if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || url.protocol !== 'http:') {
		throw new Error('Learner-model validation is restricted to a local HTTP development server.');
	}
	if (environment?.DEV_AUTH_USER_ID !== ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID) {
		throw new Error(
			`DEV_AUTH_USER_ID must be the disposable uid ${ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID}.`
		);
	}
	const fingerprint = planFingerprint(evidence);
	if (confirmedPlanSha256 !== fingerprint) {
		throw new Error(`--confirm-plan-sha256 must equal ${fingerprint}.`);
	}
	const expectedConfirmation = modelExecutionConfirmation(inputs);
	if (confirmation !== expectedConfirmation) {
		throw new Error(`Model execution requires --confirm=${expectedConfirmation}.`);
	}
	return {
		planFingerprintSha256: fingerprint,
		inputFingerprintSha256: sha256(inputs),
		runtimeContractsFingerprintSha256: runtimeContractsFingerprint(contracts),
		expectedModelCalls: englishLiteratureModelRunDefinitions(inputs).length,
		cleanupUserId: ENGLISH_LITERATURE_MODEL_VALIDATION_USER_ID
	};
}

export function buildSyntheticEnglishPracticeState(
	contract,
	{
		activeStageId = 'task',
		includeFeedback = true,
		updatedAt = Number.MAX_SAFE_INTEGER,
		responseStartedAt = 1
	} = {}
) {
	const activeIndex = contract.stages.findIndex((stage) => stage.id === activeStageId);
	if (activeIndex < 0) throw new Error(`Unknown stage ${activeStageId}.`);
	const stepAnswers = Object.fromEntries(contract.stages.map((stage) => [stage.id, '']));
	const stepResults = {};
	for (let index = 0; index <= activeIndex; index += 1) {
		const stage = contract.stages[index];
		const answer = `Synthetic UI fixture for ${stage.shortTitle || stage.id}; not learner evidence.`;
		stepAnswers[stage.id] = answer;
		if (index < activeIndex || includeFeedback) {
			const decision = index < activeIndex ? 'pass' : 'revise';
			stepResults[stage.id] = {
				status: 'ok',
				decision,
				stepId: stage.id,
				stepTitle: stage.title,
				checkedAnswer: answer,
				checks: stage.successCriteria.map((criterion, criterionIndex) => ({
					id: criterion.id,
					label: criterion.label,
					status: decision === 'pass' || criterionIndex === 0 ? 'met' : 'not_yet',
					feedback: 'Synthetic layout and navigation fixture; never grading evidence.'
				})),
				nextImprovement: 'Synthetic layout fixture only.',
				coachingNote: 'Synthetic layout fixture only.',
				learnerModel: {
					observedStrength: 'Synthetic fixture',
					recurringNeed: 'Synthetic fixture',
					nextStrategy: 'Synthetic fixture'
				},
				confidence: 0,
				model: 'synthetic-ui-fixture',
				modelVersion: 'synthetic-ui-fixture'
			};
		}
	}
	return {
		stepAnswers,
		stepResults,
		attemptHistory: [],
		externalInputSourcesByStep: {},
		activitySessionId: 'english-validation-synthetic-ui-fixture',
		responseStartedAt,
		pendingCheckId: '',
		pendingCheckSignature: '',
		pendingResponseDurationMs: null,
		updatedAt
	};
}

export function sanitizeTrackedEvidenceText(value, maxLength = 20_000) {
	let text = stripUnsafeControlCharacters(String(value ?? '').replace(/\r\n?/g, '\n'));
	let redactionCount = 0;
	for (const pattern of SECRET_PATTERNS) {
		text = text.replace(pattern, (match, prefix) => {
			redactionCount += 1;
			return prefix ? `${prefix}<redacted>` : '<redacted>';
		});
	}
	const truncated = text.length > maxLength;
	if (truncated) text = text.slice(0, maxLength);
	return {
		text,
		sha256: sha256(text),
		redactionCount,
		truncated
	};
}

function stripUnsafeControlCharacters(value) {
	return [...value]
		.filter((character) => {
			const code = character.charCodeAt(0);
			return code === 9 || code === 10 || (code >= 32 && code !== 127);
		})
		.join('');
}
