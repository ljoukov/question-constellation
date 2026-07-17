/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- recovery artifacts and D1 rows are validated field-by-field.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { isUnsupportedPaperSittingResponseKind } from '../../src/lib/experiments/questions/paperSittingResponsePolicy.js';
import { estimateOfficialGradeableMarks } from '../../src/lib/experiments/questions/paperSittingGradeabilityPolicy.js';

export const RECOVERED_PHASE_NAMES = [
	'extraction',
	'extractionJudge',
	'answerChains',
	'solvability'
];

const EXACT_MODEL = 'gpt-5.6-sol';
const EXACT_THINKING_LEVEL = 'max';
const REPORT_KEYS = [
	'failed',
	'minScore',
	'passed',
	'questionCount',
	'rationale',
	'results',
	'sourceDocumentId',
	'status'
];
const RESULT_KEYS = [
	'markSchemeFits',
	'missingContext',
	'rationale',
	'renderFindings',
	'requiredRepairs',
	'score',
	'sourceQuestionRef',
	'status',
	'studentVisibleSolvable'
];

function invariant(condition, message) {
	if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
	invariant(
		value && typeof value === 'object' && !Array.isArray(value),
		`${label} must be an object.`
	);
	const actual = Object.keys(value).sort();
	invariant(
		actual.length === expected.length && actual.every((key, index) => key === expected[index]),
		`${label} has unexpected keys: ${actual.join(', ')}.`
	);
}

function iso(value, label) {
	const parsed = Date.parse(String(value ?? ''));
	invariant(Number.isFinite(parsed), `${label} must be a timestamp.`);
	return new Date(parsed).toISOString();
}

export function sha256Bytes(value) {
	return createHash('sha256').update(value).digest('hex');
}

export function parseRolloutJsonl(raw, label = 'rollout') {
	const records = [];
	for (const [index, line] of String(raw).split(/\r?\n/).entries()) {
		if (!line.trim()) continue;
		try {
			records.push(JSON.parse(line));
		} catch (error) {
			throw new Error(`${label} line ${index + 1} is not valid JSON: ${error.message}`, {
				cause: error
			});
		}
	}
	invariant(records.length > 0, `${label} is empty.`);
	return records;
}

function recordsOf(records, type, payloadType = null) {
	return records.filter(
		(record) =>
			record?.type === type && (payloadType === null || record?.payload?.type === payloadType)
	);
}

export function validateArchivedPhaseRollout({
	phaseName,
	phaseEvidence,
	rolloutPath,
	rolloutBytes,
	expectedModel = EXACT_MODEL,
	expectedThinkingLevel = EXACT_THINKING_LEVEL
}) {
	invariant(RECOVERED_PHASE_NAMES.includes(phaseName), `Unsupported recovered phase ${phaseName}.`);
	const ordinaryPass = phaseEvidence?.status === 'passed';
	const reviewedChainClosure =
		phaseName === 'answerChains' &&
		phaseEvidence?.status === 'passed_after_reviewed_source_closure' &&
		phaseEvidence?.reviewedSourceClosure?.status === 'passed' &&
		phaseEvidence?.reviewedSourceClosure?.closureType === 'source_reviewed_chain_link_clearance' &&
		phaseEvidence?.reviewedSourceClosure?.databasePrimaryLinksClean === true &&
		Array.isArray(phaseEvidence?.reviewedSourceClosure?.heldRefs) &&
		phaseEvidence.reviewedSourceClosure.heldRefs.length > 0 &&
		Number(phaseEvidence?.result?.initialNeedsReview) ===
			phaseEvidence.reviewedSourceClosure.heldRefs.length &&
		Number(phaseEvidence?.result?.databaseNeedsReview) === 0;
	invariant(ordinaryPass || reviewedChainClosure, `${phaseName} phase evidence did not pass.`);
	invariant(phaseEvidence?.run?.status === 'passed', `${phaseName} model run did not pass.`);
	invariant(
		phaseEvidence.run.model === expectedModel,
		`${phaseName} model is ${phaseEvidence.run.model ?? 'missing'}, expected ${expectedModel}.`
	);
	invariant(
		phaseEvidence.run.thinkingLevel === expectedThinkingLevel,
		`${phaseName} thinking level is ${phaseEvidence.run.thinkingLevel ?? 'missing'}, expected ${expectedThinkingLevel}.`
	);
	const rollout = phaseEvidence.rollout;
	invariant(rollout?.fileName, `${phaseName} rollout filename is missing.`);
	invariant(
		/^[a-f0-9]{64}$/.test(String(rollout.sha256 ?? '')),
		`${phaseName} rollout SHA-256 is invalid.`
	);
	invariant(rollout.sessionId, `${phaseName} rollout session id is missing.`);
	invariant(
		rollout.sessionId === phaseEvidence.run.threadId,
		`${phaseName} rollout session id does not match the recorded model thread id.`
	);
	invariant(
		path.basename(rolloutPath) === rollout.fileName,
		`${phaseName} rollout filename does not match the archived file.`
	);
	const actualSha256 = sha256Bytes(rolloutBytes);
	invariant(actualSha256 === rollout.sha256, `${phaseName} archived rollout SHA-256 mismatch.`);

	const records = parseRolloutJsonl(rolloutBytes.toString('utf8'), `${phaseName} rollout`);
	const sessionRows = records.filter((record) => record?.type === 'session_meta');
	invariant(
		sessionRows.length === 1,
		`${phaseName} rollout must contain exactly one session_meta row.`
	);
	const session = sessionRows[0];
	invariant(
		session.payload?.session_id === rollout.sessionId && session.payload?.id === rollout.sessionId,
		`${phaseName} session metadata id mismatch.`
	);
	invariant(
		iso(session.timestamp, `${phaseName} session timestamp`) ===
			iso(phaseEvidence.run.startedAt, `${phaseName} recorded start`),
		`${phaseName} recorded start does not match the archive.`
	);

	const contexts = records.filter((record) => record?.type === 'turn_context');
	invariant(contexts.length >= 1, `${phaseName} rollout has no turn_context.`);
	const context = contexts[0].payload ?? {};
	invariant(
		contexts.every((row) => row.payload?.turn_id === context.turn_id),
		`${phaseName} archive contains multiple logical turns.`
	);
	invariant(
		contexts.every((row) => row.payload?.model === expectedModel),
		`${phaseName} archived turn used an unexpected model.`
	);
	invariant(
		contexts.every(
			(row) =>
				row.payload?.effort === expectedThinkingLevel &&
				row.payload?.collaboration_mode?.settings?.reasoning_effort === expectedThinkingLevel
		),
		`${phaseName} archived turn did not use exact ${expectedThinkingLevel} thinking.`
	);
	invariant(
		contexts.every((row) => row.payload?.collaboration_mode?.settings?.model === expectedModel),
		`${phaseName} archived collaboration model does not match.`
	);

	const started = recordsOf(records, 'event_msg', 'task_started');
	const completed = recordsOf(records, 'event_msg', 'task_complete');
	const failed = records.filter(
		(record) =>
			record?.type === 'event_msg' &&
			['task_failed', 'task_aborted', 'turn_aborted'].includes(record?.payload?.type)
	);
	invariant(
		started.length === 1,
		`${phaseName} archive must contain exactly one task_started event.`
	);
	invariant(
		completed.length === 1,
		`${phaseName} archive must contain exactly one task_complete event.`
	);
	invariant(failed.length === 0, `${phaseName} archive contains a failed or aborted task event.`);
	invariant(
		started[0].payload?.turn_id === context.turn_id &&
			completed[0].payload?.turn_id === context.turn_id,
		`${phaseName} archived turn ids do not match.`
	);
	invariant(
		iso(completed[0].timestamp, `${phaseName} completion timestamp`) ===
			iso(phaseEvidence.run.finishedAt, `${phaseName} recorded finish`),
		`${phaseName} recorded finish does not match the archive.`
	);
	invariant(
		completed[0].payload?.last_agent_message === phaseEvidence.finalMessage,
		`${phaseName} final message does not match the immutable archive.`
	);

	return {
		phaseName,
		status: 'passed',
		path: rolloutPath,
		sha256: actualSha256,
		bytes: rolloutBytes.length,
		sessionId: rollout.sessionId,
		turnId: context.turn_id,
		model: context.model,
		thinkingLevel: context.effort,
		startedAt: phaseEvidence.run.startedAt,
		finishedAt: phaseEvidence.run.finishedAt,
		records
	};
}

function readJsonStringLiteral(source, startIndex, label) {
	invariant(source[startIndex] === '"', `${label} is not encoded as a JSON string literal.`);
	let escaped = false;
	for (let index = startIndex + 1; index < source.length; index += 1) {
		const character = source[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === '\\') {
			escaped = true;
			continue;
		}
		if (character === '"') {
			const literal = source.slice(startIndex, index + 1);
			try {
				return { value: JSON.parse(literal), endIndex: index + 1 };
			} catch (error) {
				throw new Error(`${label} string literal is invalid: ${error.message}`, {
					cause: error
				});
			}
		}
	}
	throw new Error(`${label} string literal is unterminated.`);
}

export function extractSolvabilityReportPatch(records) {
	const calls = records.filter(
		(record) =>
			record?.type === 'response_item' &&
			record?.payload?.type === 'custom_tool_call' &&
			record?.payload?.name === 'exec' &&
			String(record?.payload?.input ?? '').includes('*** Add File:') &&
			String(record?.payload?.input ?? '').includes('solvability-report.json')
	);
	invariant(
		calls.length === 1,
		'Archived solvability rollout must contain exactly one full report add patch.'
	);
	const input = String(calls[0].payload.input);
	const declaration = 'const patch = ';
	const declarationIndex = input.indexOf(declaration);
	invariant(declarationIndex >= 0, 'Archived report patch has no exact const patch declaration.');
	const literalStart = declarationIndex + declaration.length;
	const { value: patchText, endIndex } = readJsonStringLiteral(
		input,
		literalStart,
		'Archived report patch'
	);
	invariant(
		input.slice(endIndex).includes('tools.apply_patch(patch)'),
		'Archived report patch was not passed to apply_patch.'
	);
	const lines = patchText.split('\n');
	invariant(lines[0] === '*** Begin Patch', 'Archived report patch has an invalid start marker.');
	invariant(lines.at(-1) === '*** End Patch', 'Archived report patch has an invalid end marker.');
	const addRows = lines
		.map((line, index) => ({ line, index }))
		.filter(({ line }) => line.startsWith('*** Add File: '));
	invariant(addRows.length === 1, 'Archived report patch must add exactly one file.');
	const addedPath = addRows[0].line.slice('*** Add File: '.length).trim();
	invariant(
		path.basename(addedPath) === 'solvability-report.json',
		'Archived patch added the wrong file.'
	);
	invariant(
		addedPath === 'solvability-report.json' ||
			addedPath.endsWith('/codex-solvability/solvability-report.json'),
		'Archived report patch path is outside the solvability work directory.'
	);
	const contentLines = lines.slice(addRows[0].index + 1, -1);
	invariant(contentLines.length > 0, 'Archived solvability report patch is empty.');
	invariant(
		contentLines.every((line) => line.startsWith('+')),
		'Archived solvability report patch is not a complete add-file patch.'
	);
	const bytes = Buffer.from(`${contentLines.map((line) => line.slice(1)).join('\n')}\n`, 'utf8');
	let report;
	try {
		report = JSON.parse(bytes.toString('utf8'));
	} catch (error) {
		throw new Error(`Recovered solvability report is not valid JSON: ${error.message}`, {
			cause: error
		});
	}
	return {
		addedPath,
		bytes,
		sha256: sha256Bytes(bytes),
		report,
		toolCallId: calls[0].payload.call_id ?? null
	};
}

function blockingFindings(value) {
	return Array.isArray(value)
		? value.filter((finding) => String(finding?.severity ?? '').toLowerCase() === 'blocking')
		: [];
}

export function validateRecoveredSolvabilityReport({ report, sourceDocumentId, expectedRefs }) {
	exactKeys(report, REPORT_KEYS, 'Recovered solvability report');
	invariant(report.status === 'passed', 'Recovered solvability report did not pass.');
	invariant(report.sourceDocumentId === sourceDocumentId, 'Recovered report source id mismatch.');
	const minScore = Number(report.minScore);
	invariant(
		Number.isFinite(minScore) && minScore >= 0.8 && minScore <= 1,
		'Recovered minimum score is invalid.'
	);
	invariant(
		Array.isArray(expectedRefs) && expectedRefs.length > 0,
		'Expected question refs are missing.'
	);
	invariant(Array.isArray(report.results), 'Recovered solvability results are missing.');
	invariant(
		report.results.length === expectedRefs.length,
		'Recovered solvability result count mismatch.'
	);
	invariant(
		Number(report.questionCount) === expectedRefs.length,
		'Recovered report question count mismatch.'
	);
	invariant(
		Number(report.passed) === expectedRefs.length,
		'Recovered report did not pass every question.'
	);
	invariant(Number(report.failed) === 0, 'Recovered report contains failed questions.');
	const resultRefs = report.results.map((result) => String(result?.sourceQuestionRef ?? ''));
	invariant(
		new Set(resultRefs).size === resultRefs.length,
		'Recovered report contains duplicate refs.'
	);
	invariant(
		resultRefs.every((ref, index) => ref === expectedRefs[index]),
		'Recovered report refs or ref order do not match live D1.'
	);
	for (const result of report.results) {
		const ref = String(result?.sourceQuestionRef ?? 'unknown');
		exactKeys(result, RESULT_KEYS, `Recovered solvability result ${ref}`);
		invariant(result.status === 'passed', `${ref} did not pass recovered solvability.`);
		const score = Number(result.score);
		invariant(
			Number.isFinite(score) && score >= minScore && score <= 1,
			`${ref} has an invalid score.`
		);
		invariant(result.studentVisibleSolvable === true, `${ref} is not learner-visible solvable.`);
		invariant(result.markSchemeFits === true, `${ref} does not fit the mark scheme.`);
		invariant(Array.isArray(result.missingContext), `${ref} missingContext is malformed.`);
		invariant(Array.isArray(result.renderFindings), `${ref} renderFindings is malformed.`);
		invariant(Array.isArray(result.requiredRepairs), `${ref} requiredRepairs is malformed.`);
		invariant(result.requiredRepairs.length === 0, `${ref} still has required repairs.`);
		invariant(
			blockingFindings(result.missingContext).length === 0 &&
				blockingFindings(result.renderFindings).length === 0,
			`${ref} still has blocking findings.`
		);
		invariant(String(result.rationale ?? '').trim(), `${ref} has no solvability rationale.`);
	}
	invariant(
		String(report.rationale ?? '').trim(),
		'Recovered solvability report has no rationale.'
	);
	return {
		status: 'passed',
		questionCount: expectedRefs.length,
		passed: expectedRefs.length,
		failed: 0,
		minScore
	};
}

export function validateRecoveredPaperEvidence({ recoveredPaper, policy }) {
	invariant(
		recoveredPaper?.status === 'passed',
		`${policy.sourceDocumentId} recovery did not pass.`
	);
	invariant(
		recoveredPaper.sourceDocumentId === policy.sourceDocumentId,
		`${policy.sourceDocumentId} recovery source id mismatch.`
	);
	invariant(
		recoveredPaper.import?.status === 'passed',
		`${policy.sourceDocumentId} import did not pass.`
	);
	invariant(
		recoveredPaper.import?.mode === 'write',
		`${policy.sourceDocumentId} was not a write import.`
	);
	invariant(
		Number(recoveredPaper.import?.droppedQuestions) === 0,
		`${policy.sourceDocumentId} dropped questions.`
	);
	invariant(
		Number(recoveredPaper.import?.questions) === policy.expectedQuestionCount,
		`${policy.sourceDocumentId} recovered question count mismatch.`
	);
	invariant(
		Number(recoveredPaper.import?.marks) === policy.expectedMarkTotal,
		`${policy.sourceDocumentId} recovered mark total mismatch.`
	);
	for (const phaseName of RECOVERED_PHASE_NAMES) {
		invariant(
			recoveredPaper.phases?.[phaseName],
			`${policy.sourceDocumentId} is missing ${phaseName} evidence.`
		);
	}
	return true;
}

export function validateLivePaperState({
	sourceDocumentId,
	questionRows,
	expectedQuestionCount,
	expectedMarkTotal
}) {
	invariant(Array.isArray(questionRows), `${sourceDocumentId} live question rows are missing.`);
	invariant(
		questionRows.length === expectedQuestionCount,
		`${sourceDocumentId} live question count mismatch.`
	);
	const refs = questionRows.map((row) => String(row.source_question_ref ?? '').trim());
	invariant(refs.every(Boolean), `${sourceDocumentId} has an empty live question ref.`);
	invariant(
		new Set(refs).size === refs.length,
		`${sourceDocumentId} has duplicate live question refs.`
	);
	let marks = 0;
	const overlayVersions = new Set();
	for (const row of questionRows) {
		const ref = String(row.source_question_ref);
		const mark = Number(row.marks);
		invariant(Number.isInteger(mark) && mark > 0, `${sourceDocumentId} ${ref} has invalid marks.`);
		marks += mark;
		invariant(row.status === 'published', `${sourceDocumentId} ${ref} is not published.`);
		invariant(Number(row.needs_human_review) === 0, `${sourceDocumentId} ${ref} needs review.`);
		invariant(
			row.overlay_id && row.overlay_version,
			`${sourceDocumentId} ${ref} has no reviewed overlay.`
		);
		invariant(
			Number(row.overlay_needs_human_review) === 0,
			`${sourceDocumentId} ${ref} overlay needs review.`
		);
		let render;
		try {
			render = JSON.parse(String(row.render_json ?? ''));
		} catch (error) {
			throw new Error(`${sourceDocumentId} ${ref} has invalid overlay JSON: ${error.message}`, {
				cause: error
			});
		}
		const responseKind = String(render?.response?.kind ?? '');
		invariant(responseKind, `${sourceDocumentId} ${ref} overlay has no response kind.`);
		invariant(
			!isUnsupportedPaperSittingResponseKind(responseKind),
			`${sourceDocumentId} ${ref} uses unsupported full-paper response kind ${responseKind}.`
		);
		const gradeableMarks = estimateOfficialGradeableMarks({
			maxMarks: mark,
			markScheme: [{ marks: Number(row.mark_scheme_mark_total) }],
			checklist: Array.from({ length: Number(row.required_checklist_count) }, () => ({
				required: true
			})),
			answerKeys: []
		});
		invariant(
			gradeableMarks >= mark,
			`${sourceDocumentId} ${ref} has grading evidence for only ${gradeableMarks} of ${mark} marks.`
		);
		overlayVersions.add(String(row.overlay_version));
		for (const [field, label] of [
			['mark_scheme_count', 'mark-scheme rows'],
			['checklist_count', 'mark-checklist rows']
		]) {
			invariant(Number(row[field]) > 0, `${sourceDocumentId} ${ref} has no ${label}.`);
		}
		if (responseKind === 'choice') {
			invariant(
				Array.isArray(render.response.options) && render.response.options.length >= 2,
				`${sourceDocumentId} ${ref} choice overlay has too few options.`
			);
			invariant(
				render.response.correctAnswers && typeof render.response.correctAnswers === 'object',
				`${sourceDocumentId} ${ref} choice overlay has no answer key.`
			);
		} else if (responseKind === 'equation-blanks') {
			invariant(
				Array.isArray(render.response.segments) &&
					render.response.segments.some((segment) => segment?.kind === 'blank'),
				`${sourceDocumentId} ${ref} equation overlay has no answer blanks.`
			);
			invariant(
				render.response.correctAnswers && typeof render.response.correctAnswers === 'object',
				`${sourceDocumentId} ${ref} equation overlay has no answer key.`
			);
		} else if (responseKind === 'asset-canvas') {
			invariant(
				String(render.response.assetId ?? '').trim(),
				`${sourceDocumentId} ${ref} asset canvas is missing its response target.`
			);
		} else {
			invariant(
				Number(row.model_answer_count) > 0,
				`${sourceDocumentId} ${ref} has no reviewed model answer.`
			);
		}
		invariant(
			Number(row.primary_chain_count) === 1,
			`${sourceDocumentId} ${ref} must have exactly one clean primary chain.`
		);
		for (const [field, label] of [
			['checklist_review_issues', 'mark-checklist review issues'],
			['model_answer_review_issues', 'model-answer review issues'],
			['asset_review_issues', 'asset review issues'],
			['missing_asset_delivery', 'undelivered assets']
		]) {
			invariant(Number(row[field]) === 0, `${sourceDocumentId} ${ref} has ${label}.`);
		}
	}
	invariant(marks === expectedMarkTotal, `${sourceDocumentId} live mark total mismatch.`);
	invariant(
		overlayVersions.size === 1,
		`${sourceDocumentId} does not use one reviewed overlay version.`
	);
	return {
		status: 'passed',
		questionCount: questionRows.length,
		markTotal: marks,
		refs,
		refsSha256: sha256Bytes(Buffer.from(`${JSON.stringify(refs)}\n`, 'utf8')),
		overlayVersion: [...overlayVersions][0]
	};
}

export function findUniqueRolloutPath(sessionsRoot, fileName) {
	const matches = [];
	const visit = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const candidate = path.join(directory, entry.name);
			if (entry.isDirectory()) visit(candidate);
			else if (entry.isFile() && entry.name === fileName) matches.push(candidate);
		}
	};
	invariant(
		statSync(sessionsRoot).isDirectory(),
		`Sessions root is not a directory: ${sessionsRoot}`
	);
	visit(sessionsRoot);
	invariant(
		matches.length === 1,
		`Expected one archived rollout named ${fileName}; found ${matches.length}.`
	);
	return matches[0];
}

export function verifyRecoveredPaperRollouts({ recoveredPaper, sessionsRoot }) {
	const phases = {};
	for (const phaseName of RECOVERED_PHASE_NAMES) {
		const phaseEvidence = recoveredPaper.phases[phaseName];
		const rolloutPath = findUniqueRolloutPath(sessionsRoot, phaseEvidence.rollout.fileName);
		const rolloutBytes = readFileSync(rolloutPath);
		phases[phaseName] = validateArchivedPhaseRollout({
			phaseName,
			phaseEvidence,
			rolloutPath,
			rolloutBytes
		});
	}
	return phases;
}
