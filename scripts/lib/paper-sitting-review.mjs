/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- untrusted CLI artifacts are validated field-by-field before any D1 write.
import { isUnsupportedPaperSittingResponseKind } from '../../src/lib/experiments/questions/paperSittingResponsePolicy.js';
import { estimateOfficialGradeableMarks } from '../../src/lib/experiments/questions/paperSittingGradeabilityPolicy.js';
import { PAPER_SITTING_CONTENT_FINGERPRINT_VERSION } from '../../src/lib/server/paperSittingContentFingerprint.js';
import {
	REQUIRED_PRODUCTION_MODEL,
	REQUIRED_PRODUCTION_THINKING_LEVEL
} from './production-import-policy.mjs';

const REQUIRED_PIPELINE_STEPS = [
	'visible PDF source identity preflight',
	'Codex PDF extraction',
	'independent Codex extraction judge',
	'Codex answer-chain reconciliation',
	'Codex solvability judge',
	'strict audit / D1 write',
	'exact post-import D1 content fingerprint'
];

const ALLOWED_PIPELINE_STEP_STATUSES = new Map([
	['visible PDF source identity preflight', new Set(['passed'])],
	['Codex PDF extraction', new Set(['passed', 'reused'])],
	['independent Codex extraction judge', new Set(['passed', 'reused'])],
	[
		'Codex answer-chain reconciliation',
		new Set(['passed', 'reused', 'reused-after-boundary-repair'])
	],
	['Codex solvability judge', new Set(['passed', 'reused'])],
	['strict audit / D1 write', new Set(['passed'])],
	['exact post-import D1 content fingerprint', new Set(['passed'])]
]);

const OPTION_ROUTED_COMPONENTS = new Set(['J35101', 'J35102', 'J35201', 'J35202']);
const DETERMINISTIC_RESPONSE_KINDS = new Set([
	'choice',
	'choice-table',
	'matching',
	'equation-blanks',
	'number-line',
	'image-label-zones'
]);

function invariant(condition, message) {
	if (!condition) throw new Error(message);
}

function validatedContentFingerprint(value) {
	const fingerprint = String(value ?? '').trim();
	const pattern = new RegExp(`^${PAPER_SITTING_CONTENT_FINGERPRINT_VERSION}:[a-f0-9]{64}$`);
	invariant(
		pattern.test(fingerprint),
		`approvedContentFingerprint must be an exact ${PAPER_SITTING_CONTENT_FINGERPRINT_VERSION} SHA-256 fingerprint.`
	);
	return fingerprint;
}

export function assertMatchingPostImportContentFingerprint(
	evidence,
	liveContentFingerprint,
	expectedSourceDocumentId = null
) {
	invariant(
		evidence &&
			typeof evidence === 'object' &&
			!Array.isArray(evidence) &&
			Object.keys(evidence).sort().join(',') ===
				'capturedAt,contentFingerprint,importMode,producer,schemaVersion,sourceDocumentId',
		'Exact post-import content fingerprint evidence is missing or malformed.'
	);
	invariant(
		evidence.schemaVersion === 'production-import-post-write-content-fingerprint-v1' &&
			evidence.producer === 'scripts/run-codex-production-import-pipeline.mjs' &&
			evidence.importMode === 'write',
		'Exact post-import content fingerprint provenance is invalid.'
	);
	if (expectedSourceDocumentId !== null) {
		invariant(
			evidence.sourceDocumentId === expectedSourceDocumentId,
			'Exact post-import content fingerprint source document does not match.'
		);
	}
	const capturedAt = timestamp(
		evidence.capturedAt,
		'Exact post-import content fingerprint capturedAt'
	);
	const imported = validatedContentFingerprint(evidence.contentFingerprint);
	const live = validatedContentFingerprint(liveContentFingerprint);
	invariant(
		imported === live,
		'Live D1 content fingerprint does not match the exact post-import content fingerprint.'
	);
	return { contentFingerprint: live, capturedAt };
}

function timestamp(value, label) {
	const normalized = /(?:Z|[+-]\d\d:\d\d)$/i.test(String(value ?? ''))
		? String(value)
		: `${String(value ?? '').replace(' ', 'T')}Z`;
	const parsed = Date.parse(normalized);
	invariant(Number.isFinite(parsed), `${label} must be a valid timestamp.`);
	return parsed;
}

function sortedUniqueRefs(refs, label) {
	invariant(Array.isArray(refs) && refs.length > 0, `${label} must contain question refs.`);
	const normalized = refs.map((ref) => String(ref ?? '').trim());
	invariant(normalized.every(Boolean), `${label} contains an empty question ref.`);
	invariant(new Set(normalized).size === normalized.length, `${label} contains duplicate refs.`);
	return normalized.sort((left, right) =>
		left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
	);
}

function sameRefs(left, right) {
	const leftRefs = sortedUniqueRefs(left, 'Left ref set');
	const rightRefs = sortedUniqueRefs(right, 'Right ref set');
	return (
		leftRefs.length === rightRefs.length && leftRefs.every((ref, index) => ref === rightRefs[index])
	);
}

function blockingFindings(value) {
	return Array.isArray(value)
		? value.filter((finding) => String(finding?.severity ?? '').toLowerCase() === 'blocking')
		: [];
}

function verifiedSolvabilityReport(summary, sourceDocumentId, expectedRefs) {
	const solvabilitySummary = summary?.solvabilitySummary;
	invariant(solvabilitySummary?.status === 'passed', 'Codex solvability summary did not pass.');
	const plan = solvabilitySummary?.plan;
	invariant(
		plan?.sourceDocumentId === sourceDocumentId,
		'Codex solvability plan source document does not match the production summary.'
	);
	invariant(
		Number(plan?.questionCount) === expectedRefs.length &&
			sameRefs(plan?.plannedRefs, expectedRefs),
		'Codex solvability plan did not cover the exact full artifact.'
	);
	invariant(
		plan?.question === null && plan?.maxQuestions === null,
		'Filtered Codex solvability runs cannot approve a full paper.'
	);
	const report = solvabilitySummary?.report;
	invariant(report?.status === 'passed', 'Codex solvability report did not pass.');
	invariant(
		report?.sourceDocumentId === sourceDocumentId,
		'Codex solvability report source document does not match the production summary.'
	);
	const minScore = Number(report?.minScore);
	invariant(
		Number.isFinite(minScore) && minScore >= 0.8,
		'Solvability minimum score is below 0.8.'
	);
	const results = Array.isArray(report?.results) ? report.results : [];
	const resultRefs = sortedUniqueRefs(
		results.map((result) => result?.sourceQuestionRef),
		'Solvability results'
	);
	invariant(sameRefs(resultRefs, expectedRefs), 'Solvability refs do not match the full artifact.');
	invariant(
		Number(report?.questionCount) === expectedRefs.length,
		'Solvability question count is stale.'
	);
	invariant(Number(report?.passed) === expectedRefs.length, 'Not every solvability result passed.');
	invariant(Number(report?.failed) === 0, 'The solvability report contains failures.');
	for (const result of results) {
		const ref = String(result?.sourceQuestionRef ?? 'unknown');
		invariant(result?.status === 'passed', `Solvability failed for ${ref}.`);
		invariant(Number(result?.score) >= minScore, `Solvability score is too low for ${ref}.`);
		invariant(result?.studentVisibleSolvable === true, `${ref} is not learner-visible solvable.`);
		invariant(result?.markSchemeFits === true, `${ref} does not fit the mark scheme.`);
		invariant(
			Array.isArray(result?.requiredRepairs) && result.requiredRepairs.length === 0,
			`${ref} still has required solvability repairs.`
		);
		invariant(
			Array.isArray(result?.missingContext) && Array.isArray(result?.renderFindings),
			`${ref} has malformed solvability finding arrays.`
		);
		invariant(
			blockingFindings(result?.missingContext).length === 0 &&
				blockingFindings(result?.renderFindings).length === 0,
			`${ref} still has blocking solvability findings.`
		);
	}
	return report;
}

function validateIndependentExtractionReview(summary, expectedRefs, expectedTotalMarks) {
	const extractionSummary = summary?.extractionSummary;
	invariant(
		Array.isArray(extractionSummary?.droppedExtractionQuestions) &&
			extractionSummary.droppedExtractionQuestions.length === 0,
		'The extraction run held out source questions, so it is not a complete official paper.'
	);

	const judgeSummary = summary?.extractionJudgeSummary;
	invariant(
		Array.isArray(judgeSummary?.plan?.allowedDroppedSourceQuestions) &&
			judgeSummary.plan.allowedDroppedSourceQuestions.length === 0,
		'The independent extraction judge allowed source-question hold-outs.'
	);
	const report = judgeSummary?.judgeReport;
	const ordinaryModelPass =
		report?.status === 'passed' && report?.verdict === 'pass' && Number(report?.score) >= 0.8;
	const reviewedSourceClosure = validateReviewedSourceClosure(
		judgeSummary,
		report,
		expectedRefs,
		expectedTotalMarks
	);
	invariant(
		ordinaryModelPass || reviewedSourceClosure,
		'The independent extraction judge did not pass or receive a complete source-reviewed closure.'
	);
	invariant(
		Array.isArray(report?.requiredRepairs) && report.requiredRepairs.length === 0,
		'The independent extraction judge still requires repairs.'
	);
	invariant(
		Number(report?.questionCount) === expectedRefs.length &&
			Number(report?.markTotal) === expectedTotalMarks,
		'Independent extraction judge counts do not match the complete artifact.'
	);
	invariant(
		sameRefs(report?.checkedRefs, expectedRefs),
		'Independent extraction judge did not check every artifact question ref.'
	);
}

function validateReviewedSourceClosure(judgeSummary, report, expectedRefs, expectedTotalMarks) {
	if (
		judgeSummary?.status !== 'passed_after_reviewed_source_closure' ||
		report?.status !== 'passed_after_reviewed_source_closure' ||
		report?.verdict !== 'reviewed_source_closure'
	) {
		return false;
	}
	const closure = report?.reviewedSourceClosure;
	invariant(
		judgeSummary?.modelJudgePass === false &&
			report?.modelJudgePass === false &&
			closure?.modelJudgePass === false,
		'A source-reviewed closure must explicitly state that it is not a model judge pass.'
	);
	invariant(
		closure?.status === 'passed' &&
			[
				'human_source_reviewed_after_failed_model_audits',
				'human_source_reviewed_false_positive'
			].includes(closure?.closureType),
		'Source-reviewed closure provenance is missing or malformed.'
	);
	invariant(
		Number(closure?.deterministicValidation?.questionCount) === expectedRefs.length &&
			Number(closure?.deterministicValidation?.markTotal) === expectedTotalMarks &&
			closure?.deterministicValidation?.status === 'passed' &&
			Number(closure?.deterministicValidation?.blockingIssues) === 0,
		'Source-reviewed closure lacks exact zero-blocker deterministic validation.'
	);
	for (const artifact of [
		closure?.outputArtifact,
		closure?.deterministicValidation,
		closure?.sourceDocuments?.questionPaper,
		closure?.sourceDocuments?.markScheme
	]) {
		invariant(
			Boolean(artifact?.path) && /^[a-f0-9]{64}$/.test(String(artifact?.sha256 ?? '')),
			'Source-reviewed closure has an unhashed artifact or official source.'
		);
	}
	const audits = Array.isArray(closure?.modelAudits) ? closure.modelAudits : [];
	invariant(audits.length > 0, 'Source-reviewed closure has no archived model audits.');
	const repairRefs = new Set();
	for (const audit of audits) {
		invariant(
			audit?.executionStatus === 'passed' &&
				audit?.verdict === 'fail' &&
				Boolean(audit?.threadId) &&
				audit?.model === REQUIRED_PRODUCTION_MODEL &&
				audit?.thinkingLevel === REQUIRED_PRODUCTION_THINKING_LEVEL &&
				Number(audit?.checkedRefs) === expectedRefs.length &&
				Number(audit?.questionCount) === expectedRefs.length &&
				Number(audit?.markTotal) === expectedTotalMarks &&
				Boolean(audit?.report?.path) &&
				/^[a-f0-9]{64}$/.test(String(audit?.report?.sha256 ?? '')),
			'Source-reviewed closure contains an incomplete or non-failed model audit.'
		);
		invariant(
			Array.isArray(audit?.requiredRepairs) && audit.requiredRepairs.length > 0,
			'Failed model audit has no explicit required-repair set.'
		);
		for (const repair of audit.requiredRepairs) {
			const ref = String(repair?.sourceQuestionRef ?? '').trim();
			invariant(ref, 'Model audit required repair has no source ref.');
			repairRefs.add(ref);
		}
	}
	if (closure.closureType === 'human_source_reviewed_false_positive') {
		const mutation = closure?.candidateMutation;
		for (const artifact of [
			mutation?.before,
			mutation?.after,
			closure?.sourceDocuments?.examinerReport
		]) {
			invariant(
				Boolean(artifact?.path) && /^[a-f0-9]{64}$/.test(String(artifact?.sha256 ?? '')),
				'Source-reviewed false-positive closure has an unhashed candidate or official report.'
			);
		}
		invariant(
			mutation?.unchanged === true &&
				Array.isArray(mutation?.changedPaths) &&
				mutation.changedPaths.length === 0 &&
				mutation.before.sha256 === mutation.after.sha256 &&
				mutation.after.sha256 === closure.outputArtifact.sha256 &&
				/^[a-f0-9]{64}$/.test(String(mutation.before?.canonicalJsonSha256 ?? '')) &&
				mutation.before.canonicalJsonSha256 === mutation.after?.canonicalJsonSha256,
			'Source-reviewed false-positive closure did not prove the candidate stayed unchanged.'
		);
		const findings = Array.isArray(closure?.falsePositiveFindings)
			? closure.falsePositiveFindings
			: [];
		const findingRefs = new Set();
		for (const finding of findings) {
			const ref = String(finding?.sourceQuestionRef ?? '').trim();
			invariant(
				repairRefs.has(ref) &&
					finding?.disposition === 'false_positive_no_candidate_change' &&
					Number(finding?.officialSource?.physicalPdfPage) > 0 &&
					Array.isArray(finding?.officialSource?.anchors) &&
					finding.officialSource.anchors.length > 0 &&
					finding.officialSource.anchors.every((anchor) => String(anchor).trim()),
				'Source-reviewed false-positive finding lacks exact official-source evidence.'
			);
			findingRefs.add(ref);
		}
		invariant(
			findingRefs.size === repairRefs.size && [...repairRefs].every((ref) => findingRefs.has(ref)),
			'Source-reviewed false-positive closure does not dispose every failed finding.'
		);
		invariant(
			typeof closure?.assertion === 'string' &&
				/No model-judge pass is claimed/i.test(closure.assertion),
			'Source-reviewed false-positive closure does not explicitly disclaim a model pass.'
		);
		return true;
	}
	const fieldRepairs = Array.isArray(closure?.fieldRepairs) ? closure.fieldRepairs : [];
	invariant(
		fieldRepairs.length >= repairRefs.size,
		'Source-reviewed repair fields are incomplete.'
	);
	for (const repair of fieldRepairs) {
		invariant(
			repairRefs.has(String(repair?.sourceQuestionRef ?? '')) &&
				Boolean(repair?.field) &&
				/^[a-f0-9]{64}$/.test(String(repair?.beforeSha256 ?? '')) &&
				/^[a-f0-9]{64}$/.test(String(repair?.afterSha256 ?? '')) &&
				repair.beforeSha256 !== repair.afterSha256,
			'Source-reviewed closure contains an untracked or unhashed field repair.'
		);
	}
	const anchorRefs = new Set(
		(Array.isArray(closure?.sourceAnchors) ? closure.sourceAnchors : []).map((anchor) =>
			String(anchor?.sourceQuestionRef ?? '')
		)
	);
	invariant(
		[...repairRefs].every((ref) => anchorRefs.has(ref)),
		'Source-reviewed closure lacks official-source anchors for every repaired ref.'
	);
	invariant(
		typeof closure?.assertion === 'string' &&
			/No third model-judge pass is claimed/i.test(closure.assertion),
		'Source-reviewed closure does not explicitly disclaim a model pass.'
	);
	return true;
}

function validateProductionSummary(
	summary,
	sourceDocumentId,
	artifactQuestionCount,
	expectedRefs,
	expectedTotalMarks,
	liveContentFingerprint
) {
	invariant(summary?.status === 'passed', 'Production import summary did not pass.');
	invariant(
		summary?.plan?.sourceDocumentId === sourceDocumentId,
		'Production summary source document does not match the artifact.'
	);
	invariant(
		summary?.plan?.importMode === 'write',
		'Production summary is not a real D1 write run.'
	);
	invariant(
		summary?.plan?.solvabilityMode === 'codex',
		'Production summary did not use the required Codex per-question solvability gate.'
	);
	for (const field of ['extractionSummary', 'chainSummary']) {
		invariant(summary?.[field]?.status === 'passed', `${field} did not pass.`);
	}
	validateIndependentExtractionReview(summary, expectedRefs, expectedTotalMarks);
	const stepsByLabel = new Map(
		(Array.isArray(summary?.steps) ? summary.steps : []).map((step) => [step?.label, step])
	);
	for (const label of REQUIRED_PIPELINE_STEPS) {
		const step = stepsByLabel.get(label);
		const allowedStatuses = ALLOWED_PIPELINE_STEP_STATUSES.get(label) ?? new Set(['passed']);
		invariant(
			step && allowedStatuses.has(step.status),
			`Production summary is missing an accepted ${label} step (${[...allowedStatuses].join(' or ')}).`
		);
	}
	for (const [label, summaryField] of [
		['Codex PDF extraction', 'extractionSummary'],
		['independent Codex extraction judge', 'extractionJudgeSummary'],
		['Codex answer-chain reconciliation', 'chainSummary'],
		['Codex solvability judge', 'solvabilitySummary']
	]) {
		const phaseSummary = summary?.[summaryField];
		const acceptedPhaseStatus =
			phaseSummary?.status === 'passed' ||
			(label === 'independent Codex extraction judge' &&
				phaseSummary?.status === 'passed_after_reviewed_source_closure');
		invariant(
			acceptedPhaseStatus &&
				phaseSummary?.codex?.status === 'passed' &&
				Boolean(phaseSummary?.codex?.threadId),
			`${label} has no independently passed Codex thread evidence.`
		);
		invariant(
			phaseSummary.codex.model === REQUIRED_PRODUCTION_MODEL &&
				phaseSummary.codex.thinkingLevel === REQUIRED_PRODUCTION_THINKING_LEVEL,
			`${label} must use exact ${REQUIRED_PRODUCTION_MODEL}/${REQUIRED_PRODUCTION_THINKING_LEVEL} evidence.`
		);
	}
	const chainStep = stepsByLabel.get('Codex answer-chain reconciliation');
	if (chainStep?.status === 'reused-after-boundary-repair') {
		const repair = summary?.chainSummary?.phaseBoundaryRepair;
		invariant(
			repair?.status === 'repaired' &&
				repair?.version === 'answer-chain-phase-boundary-v1' &&
				Boolean(repair?.repairedCanonicalJsonSha256 ?? repair?.repairedCandidateSha256),
			'Reused answer-chain phase has no verified boundary-repair provenance.'
		);
	}
	const importReady = summary?.importReady;
	invariant(importReady?.status === 'passed', 'Import-ready audit did not pass.');
	invariant(importReady?.importMode === 'write', 'Import-ready phase was not a D1 write.');
	invariant(
		Number(importReady?.droppedQuestions) === 0,
		'Partial import-ready subsets cannot be approved.'
	);
	invariant(
		Number(importReady?.keptQuestions) === artifactQuestionCount,
		'Import-ready kept-question count does not match the artifact.'
	);
	const importResults = Array.isArray(importReady?.importResults)
		? importReady.importResults
		: [];
	const matchingImports = importResults.filter(
		(result) => result?.sourceDocumentId === sourceDocumentId && result?.mode === 'write'
	);
	invariant(
		importResults.length === 1 && matchingImports.length === 1,
		'Production summary must contain exactly one matching D1 write result for this paper.'
	);
	const matchingImport = matchingImports[0];
	invariant(
		Number(matchingImport?.questions) === artifactQuestionCount,
		'D1 write result question count does not match the artifact.'
	);
	const fingerprintEvidence = assertMatchingPostImportContentFingerprint(
		matchingImport?.postImportContentFingerprintEvidence,
		liveContentFingerprint,
		sourceDocumentId
	);
	const startedAt = timestamp(summary?.startedAt, 'Production summary startedAt');
	const finishedAt = timestamp(summary?.finishedAt, 'Production summary finishedAt');
	invariant(
		fingerprintEvidence.capturedAt >= startedAt &&
			fingerprintEvidence.capturedAt <= finishedAt,
		'Exact post-import content fingerprint was not captured during the production import run.'
	);
	return finishedAt;
}

function artifactDetails(importReadyPaper) {
	const sourceDocumentId = String(
		importReadyPaper?.sourceDocument?.id ?? importReadyPaper?.sourceDocumentId ?? ''
	).trim();
	invariant(sourceDocumentId, 'Import-ready artifact has no source document id.');
	const sourceDocument = importReadyPaper?.sourceDocument ?? {};
	const sourceDescriptor = [
		sourceDocument?.paper,
		sourceDocument?.title,
		sourceDocument?.componentCode
	]
		.map((value) => String(value ?? '').trim())
		.filter(Boolean)
		.join(' | ');
	invariant(
		!/(?:^|\b)(?:section|option)\s+[a-z0-9]+(?:\b|$)/i.test(sourceDescriptor),
		'Import-ready artifact identifies a section or option booklet, not a complete official paper.'
	);
	const componentCode = String(sourceDocument?.componentCode ?? '')
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '');
	invariant(
		!OPTION_ROUTED_COMPONENTS.has(componentCode),
		'Import-ready artifact contains official learner-selected alternatives; the flat all-question inventory is not an answer-all complete paper sitting.'
	);
	const questions = Array.isArray(importReadyPaper?.questions) ? importReadyPaper.questions : [];
	invariant(questions.length > 0, 'Import-ready artifact contains no questions.');
	const extractionRun = importReadyPaper?.extractionRun;
	const droppedSourceQuestions = [
		...(Array.isArray(extractionRun?.droppedUnpublishableSourceQuestions)
			? extractionRun.droppedUnpublishableSourceQuestions
			: []),
		...(Array.isArray(extractionRun?.droppedUnpublishableSourceQuestionRefs)
			? extractionRun.droppedUnpublishableSourceQuestionRefs
			: [])
	];
	invariant(
		extractionRun?.publishableSubset !== true && droppedSourceQuestions.length === 0,
		'Import-ready artifact is a publishable subset, not a complete official paper.'
	);
	const refs = sortedUniqueRefs(
		questions.map((question) => question?.sourceQuestionRef),
		'Import-ready artifact'
	);
	let totalMarks = 0;
	for (const question of questions) {
		const ref = String(question?.sourceQuestionRef ?? 'unknown');
		const marks = Number(question?.marks);
		invariant(Number.isInteger(marks) && marks >= 0, `${ref} has no exact integer marks value.`);
		invariant(question?.needsHumanReview !== true, `${ref} still needs human review.`);
		invariant(
			question?.response && typeof question.response === 'object',
			`${ref} has no reviewed response rendering.`
		);
		const responseKind = String(question.response.kind ?? '').trim();
		invariant(responseKind, `${ref} has no reviewed response kind.`);
		invariant(
			marks === 0 || !isUnsupportedPaperSittingResponseKind(responseKind),
			`${ref} uses unsupported full-paper response kind ${responseKind}.`
		);
		const responseAnswerKeys = Array.isArray(question.response.correctAnswers)
			? question.response.correctAnswers
			: [];
		const gradeableMarks = DETERMINISTIC_RESPONSE_KINDS.has(responseKind)
			? Math.min(marks, responseAnswerKeys.length)
			: estimateOfficialGradeableMarks({
					maxMarks: marks,
					markScheme: Array.isArray(question.markSchemeItems) ? question.markSchemeItems : [],
					checklist: Array.isArray(question.markChecklist) ? question.markChecklist : [],
					answerKeys: []
				});
		invariant(
			marks === 0 || gradeableMarks >= marks,
			`${ref} has grading evidence for only ${gradeableMarks} of ${marks} marks.`
		);
		totalMarks += marks;
	}
	invariant(totalMarks > 0, 'Import-ready artifact has no marks.');
	return { sourceDocumentId, questions, refs, totalMarks };
}

function validateD1Rows({
	d1Questions,
	sourceDocumentId,
	expectedRefs,
	expectedTotalMarks,
	reviewedAt
}) {
	invariant(
		Array.isArray(d1Questions) && d1Questions.length > 0,
		'D1 has no question inventory for this paper.'
	);
	invariant(
		d1Questions.every((row) => row?.source_document_id === sourceDocumentId),
		'D1 inventory contains another source document.'
	);
	invariant(
		d1Questions.every((row) => row?.doc_type === 'question_paper'),
		'D1 source document is not a question paper.'
	);
	const d1Refs = sortedUniqueRefs(
		d1Questions.map((row) => row?.source_question_ref),
		'D1 inventory'
	);
	invariant(
		sameRefs(d1Refs, expectedRefs),
		'D1 inventory does not exactly match the full artifact.'
	);
	let d1Marks = 0;
	const overlayVersions = new Set();
	for (const row of d1Questions) {
		const ref = String(row?.source_question_ref ?? 'unknown');
		invariant(row?.status === 'published', `${ref} is not published in D1.`);
		invariant(Number(row?.question_needs_human_review) === 0, `${ref} needs review in D1.`);
		invariant(row?.overlay_id, `${ref} has no reviewed current rendering overlay in D1.`);
		invariant(row?.overlay_version, `${ref} has no rendering overlay version.`);
		invariant(Number(row?.overlay_needs_human_review) === 0, `${ref} overlay needs review.`);
		invariant(
			Number(row?.required_asset_review_issues) === 0,
			`${ref} has required assets that still need review.`
		);
		invariant(
			timestamp(row?.question_updated_at, `${ref} question updated_at`) <= reviewedAt &&
				timestamp(row?.overlay_updated_at, `${ref} overlay updated_at`) <= reviewedAt,
			`${ref} changed after the production summary finished.`
		);
		const marks = Number(row?.marks);
		invariant(Number.isInteger(marks) && marks >= 0, `${ref} has invalid D1 marks.`);
		d1Marks += marks;
		overlayVersions.add(String(row.overlay_version));
	}
	invariant(d1Marks === expectedTotalMarks, 'D1 total marks do not match the full artifact.');
	invariant(
		overlayVersions.size === 1,
		'Paper questions do not share one current reviewed overlay version.'
	);
	return { overlayVersion: [...overlayVersions][0], d1Refs, d1Marks };
}

/**
 * @param {{
 *   productionSummary: any,
 *   importReadyPaper: any,
 *   d1Questions: any[],
 *   durationMinutes: number,
 *   reviewedBy: string,
 *   pastPaperEntryId: string,
 *   approvedContentFingerprint: string
 * }} input
 */
export function derivePaperSittingReview({
	productionSummary,
	importReadyPaper,
	d1Questions,
	durationMinutes,
	reviewedBy,
	pastPaperEntryId = null,
	approvedContentFingerprint
}) {
	const duration = Number(durationMinutes);
	invariant(
		Number.isInteger(duration) && duration > 0,
		'durationMinutes must be a positive integer.'
	);
	const reviewer = String(reviewedBy ?? '').trim();
	invariant(reviewer, 'reviewedBy is required; approval cannot be anonymous.');
	const linkedPastPaperEntryId = String(pastPaperEntryId ?? '').trim();
	invariant(
		linkedPastPaperEntryId,
		'pastPaperEntryId is required; an approved sitting must be discoverable from its public past-paper entry.'
	);
	const contentFingerprint = validatedContentFingerprint(approvedContentFingerprint);
	const artifact = artifactDetails(importReadyPaper);
	const reviewedAt = validateProductionSummary(
		productionSummary,
		artifact.sourceDocumentId,
		artifact.questions.length,
		artifact.refs,
		artifact.totalMarks,
		contentFingerprint
	);
	const solvabilityReport = verifiedSolvabilityReport(
		productionSummary,
		artifact.sourceDocumentId,
		artifact.refs
	);
	const d1 = validateD1Rows({
		d1Questions,
		sourceDocumentId: artifact.sourceDocumentId,
		expectedRefs: artifact.refs,
		expectedTotalMarks: artifact.totalMarks,
		reviewedAt
	});

	return {
		source_document_id: artifact.sourceDocumentId,
		past_paper_entry_id: linkedPastPaperEntryId,
		scope: 'complete_official_paper',
		overlay_version: d1.overlayVersion,
		expected_question_count: artifact.refs.length,
		expected_total_marks: artifact.totalMarks,
		duration_minutes: duration,
		question_refs_json: JSON.stringify(artifact.refs),
		solvability_report_json: JSON.stringify(solvabilityReport),
		approved_content_fingerprint: contentFingerprint,
		status: 'approved',
		reviewed_by: reviewer,
		reviewed_at: productionSummary.finishedAt
	};
}

/**
 * @param {{catalog: any, pastPaperEntryId: string, importReadyPaper: any}} input
 */
export function validatePastPaperCatalogLink({ catalog, pastPaperEntryId, importReadyPaper }) {
	const entryId = String(pastPaperEntryId ?? '').trim();
	invariant(entryId, 'pastPaperEntryId is required.');
	const entries = (catalog?.pages ?? []).flatMap((page) => page?.entries ?? []);
	const matches = entries.filter((entry) => String(entry?.id ?? '').trim() === entryId);
	invariant(
		matches.length === 1,
		`Past-paper catalog entry ${entryId} was not found exactly once.`
	);
	const entry = matches[0];
	validateCatalogDocumentIdentity({
		entryId,
		label: 'question-paper',
		catalogDocument: documentByType(entry, 'questionPaper'),
		importedDocument: importReadyPaper?.sourceDocument
	});
	validateCatalogDocumentIdentity({
		entryId,
		label: 'mark-scheme',
		catalogDocument: documentByType(entry, 'markScheme'),
		importedDocument: importReadyPaper?.markSchemeDocument
	});
	return entry;
}

function validateCatalogDocumentIdentity({ entryId, label, catalogDocument, importedDocument }) {
	const catalogUrl = String(catalogDocument?.url ?? catalogDocument?.sourceUrl ?? '').trim();
	const importedUrl = String(importedDocument?.sourceUrl ?? importedDocument?.url ?? '').trim();
	const catalogFingerprint = urlDocumentFingerprint(catalogUrl);
	const importedFingerprint = urlDocumentFingerprint(importedUrl);
	const catalogHash = normalizedSha256(catalogDocument);
	const importedHash = normalizedSha256(importedDocument);
	const exactUrlMatch = Boolean(catalogUrl && importedUrl && catalogUrl === importedUrl);
	const exactFingerprintMatch = Boolean(
		catalogFingerprint && importedFingerprint && catalogFingerprint === importedFingerprint
	);
	const exactHashMatch = Boolean(catalogHash && importedHash && catalogHash === importedHash);
	invariant(
		exactUrlMatch || exactFingerprintMatch || exactHashMatch,
		`Past-paper catalog entry ${entryId} does not match the imported ${label} source URL, document fingerprint, or SHA-256.`
	);
}

function documentByType(entry, type) {
	return (entry?.documents ?? []).find((document) => document?.type === type) ?? null;
}

function urlDocumentFingerprint(value) {
	const matches = String(value ?? '').match(/[a-f0-9]{40}/gi) ?? [];
	return matches.length === 1 ? matches[0].toLowerCase() : null;
}

function normalizedSha256(document) {
	const value = String(document?.sha256 ?? document?.fileHash ?? document?.file_hash ?? '')
		.trim()
		.toLowerCase()
		.replace(/^sha256:/, '');
	return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

const REVIEW_COLUMNS = [
	'source_document_id',
	'past_paper_entry_id',
	'scope',
	'overlay_version',
	'expected_question_count',
	'expected_total_marks',
	'duration_minutes',
	'question_refs_json',
	'solvability_report_json',
	'approved_content_fingerprint',
	'status',
	'reviewed_by',
	'reviewed_at'
];

function sameReview(existing, next) {
	return REVIEW_COLUMNS.every(
		(column) => (existing?.[column] ?? null) === (next?.[column] ?? null)
	);
}

const WITHDRAWN_PREDECESSOR_COLUMNS = [
	'source_document_id',
	'past_paper_entry_id',
	'scope',
	'overlay_version',
	'expected_question_count',
	'expected_total_marks',
	'duration_minutes',
	'question_refs_json',
	'solvability_report_json'
];

/**
 * Migration 0028 withdraws legacy approvals because they cannot attest an exact
 * content fingerprint. Batch recovery may replace only that exact predecessor;
 * reviewer identity and time are intentionally new approval metadata.
 */
export function isExactWithdrawnPaperSittingPredecessor(existing, next) {
	return (
		existing?.status === 'withdrawn' &&
		(existing?.approved_content_fingerprint ?? null) === null &&
		WITHDRAWN_PREDECESSOR_COLUMNS.every(
			(column) => (existing?.[column] ?? null) === (next?.[column] ?? null)
		)
	);
}

/** @param {Record<string, any>} record @param {{replace?: boolean}} [options] */
export function paperSittingReviewWriteStatement(record, { replace = false } = {}) {
	validatedContentFingerprint(record?.approved_content_fingerprint);
	const placeholders = REVIEW_COLUMNS.map(() => '?').join(', ');
	const updateSql = REVIEW_COLUMNS.filter((column) => column !== 'source_document_id')
		.map((column) => `${column} = excluded.${column}`)
		.concat('updated_at = CURRENT_TIMESTAMP')
		.join(', ');
	return {
		sql: `INSERT INTO question_paper_sitting_reviews (${REVIEW_COLUMNS.join(', ')}) VALUES (${placeholders})${
			replace ? ` ON CONFLICT(source_document_id) DO UPDATE SET ${updateSql}` : ''
		}`,
		params: REVIEW_COLUMNS.map((column) => record[column] ?? null)
	};
}

/**
 * @param {{
 *   record: Record<string, any>,
 *   existing?: Record<string, any> | null,
 *   write?: boolean,
 *   replace?: boolean,
 *   execute?: (sql: string, params: any[]) => Promise<unknown>
 * }} input
 */
export async function publishPaperSittingReview({
	record,
	existing = null,
	write = false,
	replace = false,
	execute
}) {
	if (existing && sameReview(existing, record)) {
		return { action: 'noop', written: false };
	}
	if (existing && !replace) {
		throw new Error(
			'A different paper sitting review already exists. Inspect it and pass --replace explicitly.'
		);
	}
	const action = existing ? 'replace' : 'insert';
	if (!write) return { action: `would_${action}`, written: false };
	invariant(typeof execute === 'function', 'A D1 execute function is required for write mode.');
	const statement = paperSittingReviewWriteStatement(record, { replace: Boolean(existing) });
	await execute(statement.sql, statement.params);
	return { action, written: true };
}

export { REQUIRED_PIPELINE_STEPS };
