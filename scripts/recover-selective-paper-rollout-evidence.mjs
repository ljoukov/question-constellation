#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';
import { collectRecoveredPipelineCommandObservations } from './lib/recovered-extraction-input-evidence.mjs';

const rootDir = process.cwd();
const configPath = requiredPath('config');
const databaseVerificationPath = requiredPath('database-verification');
const outputPath = path.resolve(
	rootDir,
	stringArg('output', 'tmp/current-model-paper-cohort/recovered-rollout-evidence.json')
);
const inputRecoveryOutputPath = path.resolve(
	rootDir,
	stringArg(
		'input-recovery-output',
		'docs/release-evidence/recovered-selective-paper-extraction-input-recovery.json'
	)
);

const config = readJson(configPath);
const sessionRoot = path.resolve(rootDir, String(config?.sessionRoot ?? '.'));
const rolloutEventsByPath = new Map();
const rolloutPathBySessionId = new Map();
const configuredPapers = Array.isArray(config?.papers) ? config.papers : [];
if (configuredPapers.length === 0) throw new Error('Recovery config contains no papers.');
const duplicateIds = duplicates(configuredPapers.map((paper) => paper?.sourceDocumentId));
if (duplicateIds.length > 0) {
	throw new Error(`Recovery config contains duplicate paper ids: ${duplicateIds.join(', ')}.`);
}

const databaseVerification = readJson(databaseVerificationPath);
const databaseRows = new Map(
	(databaseVerification?.rows ?? []).map((row) => [row.sourceDocumentId, row])
);
const recoveredInputs = configuredPapers.map(recoverExtractionInputs);
const inputRecoveryOutput = {
	schemaVersion: 'codex-recovered-extraction-input-recovery-v1',
	status: recoveredInputs.every((paper) => paper.status === 'passed') ? 'passed' : 'failed',
	basis:
		'Exact production pipeline commands were recovered from archived parent-operator rollout JSONL without rerunning a model phase. Current local QP, mark-scheme, and deduplicated supporting-PDF bytes are content-addressed below.',
	config: artifact(configPath),
	counts: {
		papers: recoveredInputs.length,
		questionPapers: recoveredInputs.length,
		markSchemes: recoveredInputs.length,
		supportingDocuments: sum(
			recoveredInputs.map((paper) => paper.inputs.supportingDocuments.length)
		)
	},
	papers: recoveredInputs
};
if (inputRecoveryOutput.status !== 'passed') {
	throw new Error('Recovered extraction input evidence did not pass.');
}
writeJson(inputRecoveryOutputPath, inputRecoveryOutput);
const inputRecoveryArtifact = artifact(inputRecoveryOutputPath);
const recoveredInputsById = new Map(
	recoveredInputs.map((paper) => [paper.sourceDocumentId, paper])
);
const papers = configuredPapers.map((spec) =>
	recoverPaper(spec, recoveredInputsById.get(spec.sourceDocumentId), inputRecoveryArtifact)
);
const output = {
	schemaVersion: 'selective-paper-recovered-rollout-evidence-v1',
	generatedAt: new Date().toISOString(),
	status: papers.every((paper) => paper.status === 'passed') ? 'passed' : 'failed',
	basis:
		'Surviving Codex rollout logs prove each current-model phase; an exact remote D1 verification proves the write inventory after the transient workdir was deleted. No model phase was rerun and no missing import-ready artifact is reconstructed.',
	config: artifact(configPath),
	databaseVerification: artifact(databaseVerificationPath),
	counts: {
		papers: papers.length,
		passed: papers.filter((paper) => paper.status === 'passed').length,
		failed: papers.filter((paper) => paper.status !== 'passed').length,
		questions: sum(papers.map((paper) => paper.import.questions)),
		marks: sum(papers.map((paper) => paper.import.marks))
	},
	papers
};

if (output.status !== 'passed') {
	throw new Error(
		`Recovered rollout evidence failed: ${papers
			.filter((paper) => paper.status !== 'passed')
			.map((paper) => paper.sourceDocumentId)
			.join(', ')}`
	);
}

writeJson(outputPath, output);
console.log(
	JSON.stringify(
		{
			status: output.status,
			output: relative(outputPath),
			sha256: fileSha256(outputPath),
			inputRecoveryArtifact,
			counts: output.counts
		},
		null,
		2
	)
);

function recoverPaper(spec, recoveredInput, inputRecoveryArtifact) {
	const sourceDocumentId = String(spec?.sourceDocumentId ?? '').trim();
	if (!sourceDocumentId) throw new Error('Recovery paper has no sourceDocumentId.');
	const database = databaseRows.get(sourceDocumentId);
	if (!database) throw new Error(`${sourceDocumentId}: D1 verification row is missing.`);
	const expectedQuestions = positiveInteger(spec?.questions, `${sourceDocumentId} questions`);
	const expectedMarks = positiveInteger(spec?.marks, `${sourceDocumentId} marks`);
	const databaseMatched =
		Number(database.questions) === expectedQuestions &&
		Number(database.distinctRefs) === expectedQuestions &&
		Number(database.marks) === expectedMarks &&
		Number(database.missingEvidence) === 0;
	if (!databaseMatched) {
		throw new Error(`${sourceDocumentId}: recovered expectations do not match clean D1 rows.`);
	}

	const phases = {};
	for (const phaseName of ['extraction', 'extractionJudge', 'answerChains', 'solvability']) {
		phases[phaseName] = recoverPhase(sourceDocumentId, phaseName, spec?.phases?.[phaseName]);
	}
	if (!recoveredInput || recoveredInput.sourceDocumentId !== sourceDocumentId) {
		throw new Error(`${sourceDocumentId}: recovered extraction input evidence is missing.`);
	}
	if (
		phases.extraction.rollout.sessionId !== recoveredInput.extractionRollout.sessionId ||
		phases.extraction.rollout.sha256 !== recoveredInput.extractionRollout.sha256
	) {
		throw new Error(`${sourceDocumentId}: recovered command does not bind to extraction rollout.`);
	}
	phases.extraction.inputAttestation = {
		schemaVersion: 'codex-recovered-extraction-inputs-v1',
		status: 'passed',
		sourceDocumentId,
		rollout: {
			sessionId: phases.extraction.rollout.sessionId,
			sha256: phases.extraction.rollout.sha256
		},
		recoveryArtifact: inputRecoveryArtifact,
		inputs: recoveredInput.inputs
	};
	const status = Object.values(phases).every(
		(phase) =>
			['passed', 'passed_after_reviewed_source_closure'].includes(phase.status) &&
			phase.run.status === 'passed'
	)
		? 'passed'
		: 'failed';
	return {
		sourceDocumentId,
		status,
		basis:
			'Phase evidence recovered from immutable rollout JSONL; import evidence matched against the live D1 row set.',
		recoveredAt: new Date().toISOString(),
		production: {
			status: 'passed',
			importMode: 'write',
			keptQuestions: expectedQuestions,
			droppedQuestions: 0,
			evidence: spec?.productionEvidence ?? null,
			databaseVerifiedAt: database.verifiedAt ?? databaseVerification.verifiedAt ?? null
		},
		phases,
		import: {
			status: 'passed',
			mode: 'write',
			questions: expectedQuestions,
			marks: expectedMarks,
			droppedQuestions: 0,
			artifact: {
				status: 'not-reconstructed',
				reason:
					'The transient canonical workdir was deleted; live D1 rows and archived phase rollouts are retained instead of fabricating a replacement artifact.'
			}
		},
		database: {
			status: 'matched',
			verifiedAt: database.verifiedAt ?? databaseVerification.verifiedAt ?? null,
			questions: Number(database.questions),
			marks: Number(database.marks),
			distinctRefs: Number(database.distinctRefs),
			missingEvidence: Number(database.missingEvidence)
		}
	};
}

function recoverExtractionInputs(spec) {
	const sourceDocumentId = String(spec?.sourceDocumentId ?? '').trim();
	if (!sourceDocumentId) throw new Error('Recovery paper has no sourceDocumentId.');
	const parentSessionId = String(spec?.productionEvidence?.archivedOperatorThreadId ?? '').trim();
	if (!parentSessionId) {
		throw new Error(`${sourceDocumentId}: archived parent operator thread id is missing.`);
	}
	const parentRolloutPath = rolloutPathForSession(parentSessionId);
	const parentEvents = readRollout(parentRolloutPath);
	if (
		!parentEvents.some(
			(event) => event.type === 'session_meta' && event.payload?.id === parentSessionId
		)
	) {
		throw new Error(`${sourceDocumentId}: parent operator rollout metadata does not match.`);
	}
	const observations = collectRecoveredPipelineCommandObservations(
		parentEvents,
		sourceDocumentId
	).map((observation) => ({
		...observation,
		canonicalInputs: canonicalizeObservedInputs(sourceDocumentId, observation)
	}));
	if (observations.length === 0) {
		throw new Error(`${sourceDocumentId}: no complete production command observation was found.`);
	}
	const maximumSupportDocumentCount = Math.max(
		...observations.map((observation) => observation.canonicalInputs.supportingDocuments.length)
	);
	const maximalObservations = observations.filter(
		(observation) =>
			observation.canonicalInputs.supportingDocuments.length === maximumSupportDocumentCount
	);
	const maximalSignatures = new Set(
		maximalObservations.map((observation) => JSON.stringify(observation.canonicalInputs))
	);
	if (maximalSignatures.size !== 1) {
		throw new Error(
			`${sourceDocumentId}: maximal recovered command observations disagree on input PDFs.`
		);
	}
	const selected = [...maximalObservations].sort(compareObservations)[0];
	const inputs = {
		questionPaper: artifact(path.resolve(rootDir, selected.canonicalInputs.questionPaper)),
		markScheme: artifact(path.resolve(rootDir, selected.canonicalInputs.markScheme)),
		supportingDocuments: selected.canonicalInputs.supportingDocuments.map((filePath) =>
			artifact(path.resolve(rootDir, filePath))
		)
	};
	const extractionRolloutPath = resolvePhaseRolloutPath(spec?.phases?.extraction);
	const extractionRollout = {
		sessionId: String(spec?.phases?.extraction?.threadId ?? ''),
		fileName: path.basename(extractionRolloutPath),
		sha256: fileSha256(extractionRolloutPath)
	};
	const canonicalInputFlags = [
		`--source-document-id=${sourceDocumentId}`,
		`--question-paper=${inputs.questionPaper.path}`,
		`--mark-scheme=${inputs.markScheme.path}`,
		...inputs.supportingDocuments.map((document) => `--supporting-document=${document.path}`)
	];
	return {
		schemaVersion: 'codex-recovered-extraction-input-row-v1',
		status: 'passed',
		sourceDocumentId,
		extractionRollout,
		parentOperatorRollout: {
			sessionId: parentSessionId,
			fileName: path.basename(parentRolloutPath),
			sha256: fileSha256(parentRolloutPath)
		},
		commandEvidence: {
			observation: {
				lineNumber: selected.lineNumber,
				timestamp: selected.timestamp,
				payloadType: selected.payloadType,
				jsonPath: selected.jsonPath,
				segmentIndex: selected.segmentIndex
			},
			observedCommand: selected.observedCommand,
			observedCommandSha256: textSha256(selected.observedCommand),
			matchingObservationCount: observations.length,
			maximalObservationCount: maximalObservations.length,
			maximumSupportDocumentCount,
			canonicalInputFlags,
			canonicalInputFlagsSha256: textSha256(canonicalInputFlags.join('\n'))
		},
		inputs,
		invariants: {
			uniquePaperRow: true,
			sourceDocumentIdExact: true,
			questionPaperCountExact: true,
			markSchemeCountExact: true,
			supportingDocumentsDeduplicated: true,
			maximalInputSignaturesAgree: true,
			allInputFilesExist: true,
			allInputHashesPresent: true,
			extractionRolloutLinked: true,
			parentOperatorRolloutLinked: true
		}
	};
}

function recoverPhase(sourceDocumentId, phaseName, spec) {
	if (!spec) throw new Error(`${sourceDocumentId}: missing ${phaseName} recovery spec.`);
	const rolloutPath = resolvePhaseRolloutPath(spec);
	const events = readRollout(rolloutPath);
	const sessionMeta = events.find(
		(event) => event.type === 'session_meta' && event.payload?.id === spec.threadId
	);
	if (!sessionMeta) {
		throw new Error(`${sourceDocumentId} ${phaseName}: threadId does not match rollout metadata.`);
	}
	const turnContext = events.find((event) => event.type === 'turn_context');
	const model = turnContext?.payload?.model;
	const thinkingLevel = turnContext?.payload?.effort;
	if (model !== 'gpt-5.6-sol' || thinkingLevel !== 'max') {
		throw new Error(
			`${sourceDocumentId} ${phaseName}: expected gpt-5.6-sol/max, found ${model}/${thinkingLevel}.`
		);
	}
	const taskComplete = [...events]
		.reverse()
		.find((event) => event.type === 'event_msg' && event.payload?.type === 'task_complete');
	if (!taskComplete) throw new Error(`${sourceDocumentId} ${phaseName}: rollout did not complete.`);
	const messages = events
		.filter((event) => event.type === 'event_msg' && event.payload?.type === 'agent_message')
		.map((event) => String(event.payload?.message ?? ''));
	const finalMessage = messages.at(-1) ?? '';
	const expectedPattern = String(spec.expectedMessagePattern ?? '').trim();
	if (!expectedPattern || !new RegExp(expectedPattern, 'is').test(messages.join('\n'))) {
		throw new Error(`${sourceDocumentId} ${phaseName}: expected outcome text was not found.`);
	}
	const tokenCounts = events.filter(
		(event) => event.type === 'event_msg' && event.payload?.type === 'token_count'
	);
	const usage = tokenCounts.at(-1)?.payload?.info?.total_token_usage ?? null;
	const startedAt = sessionMeta.timestamp ?? events[0]?.timestamp ?? null;
	const finishedAt = taskComplete.timestamp ?? events.at(-1)?.timestamp ?? null;
	const durationSeconds =
		startedAt && finishedAt
			? Math.max(0, (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000)
			: null;
	return {
		status: spec.status ?? 'passed',
		modelJudgePass: spec.modelJudgePass ?? null,
		reviewedSourceClosure: spec.reviewedSourceClosure ?? null,
		startedAt,
		finishedAt,
		run: {
			status: 'passed',
			threadId: spec.threadId,
			model,
			thinkingLevel,
			startedAt,
			finishedAt,
			durationSeconds,
			usage
		},
		rollout: {
			fileName: path.basename(rolloutPath),
			sha256: fileSha256(rolloutPath),
			sessionId: spec.threadId
		},
		result: spec.result ?? null,
		recoveryBasis: spec.recoveryBasis ?? 'completed Codex rollout and matched outcome message',
		finalMessage
	};
}

function canonicalizeObservedInputs(sourceDocumentId, observation) {
	return {
		sourceDocumentId,
		questionPaper: canonicalDataPath(
			observation.questionPaper,
			`${sourceDocumentId} question paper`
		),
		markScheme: canonicalDataPath(observation.markScheme, `${sourceDocumentId} mark scheme`),
		supportingDocuments: unique(
			observation.supportingDocuments.map((filePath, index) =>
				canonicalDataPath(filePath, `${sourceDocumentId} supporting document ${index + 1}`)
			)
		)
	};
}

function canonicalDataPath(observedPath, label) {
	const rawPath = String(observedPath ?? '').trim();
	const dataIndex = rawPath.lastIndexOf('/data/');
	const candidate = dataIndex >= 0 ? rawPath.slice(dataIndex + 1) : rawPath;
	const normalized = path.normalize(candidate).split(path.sep).join('/');
	if (!normalized.startsWith('data/') || normalized.includes('/../')) {
		throw new Error(`${label}: recovered path is not a repository data path: ${rawPath}`);
	}
	const absolutePath = path.resolve(rootDir, normalized);
	const dataRoot = `${path.resolve(rootDir, 'data')}${path.sep}`;
	if (!absolutePath.startsWith(dataRoot) || !existsSync(absolutePath)) {
		throw new Error(`${label}: recovered current local file is missing: ${normalized}`);
	}
	return relative(absolutePath);
}

function resolvePhaseRolloutPath(spec) {
	if (!spec) throw new Error('Phase recovery spec is missing.');
	const configuredRollout = String(spec.rollout ?? '');
	const rolloutPath = path.isAbsolute(configuredRollout)
		? configuredRollout
		: path.resolve(sessionRoot, configuredRollout);
	if (!existsSync(rolloutPath)) throw new Error(`Phase rollout does not exist: ${rolloutPath}`);
	return rolloutPath;
}

function rolloutPathForSession(sessionId) {
	if (rolloutPathBySessionId.has(sessionId)) return rolloutPathBySessionId.get(sessionId);
	const matches = readdirSync(sessionRoot)
		.filter((fileName) => fileName.endsWith(`-${sessionId}.jsonl`))
		.map((fileName) => path.join(sessionRoot, fileName));
	if (matches.length !== 1) {
		throw new Error(
			`Expected exactly one rollout for session ${sessionId}, found ${matches.length}.`
		);
	}
	rolloutPathBySessionId.set(sessionId, matches[0]);
	return matches[0];
}

function readRollout(rolloutPath) {
	if (rolloutEventsByPath.has(rolloutPath)) return rolloutEventsByPath.get(rolloutPath);
	const events = readFileSync(rolloutPath, 'utf8')
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line, index) => {
			try {
				return JSON.parse(line);
			} catch {
				throw new Error(`${path.basename(rolloutPath)}:${index + 1} is not valid JSONL.`);
			}
		});
	rolloutEventsByPath.set(rolloutPath, events);
	return events;
}

function compareObservations(left, right) {
	return (
		left.lineNumber - right.lineNumber ||
		left.segmentIndex - right.segmentIndex ||
		left.jsonPath.localeCompare(right.jsonPath) ||
		left.observedCommand.localeCompare(right.observedCommand)
	);
}

function artifact(filePath) {
	return { path: relative(filePath), sha256: fileSha256(filePath) };
}

function positiveInteger(value, label) {
	const number = Number(value);
	if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be positive.`);
	return number;
}

function duplicates(values) {
	const seen = new Set();
	const found = new Set();
	for (const value of values) {
		if (seen.has(value)) found.add(value);
		seen.add(value);
	}
	return [...found];
}

function sum(values) {
	return values.reduce((total, value) => total + Number(value ?? 0), 0);
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function fileSha256(filePath) {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function textSha256(value) {
	return createHash('sha256').update(String(value)).digest('hex');
}

function unique(values) {
	return [...new Set(values)];
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function stringArg(name, fallback = '') {
	const prefix = `--${name}=`;
	const argument = process.argv.find((candidate) => candidate.startsWith(prefix));
	return argument ? argument.slice(prefix.length) : fallback;
}

function requiredPath(name) {
	const value = stringArg(name, '');
	if (!value) throw new Error(`--${name}=<path> is required.`);
	const resolved = path.resolve(rootDir, value);
	if (!existsSync(resolved)) throw new Error(`--${name} does not exist: ${resolved}`);
	return resolved;
}
