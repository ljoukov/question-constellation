#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
	DEFAULT_EXTRACTION_MODEL,
	DEFAULT_THINKING_LEVEL,
	FullPaperExtractionSchema,
	blockingIssues,
	deterministicCandidateIssues,
	judgeQuestionSolvability,
	readJson,
	setupLlmEnv,
	writeJson
} from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const inputPath = stringArg('input', '');
const inputRoot = stringArg('input-root', 'data/vision-extracted');
const outputPath = path.resolve(
	rootDir,
	stringArg('output', 'tmp/extracted-question-data-audit.json')
);
const paperArg = stringArg('paper', '');
const questionArg = stringArg('question', '');
const subjectArg = stringArg('subject', 'all').toLowerCase();
const model = stringArg('model', DEFAULT_EXTRACTION_MODEL);
const thinkingLevel = stringArg('thinking-level', DEFAULT_THINKING_LEVEL);
const minSolvabilityScore = numberArg('min-solvability-score', 0.8);
const maxQuestions = optionalIntegerArg('max-questions');
const recursive = !hasArg('no-recursive');
const dryRun = hasArg('dry-run');
const noFail = hasArg('no-fail');
const failOnWarnings = hasArg('fail-on-warnings');
const runSolvability = hasArg('run-solvability');
const includeMechanicalFailures = hasArg('include-mechanical-failures');
const continueOnError = hasArg('continue-on-error');
const skipImages = hasArg('skip-images');
const includePriorContext = !hasArg('target-only');
const llmTimeoutMs = optionalIntegerArg('llm-timeout-ms');
const llmMaxAttempts = optionalIntegerArg('llm-max-attempts');
const consoleFormat = stringArg('format', 'summary');
const summaryLimit = integerArg('summary-limit', 12, 0);
const concurrency = integerArg('concurrency', 1, 1);

if (!['summary', 'json'].includes(consoleFormat)) {
	throw new Error('--format must be summary or json.');
}

if (llmTimeoutMs) process.env.EXTRACTION_LLM_TIMEOUT_MS = String(llmTimeoutMs);
if (llmMaxAttempts) process.env.EXTRACTION_LLM_MAX_ATTEMPTS = String(llmMaxAttempts);
if (runSolvability && !dryRun) setupLlmEnv();

const files = selectInputFiles();
if (files.length === 0) throw new Error('No extracted paper JSON files matched the selection.');

const fileReports = files.map(auditFile);
let plannedSolvabilityChecks = planSolvabilityChecks();
if (maxQuestions) plannedSolvabilityChecks = plannedSolvabilityChecks.slice(0, maxQuestions);

const solvabilityResults = [];
writeSummary(runSolvability && !dryRun ? 'running' : null);

if (dryRun) {
	writeSummary('dry-run');
	printSummary('dry-run');
	process.exit(0);
}

if (runSolvability) {
	await runSolvabilityChecks();
}

const finalStatus = overallStatus();
writeSummary(finalStatus);
printSummary(finalStatus);
if (!noFail && finalStatus === 'failed') process.exit(1);

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function numberArg(name, defaultValue) {
	const raw = stringArg(name, '');
	if (!raw) return defaultValue;
	const value = Number(raw);
	if (!Number.isFinite(value)) throw new Error(`--${name} must be a number.`);
	return value;
}

function optionalIntegerArg(name) {
	const raw = stringArg(name, '');
	if (!raw) return null;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`--${name} must be a positive integer.`);
	}
	return value;
}

function integerArg(name, defaultValue, minValue) {
	const raw = stringArg(name, '');
	if (!raw) return defaultValue;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer >= ${minValue}.`);
	}
	return value;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function walkJsonFiles(dir) {
	const out = [];
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir)) {
		const filePath = path.join(dir, name);
		const stat = statSync(filePath);
		if (stat.isDirectory()) {
			if (recursive) out.push(...walkJsonFiles(filePath));
		} else if (name.endsWith('.json')) {
			out.push(filePath);
		}
	}
	return out.sort();
}

function selectInputFiles() {
	const candidates = inputPath
		? [path.resolve(rootDir, inputPath)]
		: walkJsonFiles(path.resolve(rootDir, inputRoot));
	return candidates.filter((filePath) => {
		if (!paperArg && subjectArg === 'all') return true;
		try {
			const candidate = readJson(filePath);
			const sourceDocumentId = sourceDocumentIdFor(candidate, filePath);
			const subject = String(
				candidate.sourceDocument?.subjectArea ??
					candidate.sourceDocument?.subject ??
					path.basename(path.dirname(filePath))
			).toLowerCase();
			const paperMatches =
				!paperArg || sourceDocumentId === paperArg || sourceDocumentId.includes(paperArg);
			const subjectMatches = subjectArg === 'all' || subject === subjectArg;
			return paperMatches && subjectMatches;
		} catch {
			return !paperArg && subjectArg === 'all';
		}
	});
}

function auditFile(filePath) {
	let candidate = null;
	const errors = [];
	const warnings = [];
	try {
		candidate = readJson(filePath);
	} catch (error) {
		errors.push({
			severity: 'error',
			code: 'json_parse_failed',
			field: '',
			message: error instanceof Error ? error.message : String(error)
		});
		return fileReport(filePath, candidate, errors, warnings);
	}

	const schemaResult = FullPaperExtractionSchema.safeParse(candidate);
	if (!schemaResult.success) {
		for (const issue of schemaResult.error.issues.slice(0, 50)) {
			errors.push({
				severity: 'error',
				code: 'schema_invalid',
				field: issue.path.join('.'),
				message: issue.message
			});
		}
	}

	if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
		const deterministicFindings = deterministicCandidateIssues(candidate);
		errors.push(...blockingIssues(deterministicFindings).map(normalizeIssue));
		warnings.push(...warningIssues(deterministicFindings));

		for (const issue of structuralIssues(candidate, filePath)) {
			if (issue.severity === 'error') errors.push(issue);
			else warnings.push(issue);
		}
	}

	return fileReport(filePath, candidate, errors, warnings);
}

function fileReport(filePath, candidate, errors, warnings) {
	return {
		file: relative(filePath),
		sourceDocumentId: candidate ? sourceDocumentIdFor(candidate, filePath) : null,
		subject:
			candidate?.sourceDocument?.subjectArea ??
			candidate?.sourceDocument?.subject ??
			path.basename(path.dirname(filePath)),
		questionCount: candidate?.questions?.length ?? 0,
		status: errors.length > 0 || (failOnWarnings && warnings.length > 0) ? 'failed' : 'passed',
		errors,
		warnings
	};
}

function normalizeIssue(issue) {
	return {
		severity: issue.severity ?? 'error',
		code: issue.code,
		field: issue.field,
		sourceQuestionRef: issue.sourceQuestionRef ?? null,
		evidence: issue.evidence,
		message: issue.message
	};
}

function warningIssues(findings) {
	return findings.flatMap((finding) =>
		finding.issues
			.filter((issue) => issue.severity === 'warning')
			.map((issue) =>
				normalizeIssue({
					...issue,
					sourceQuestionRef: finding.sourceQuestionRef
				})
			)
	);
}

function structuralIssues(candidate, filePath) {
	const issues = [];
	const sourceDocumentId = sourceDocumentIdFor(candidate, filePath);
	if (!candidate.sourceDocument?.id) {
		issues.push(error('source_document_missing_id', 'sourceDocument.id', null));
	}
	if (
		candidate.sourceDocumentId &&
		candidate.sourceDocument?.id &&
		candidate.sourceDocumentId !== candidate.sourceDocument.id
	) {
		issues.push(
			error(
				'source_document_id_mismatch',
				'sourceDocumentId',
				`${candidate.sourceDocumentId} != ${candidate.sourceDocument.id}`
			)
		);
	}
	for (const [field, document] of [
		['sourceDocument', candidate.sourceDocument],
		['markSchemeDocument', candidate.markSchemeDocument]
	]) {
		if (!document?.filePath) {
			issues.push(error(`${field}_missing_file_path`, `${field}.filePath`, null));
		} else if (!localPathExists(document.filePath)) {
			issues.push(error(`${field}_missing_local_file`, `${field}.filePath`, document.filePath));
		}
		if (!String(document?.fileHash ?? '').trim()) {
			issues.push(error(`${field}_missing_file_hash`, `${field}.fileHash`, null));
		}
	}

	const refs = new Map();
	for (const question of candidate.questions ?? []) {
		const ref = question.sourceQuestionRef ?? '';
		if (refs.has(ref)) {
			issues.push(
				error('duplicate_source_question_ref', 'questions.sourceQuestionRef', ref, ref)
			);
		}
		refs.set(ref, true);

		const pageStart = Number(question.pageStart);
		const pageEnd = Number(question.pageEnd);
		const pageCount = Number(candidate.sourceDocument?.pageCount);
		if (!Number.isFinite(pageStart) || !Number.isFinite(pageEnd) || pageStart < 1 || pageEnd < pageStart) {
			issues.push(
				error(
					'invalid_question_page_span',
					'questions.pageStart/pageEnd',
					`${question.pageStart}-${question.pageEnd}`,
					ref
				)
			);
		} else if (Number.isFinite(pageCount) && pageEnd > pageCount) {
			issues.push(
				error(
					'question_page_span_out_of_range',
					'questions.pageEnd',
					`${pageEnd} > ${pageCount}`,
					ref
				)
			);
		}

		for (const [index, item] of (question.markSchemeItems ?? []).entries()) {
			if (!String(item?.sourceRef ?? '').trim()) {
				issues.push(
					error(
						'mark_scheme_item_missing_source_ref',
						`questions[${ref}].markSchemeItems[${index}].sourceRef`,
						item?.text ?? '',
						ref
					)
				);
			}
		}

		for (const [index, asset] of (question.assets ?? []).entries()) {
			const assetPath = localAssetPath(asset);
			if (!assetPath) {
				const label = assetLabel(asset);
				const requiredLabels = requiredAssetLabels(question);
				const isRequired = label && requiredLabels.some((required) => assetMatchesLabel(asset, required));
				const issue = assetHasConcreteSibling(question.assets ?? [], asset)
					? warning(
							'asset_label_only_duplicate_review',
							`questions[${ref}].assets[${index}]`,
							label,
							ref
						)
					: !isRequired
						? warning(
								'asset_label_only_unreferenced_review',
								`questions[${ref}].assets[${index}]`,
								label,
								ref
							)
						: error(
								'asset_missing_local_reference',
								`questions[${ref}].assets[${index}]`,
								label,
								ref
							);
				issues.push(issue);
			} else if (!localPathExists(assetPath)) {
				issues.push(
					error(
						'asset_missing_local_file',
						`questions[${ref}].assets[${index}].filePath`,
						assetPath,
						ref
					)
				);
			}
		}

		for (const { field, block } of questionRenderBlocks(question)) {
			const blockPath = localAssetPath(block);
			if (blockPath && !localPathExists(blockPath)) {
				issues.push(
					error('media_block_missing_local_file', `questions[${ref}].${field}`, blockPath, ref)
				);
			}
		}

		if (Number(question.marks ?? 0) > 0 && !hasUsableGradingEvidence(question)) {
			issues.push(
				error(
					'question_missing_grading_evidence',
					'questions.markSchemeItems/markChecklist/modelAnswer/response.correctAnswers/answerChain',
					sourceDocumentId,
					ref
				)
			);
		}

		if (question.needsHumanReview || question.answerChain?.needsHumanReview) {
			issues.push(
				warning(
					'question_needs_human_review',
					'questions.needsHumanReview',
					question.reviewNotes?.join('; ') ?? '',
					ref
				)
			);
		}
	}
	return issues;
}

function sourceDocumentIdFor(candidate, filePath) {
	return (
		candidate?.sourceDocument?.id ??
		candidate?.sourceDocumentId ??
		path.basename(filePath ?? '', '.json')
	);
}

function localPathExists(value) {
	const filePath = path.isAbsolute(value) ? value : path.resolve(rootDir, value);
	return existsSync(filePath);
}

function localAssetPath(value) {
	for (const key of ['filePath', 'localPath', 'path', 'sourcePath']) {
		const candidate = value?.[key];
		if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
	}
	return null;
}

function assetLabel(asset) {
	return asset?.sourceLabel ?? asset?.label ?? asset?.assetLabel ?? asset?.assetId ?? null;
}

function normalizeAssetKey(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function assetMatchesLabel(asset, label) {
	const wanted = normalizeAssetKey(label);
	if (!wanted) return false;
	return [
		asset?.sourceLabel,
		asset?.label,
		asset?.assetLabel,
		asset?.altText,
		asset?.id,
		asset?.assetId,
		asset?.filePath,
		asset?.publicPath
	].some((value) => {
		const normalized = normalizeAssetKey(value);
		return (
			normalized.length > 0 &&
			(normalized === wanted || normalized.includes(wanted) || wanted.includes(normalized))
		);
	});
}

function assetHasConcreteSibling(assets, asset) {
	const label = assetLabel(asset);
	if (!label) return false;
	return assets.some((candidate) => {
		if (candidate === asset) return false;
		const candidatePath = localAssetPath(candidate);
		return candidatePath && localPathExists(candidatePath) && assetMatchesLabel(candidate, label);
	});
}

function requiredAssetLabels(question) {
	return [...new Set([...responseAssetLabels(question.response), ...mediaBlockLabels(question)])];
}

function responseAssetLabels(response) {
	if (!response || typeof response !== 'object') return [];
	if (!['asset-canvas', 'image-label-zones'].includes(response.kind)) return [];
	const labels = [
		response.assetLabel,
		response.label,
		response.assetId,
		response.sourceLabel,
		...(Array.isArray(response.assets) ? response.assets : [])
	];
	return labels.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim());
}

function mediaBlockLabels(question) {
	const labels = [];
	for (const { block } of questionRenderBlocks(question)) {
		if (!isMediaRenderBlock(block)) continue;
		const label = assetLabel(block) ?? inferMediaLabelFromQuestionText(question);
		if (label) labels.push(label);
	}
	return labels;
}

function isMediaRenderBlock(block) {
	if (!block || typeof block !== 'object') return false;
	return [
		'figure',
		'image',
		'assetRef',
		'assetReference',
		'imageFigure',
		'imageBlock',
		'figure-placeholder',
		'figure-reference'
	].includes(String(block.kind ?? ''));
}

function inferMediaLabelFromQuestionText(question) {
	const text = [
		question.promptText,
		question.selfContainedPromptText,
		question.contextText,
		...(question.reviewNotes ?? [])
	]
		.filter(Boolean)
		.join('\n');
	const match = text.match(/\b(?:figure|fig\.?|graph|diagram|image)\s+(\d+[A-Za-z]?)\b/i);
	return match ? `Figure ${match[1]}` : null;
}

function questionRenderBlocks(question) {
	return ['stemBlocks', 'leadBlocks', 'promptBlocks', 'afterResponseBlocks'].flatMap((field) =>
		(question[field] ?? []).map((block, index) => ({
			field: `${field}[${index}]`,
			block
		}))
	);
}

function positiveMarkSchemeItem(item) {
	const itemType = String(item?.itemType ?? '')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.toLowerCase()
		.replace(/[_-]+/g, ' ');
	const text = String(item?.text ?? '').toLowerCase();
	const source = `${itemType}\n${text}`;
	if (
		/\b(?:withdraw|withdrawn|statistics?|mean mark|max(?:imum)? mark|notice)\b/.test(source) ||
		/\b(?:rubric|guidance|ignore|reject|do not accept|do not credit)\b/.test(
			itemType
		)
	) {
		return false;
	}
	if (
		/\b(?:allow|accept|alternative)\b/.test(itemType) &&
		!/\b(?:credit|marking point|answer|alternative marking point|allowance|acceptable|award|positive)\b/.test(
			itemType
		)
	) {
		return false;
	}
	return /\b(?:marking point|answer|credit|mark|method|calculation|point|indicative content|level|max|allowance|acceptable|award|positive)\b/.test(
		itemType
	);
}

function responseCorrectAnswerCount(response) {
	const answers = response?.correctAnswers;
	if (!answers) return 0;
	if (Array.isArray(answers)) {
		return answers.filter((answer) => String(answer?.correctAnswer ?? '').trim()).length;
	}
	if (typeof answers === 'object') {
		return Object.values(answers)
			.flatMap((answer) => (Array.isArray(answer) ? answer : [answer]))
			.filter((answer) => String(answer ?? '').trim()).length;
	}
	return 0;
}

function hasUsableGradingEvidence(question) {
	const markSchemeItems = question.markSchemeItems ?? [];
	const hasPositiveMarkRows = markSchemeItems.some(positiveMarkSchemeItem);
	const hasChecklist = (question.markChecklist ?? []).some((item) => String(item?.text ?? '').trim());
	const hasModelAnswer = String(question.modelAnswer?.answerText ?? '').trim().length > 0;
	const hasAnswerKeys = responseCorrectAnswerCount(question.response) > 0;
	const hasChainEvidence = (question.answerChain?.steps ?? []).some((step) =>
		(step.markSchemeItemIndexes ?? []).some((itemIndex) =>
			positiveMarkSchemeItem(markSchemeItems[itemIndex])
		)
	);
	return hasPositiveMarkRows || hasChecklist || hasModelAnswer || hasAnswerKeys || hasChainEvidence;
}

function error(code, field, evidence, sourceQuestionRef = null) {
	return {
		severity: 'error',
		code,
		field,
		sourceQuestionRef,
		evidence,
		message: auditMessage(code)
	};
}

function warning(code, field, evidence, sourceQuestionRef = null) {
	return {
		severity: 'warning',
		code,
		field,
		sourceQuestionRef,
		evidence,
		message: auditMessage(code)
	};
}

function auditMessage(code) {
	const messages = {
		source_document_missing_id: 'Extraction artifact is missing a stable source document id.',
		source_document_id_mismatch:
			'Top-level sourceDocumentId and sourceDocument.id disagree; imports need one stable id.',
		sourceDocument_missing_file_path: 'Source question-paper provenance must include a local file path.',
		markSchemeDocument_missing_file_path: 'Mark-scheme provenance must include a local file path.',
		sourceDocument_missing_local_file: 'Source question-paper file path does not exist locally.',
		markSchemeDocument_missing_local_file: 'Mark-scheme file path does not exist locally.',
		sourceDocument_missing_file_hash: 'Source question-paper provenance must include a file hash.',
		markSchemeDocument_missing_file_hash: 'Mark-scheme provenance must include a file hash.',
		duplicate_source_question_ref: 'A paper cannot contain duplicate atomic question refs.',
		invalid_question_page_span: 'Question page span must be a valid inclusive page range.',
		question_page_span_out_of_range: 'Question page span exceeds the source paper page count.',
		mark_scheme_item_missing_source_ref:
			'Every mark-scheme item needs a source reference for audit and official-source linking.',
		asset_missing_local_file: 'Extracted media asset filePath points to a missing local file.',
		asset_missing_local_reference:
			'Extracted media assets need a local filePath/localPath/path/sourcePath before import or upload.',
		asset_label_only_duplicate_review:
			'A label-only media asset is backed by another concrete asset; review and remove stale duplicates when cleaning data.',
		media_asset_page_label_mismatch:
			'Media asset pageNumber does not appear to contain the referenced figure label in the source PDF.',
		media_block_missing_local_file: 'A render block media file path points to a missing local file.',
		question_missing_grading_evidence:
			'Published marked questions need mark rows, checklist rows, a model answer, answer keys, or reviewed chain evidence.',
		question_needs_human_review: 'Question or chain is marked as needing human review.'
	};
	return messages[code] ?? code;
}

function planSolvabilityChecks() {
	const byFile = new Map(files.map((filePath) => [relative(filePath), filePath]));
	const planned = [];
	for (const report of fileReports) {
		const questionErrorRefs = new Set(
			report.errors.map((issue) => issue.sourceQuestionRef).filter(Boolean)
		);
		const hasFileLevelErrors = report.errors.some((issue) => !issue.sourceQuestionRef);
		if (hasFileLevelErrors && !includeMechanicalFailures) continue;
		const filePath = byFile.get(report.file);
		if (!filePath) continue;
		let candidate = null;
		try {
			candidate = readJson(filePath);
		} catch {
			continue;
		}
		for (const question of candidate.questions ?? []) {
			if (questionArg && question.sourceQuestionRef !== questionArg) continue;
			if (
				!includeMechanicalFailures &&
				questionErrorRefs.has(question.sourceQuestionRef)
			) {
				continue;
			}
			planned.push({
				filePath,
				candidate,
				sourceDocumentId: sourceDocumentIdFor(candidate, filePath),
				sourceQuestionRef: question.sourceQuestionRef
			});
		}
	}
	return planned;
}

async function runSolvabilityChecks() {
	let nextIndex = 0;
	let stopRequested = false;
	let firstError = null;
	const workerCount = Math.min(concurrency, plannedSolvabilityChecks.length);
	async function worker() {
		while (!stopRequested) {
			const item = plannedSolvabilityChecks[nextIndex];
			nextIndex += 1;
			if (!item) return;
			try {
				console.error(`[audit-solvability] judging ${relative(item.filePath)} ${item.sourceQuestionRef}`);
				const evaluation = await judgeQuestionSolvability({
					candidate: item.candidate,
					sourceQuestionRef: item.sourceQuestionRef,
					model,
					thinkingLevel,
					minJudgeScore: minSolvabilityScore,
					attachImages: !skipImages,
					includePriorContext
				});
				solvabilityResults.push({
					file: relative(item.filePath),
					sourceDocumentId: item.sourceDocumentId,
					...evaluation
				});
				writeSummary('running');
			} catch (error) {
				const result = {
					file: relative(item.filePath),
					sourceDocumentId: item.sourceDocumentId,
					sourceQuestionRef: item.sourceQuestionRef,
					status: 'failed',
					error: error instanceof Error ? error.message : String(error)
				};
				solvabilityResults.push(result);
				writeSummary('failed');
				firstError ??= error;
				if (!continueOnError) stopRequested = true;
			}
		}
	}
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	if (firstError && !continueOnError) throw firstError;
}

function mechanicalStatus() {
	const failed = fileReports.some((report) => report.status === 'failed');
	return failed ? 'failed' : 'passed';
}

function solvabilityStatus() {
	if (!runSolvability) return 'not-run';
	if (solvabilityResults.length < plannedSolvabilityChecks.length) return 'running';
	return solvabilityResults.some((result) => result.status !== 'passed') ? 'failed' : 'passed';
}

function overallStatus() {
	if (mechanicalStatus() === 'failed') return 'failed';
	if (runSolvability && solvabilityStatus() === 'failed') return 'failed';
	return 'passed';
}

function summary(statusOverride = null) {
	const status = statusOverride ?? overallStatus();
	const mechanicalFailures = fileReports.filter((report) => report.status === 'failed');
	const solvabilityFailures = solvabilityResults.filter((result) => result.status !== 'passed');
	const questionCount = fileReports.reduce((sum, report) => sum + report.questionCount, 0);
	return {
		status,
		inputRoot: inputPath ? null : inputRoot,
		input: inputPath || null,
		recursive,
		paper: paperArg || null,
		question: questionArg || null,
		subject: subjectArg,
		mechanical: {
			status: mechanicalStatus(),
			fileCount: fileReports.length,
			questionCount,
			passedFiles: fileReports.filter((report) => report.status === 'passed').length,
			failedFiles: mechanicalFailures.length,
			errorCount: fileReports.reduce((sum, report) => sum + report.errors.length, 0),
			warningCount: fileReports.reduce((sum, report) => sum + report.warnings.length, 0),
			failOnWarnings,
			files: fileReports
		},
		solvability: {
			status: solvabilityStatus(),
			enabled: runSolvability,
			model: runSolvability ? model : null,
			thinkingLevel: runSolvability ? thinkingLevel : null,
			minSolvabilityScore: runSolvability ? minSolvabilityScore : null,
			concurrency: runSolvability ? concurrency : null,
			includePriorContext,
			attachImages: !skipImages,
			planned: plannedSolvabilityChecks.length,
			completed: solvabilityResults.length,
			passed: solvabilityResults.filter((result) => result.status === 'passed').length,
			failed: solvabilityFailures.length,
			results: solvabilityResults
		},
		failures: [
			...mechanicalFailures.flatMap((report) =>
				report.errors.map((issue) => ({
					file: report.file,
					sourceDocumentId: report.sourceDocumentId,
					...issue
				}))
			),
			...solvabilityFailures.map((result) => ({
				file: result.file,
				sourceDocumentId: result.sourceDocumentId,
				sourceQuestionRef: result.sourceQuestionRef,
				code: 'solvability_failed',
				message: result.error ?? result.rationale ?? 'Solvability judge did not pass.'
			}))
		].slice(0, 100)
	};
}

function writeSummary(statusOverride = null) {
	writeJson(outputPath, summary(statusOverride));
}

function issueCounts(issues) {
	const counts = {};
	for (const issue of issues) counts[issue.code] = (counts[issue.code] ?? 0) + 1;
	return counts;
}

function formatIssueCounts(counts) {
	const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	return entries.length ? entries.map(([code, count]) => `${code}:${count}`).join(', ') : 'none';
}

function printSummary(statusOverride = null) {
	const report = summary(statusOverride);
	if (consoleFormat === 'json') {
		console.log(JSON.stringify(report, null, 2));
		return;
	}
	const lines = [
		`extracted-data audit ${report.status}`,
		`full report: ${relative(outputPath)}`,
		`files: ${report.mechanical.fileCount}, questions: ${report.mechanical.questionCount}, passed: ${report.mechanical.passedFiles}, failed: ${report.mechanical.failedFiles}`,
		`mechanical errors: ${report.mechanical.errorCount}, warnings: ${report.mechanical.warningCount}`,
		`solvability: ${report.solvability.status}${report.solvability.enabled ? ` (${report.solvability.completed}/${report.solvability.planned})` : ''}`
	];
	const failedReports = report.mechanical.files.filter((file) => file.status === 'failed');
	if (failedReports.length) {
		lines.push('failed files:');
		for (const file of failedReports.slice(0, summaryLimit)) {
			lines.push(
				`- ${file.file}: errors=${file.errors.length} [${formatIssueCounts(issueCounts(file.errors))}] warnings=${file.warnings.length}`
			);
		}
		if (failedReports.length > summaryLimit) {
			lines.push(`- ... ${failedReports.length - summaryLimit} more failed file(s)`);
		}
	}
	const failures = report.failures.slice(0, summaryLimit);
	if (failures.length) {
		lines.push('sample failures:');
		for (const failure of failures) {
			lines.push(
				`- ${failure.file}${failure.sourceQuestionRef ? ` ${failure.sourceQuestionRef}` : ''}: ${failure.code} (${failure.field ?? 'n/a'})`
			);
		}
		if (report.failures.length > summaryLimit) {
			lines.push(`- ... ${report.failures.length - summaryLimit} more failure(s) in full report`);
		}
	}
	console.log(lines.join('\n'));
}
