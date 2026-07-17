#!/usr/bin/env node

import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
	buildLearnerVisibleQuestionContext,
	readJson,
	writeJson
} from './lib/llm-extraction-pipeline.mjs';
import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import { phaseArtifacts } from './lib/codex-phase-artifacts.mjs';
import {
	assertLearnerVisibleAssetBundleCurrent,
	assertVerifiedLearnerAssetCopiesCurrent,
	remapPaperToVerifiedLearnerAssets,
	stageVerifiedLearnerAssetCopies
} from './lib/learner-visible-asset-binding.mjs';
import {
	assertBoundJsonInputCurrent,
	assertExactJsonArtifactsEqual,
	captureBoundJsonInput,
	stageBoundJsonSnapshot
} from './lib/phase-input-binding.mjs';

const rootDir = process.cwd();
loadDefaultEnv(rootDir);

const usage = `Usage:
node scripts/run-codex-solvability-judge.mjs \\
  --input=<import-ready-or-reconciled-paper.json> \\
  --source-document-id=<stable-source-id>

Optional:
  --work-dir=tmp/codex-solvability/<source-id>
  --output=tmp/codex-solvability/<source-id>/solvability-report.json
  --summary=tmp/codex-solvability/<source-id>/codex-solvability-summary.json
  --question=07.1
  --max-questions=10
  --min-score=0.8
  --model=gpt-5.6-sol
  --thinking-level=max
  --expected-input-sha256=<exact-byte-sha256>
  --expected-input-canonical-json-sha256=<exact-canonical-json-sha256>
  --asset-manifest=<exact-learner-visible-asset-manifest.json>
  --timeout-ms=7200000
  --target-only
  --force
  --dry-run`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const inputPath = path.resolve(rootDir, requiredStringArg('input'));
const sourceDocumentId = requiredStringArg('source-document-id');
const workDir = path.resolve(
	rootDir,
	stringArg('work-dir', path.join('tmp/codex-solvability', sourceDocumentId))
);
const outputPath = path.resolve(
	rootDir,
	stringArg('output', path.join(workDir, 'solvability-report.json'))
);
const summaryPath = path.resolve(
	rootDir,
	stringArg('summary', path.join(workDir, 'codex-solvability-summary.json'))
);
const questionArg = stringArg('question', '');
const maxQuestions = optionalIntegerArg('max-questions');
const minScore = numberArg('min-score', 0.8);
const model = stringArg('model', 'gpt-5.6-sol');
const thinkingLevel = stringArg('thinking-level', 'max');
const timeoutMs = integerArg('timeout-ms', 7_200_000, 1);
const expectedInputSha256 = stringArg('expected-input-sha256', '');
const expectedInputCanonicalJsonSha256 = stringArg('expected-input-canonical-json-sha256', '');
const assetManifestArg = stringArg('asset-manifest', '');
const includePriorContext = !hasArg('target-only');
const dryRun = hasArg('dry-run');
const force = hasArg('force');
const assetCopyPairs = [];
let sourceCandidateSnapshotBinding = null;
let modelCandidateBinding = null;
let contextsBinding = null;
let assetManifestBinding = null;
let verifiedLearnerAssetCopies = null;

if (!existsSync(inputPath)) throw new Error(`Input file does not exist: ${relative(inputPath)}`);

const inputBinding = captureBoundJsonInput(inputPath, {
	rootDir,
	expectedSha256: expectedInputSha256,
	expectedCanonicalJsonSha256: expectedInputCanonicalJsonSha256,
	label: 'Solvability candidate input'
});
const rawCandidate = inputBinding.value;
assetManifestBinding = assetManifestArg
	? captureBoundJsonInput(path.resolve(rootDir, assetManifestArg), {
			rootDir,
			label: 'Solvability learner asset manifest'
		})
	: null;
if (assetManifestBinding) {
	assertLearnerVisibleAssetBundleCurrent({
		paper: rawCandidate,
		manifest: assetManifestBinding.value,
		rootDir
	});
}
let candidate;
let contexts;
const plannedRefs = selectedQuestionRefs(rawCandidate);
if (plannedRefs.length === 0) throw new Error('No questions matched the solvability selection.');

const plan = {
	sourceDocumentId,
	inputPath: relative(inputPath),
	workDir: relative(workDir),
	outputPath: relative(outputPath),
	summaryPath: relative(summaryPath),
	model,
	thinkingLevel,
	minScore,
	includePriorContext,
	question: questionArg || null,
	maxQuestions,
	expectedInputSha256: expectedInputSha256 || null,
	expectedInputCanonicalJsonSha256: expectedInputCanonicalJsonSha256 || null,
	assetManifestPath: assetManifestBinding ? relative(assetManifestBinding.path) : null,
	questionCount: plannedRefs.length,
	plannedRefs
};

if (dryRun) {
	console.log(JSON.stringify({ status: 'dry-run', plan }, null, 2));
	process.exit(0);
}

prepareWorkDir();
if (assetManifestBinding) {
	verifiedLearnerAssetCopies = stageVerifiedLearnerAssetCopies({
		manifest: assetManifestBinding.value,
		rootDir,
		destinationRoot: path.join(workDir, 'assets')
	});
	candidate = remapPaperToVerifiedLearnerAssets({
		paper: rawCandidate,
		manifest: assetManifestBinding.value,
		attestation: verifiedLearnerAssetCopies,
		rootDir
	});
} else {
	candidate = candidateWithLocalAssets(rawCandidate);
}
contexts = buildContexts(candidate, plannedRefs);
sourceCandidateSnapshotBinding = stageBoundJsonSnapshot(
	inputBinding,
	path.join(workDir, 'source-candidate.json'),
	{
		rootDir,
		label: 'Solvability candidate input'
	}
);
writeJson(path.join(workDir, 'candidate.json'), candidate);
modelCandidateBinding = captureBoundJsonInput(path.join(workDir, 'candidate.json'), {
	rootDir,
	label: 'Solvability model candidate'
});
chmodSync(modelCandidateBinding.path, 0o444);
writeJson(path.join(workDir, 'solvability-contexts.json'), {
	sourceDocumentId,
	minScore,
	includePriorContext,
	questionCount: contexts.length,
	contexts
});
contextsBinding = captureBoundJsonInput(path.join(workDir, 'solvability-contexts.json'), {
	rootDir,
	label: 'Solvability contexts'
});
chmodSync(contextsBinding.path, 0o444);
writeJson(path.join(workDir, 'plan.json'), plan);

const prompt = buildPrompt();
writeJson(path.join(workDir, 'prompt.json'), { prompt });

const startedAt = new Date().toISOString();
let codexSummary = null;
try {
	codexSummary = await runBoundCodexTurn({
		prompt,
		workDir,
		eventsPath: path.join(workDir, 'events.jsonl'),
		lastMessagePath: path.join(workDir, 'last-message.txt'),
		summaryPath: path.join(workDir, 'codex-run-summary.json'),
		model,
		thinkingLevel,
		timeoutMs
	});
	const reportPath = path.join(workDir, 'solvability-report.json');
	if (!existsSync(reportPath)) throw new Error('Codex did not write solvability-report.json.');
	const rawReport = readJson(reportPath);
	const report = normalizeAndValidateReport(rawReport);
	mkdirSync(path.dirname(outputPath), { recursive: true });
	writeJson(outputPath, report);
	const outputBinding = captureBoundJsonInput(outputPath, {
		rootDir,
		label: 'Solvability report output'
	});
	assertBoundPhaseInputsCurrent();
	const summary = {
		status: report.status,
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		codex: codexSummary,
		report,
		phaseArtifacts: phaseArtifacts({
			inputs: {
				candidate: inputBinding.artifact,
				verifiedInputSnapshot: sourceCandidateSnapshotBinding.artifact,
				inputSnapshotDerivation: {
					schemaVersion: 'generated-phase-input-snapshot-v1',
					source: inputBinding.artifact,
					snapshot: sourceCandidateSnapshotBinding.artifact
				},
				modelCandidate: modelCandidateBinding.artifact,
				contexts: contextsBinding.artifact,
				...(assetManifestBinding
					? {
							learnerAssetManifest: assetManifestBinding.artifact,
							verifiedLearnerAssetCopies
						}
					: {})
			},
			outputs: {
				report: outputBinding.artifact
			}
		}),
		artifacts: artifacts()
	};
	writeJson(summaryPath, summary);
	console.log(JSON.stringify(summary, null, 2));
	if (report.status !== 'passed') process.exit(1);
} catch (error) {
	const summary = {
		status: 'failed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		codex: codexSummary,
		error: error instanceof Error ? error.message : String(error),
		artifacts: artifacts()
	};
	writeJson(summaryPath, summary);
	console.error(JSON.stringify(summary, null, 2));
	process.exit(1);
}

function prepareWorkDir() {
	if (existsSync(workDir)) {
		if (!force) throw new Error(`Work dir already exists; pass --force: ${relative(workDir)}`);
		rmSync(workDir, { recursive: true, force: true });
	}
	mkdirSync(workDir, { recursive: true });
	mkdirSync(path.join(workDir, 'assets'), { recursive: true });
}

async function runBoundCodexTurn(options) {
	assertBoundPhaseInputsCurrent();
	try {
		return await runCodexSdkTurn(options);
	} finally {
		assertBoundPhaseInputsCurrent();
	}
}

function assertBoundPhaseInputsCurrent() {
	assertBoundJsonInputCurrent(inputBinding, { label: 'Solvability candidate input' });
	if (!sourceCandidateSnapshotBinding || !modelCandidateBinding || !contextsBinding) {
		throw new Error('Solvability model inputs were not fully staged.');
	}
	assertBoundJsonInputCurrent(sourceCandidateSnapshotBinding, {
		label: 'Solvability candidate input snapshot'
	});
	assertExactJsonArtifactsEqual(
		inputBinding.artifact,
		sourceCandidateSnapshotBinding.artifact,
		'Solvability candidate input snapshot'
	);
	assertBoundJsonInputCurrent(modelCandidateBinding, {
		label: 'Solvability model candidate'
	});
	assertBoundJsonInputCurrent(contextsBinding, { label: 'Solvability contexts' });
	if (assetManifestBinding) {
		assertBoundJsonInputCurrent(assetManifestBinding, {
			label: 'Solvability learner asset manifest'
		});
		assertLearnerVisibleAssetBundleCurrent({
			paper: rawCandidate,
			manifest: assetManifestBinding.value,
			rootDir
		});
		if (!verifiedLearnerAssetCopies) {
			throw new Error('Solvability learner assets were not staged.');
		}
		assertVerifiedLearnerAssetCopiesCurrent({
			manifest: assetManifestBinding.value,
			attestation: verifiedLearnerAssetCopies,
			rootDir
		});
	}
}

function candidateWithLocalAssets(candidate) {
	const remapped = new Map();
	const usedNames = new Set();
	function remap(filePath) {
		if (!filePath) return filePath;
		const value = String(filePath);
		if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
		const sourcePath = path.isAbsolute(value) ? value : path.resolve(rootDir, value);
		if (!existsSync(sourcePath)) return value;
		if (!remapped.has(sourcePath)) {
			const parsed = path.parse(sourcePath);
			let fileName = path.basename(sourcePath);
			let suffix = 1;
			while (usedNames.has(fileName)) {
				fileName = `${parsed.name}-${suffix}${parsed.ext}`;
				suffix += 1;
			}
			usedNames.add(fileName);
			const localPath = path.join('assets', fileName);
			remapped.set(sourcePath, localPath);
			assetCopyPairs.push({ sourcePath, localPath });
		}
		return remapped.get(sourcePath);
	}
	return {
		...candidate,
		questions: (candidate.questions ?? []).map((question) => ({
			...question,
			assets: (question.assets ?? []).map((asset) => ({
				...asset,
				filePath: remap(asset.filePath),
				sourcePath: remap(asset.sourcePath),
				localPath: remap(asset.localPath),
				path: remap(asset.path)
			}))
		}))
	};
}

function selectedQuestionRefs(candidate) {
	let refs = (candidate.questions ?? [])
		.map((question) => question.sourceQuestionRef)
		.filter((ref) => typeof ref === 'string' && ref.trim());
	if (questionArg) refs = refs.filter((ref) => ref === questionArg);
	if (maxQuestions) refs = refs.slice(0, maxQuestions);
	return refs;
}

function buildContexts(candidate, refs) {
	return refs.map((sourceQuestionRef) => {
		const context = buildLearnerVisibleQuestionContext(candidate, sourceQuestionRef, {
			attachImages: false,
			includePriorContext
		});
		return {
			sourceQuestionRef,
			...context,
			inlineImages: undefined
		};
	});
}

function copyRemappedAssets() {
	for (const { sourcePath, localPath } of assetCopyPairs) {
		const destination = path.join(workDir, localPath);
		mkdirSync(path.dirname(destination), { recursive: true });
		if (!existsSync(destination)) copyFileSync(sourcePath, destination);
	}
}

function buildPrompt() {
	copyRemappedAssets();
	return `You are an independent GCSE question solvability judge. You did not create candidate.json.

Files in this clean work directory:
- candidate.json: the import-ready or chain-reconciled paper JSON
- solvability-contexts.json: one assembled learner-visible context per target question
- assets/: local media files referenced by contexts, when a concrete asset exists

Do not inspect the repository, previous workdirs, benchmark artifacts, git history, or the web. Start only from these files.
Do not print all of candidate.json or solvability-contexts.json to the terminal. Use focused jq selectors, small per-question slices, and asset inspection commands so the event log stays reviewable and the turn does not waste context on giant JSON dumps.

Task:
1. For every context in solvability-contexts.json, decide whether a student can answer the target question from the assembled app-visible context alone.
2. Treat previous subparts listed in the context as visible context, but do not use targetAnswerKey to decide whether the prompt is understandable.
3. The learner-visible evidence is not only targetQuestion/contextText. Read studentVisibleContext.sections[*].blocks.stem, .lead, .prompt, and .afterResponse carefully. A structured table rendered there is visible evidence. Do not report source data as missing if those blocks already contain the required values.
4. If a context includes studentVisibleContext.media[] with present=true and asset.filePath, inspect the local image file under assets/ before reporting that a figure, map, graph, photograph, or diagram is missing. If the image contains the required source information, the question is visible/solvable even when the same values are not also transcribed as text.
5. A media asset may include paperMeasurement with sourceVerified=true, axis="horizontal", a positive pixelWidth, and positive pixelsPerMillimetre. The public renderer turns that metadata into two learner-controlled guides and a live millimetre readout at the original paper scale, even when the image is responsively resized. Treat that as a calibrated digital ruler. Verify its density against the local image metadata before relying on it; fail missing, unverified, inconsistent, or fabricated calibration.
6. Use targetAnswerKey only after deciding visibility, to verify that grading evidence and the extracted response controls fit the visible question.
7. Fail real learner-facing defects: missing source table/figure/diagram data, missing response-surface asset, impossible fixed-response control, wrong or absent answer key, missing model answer for written responses, duplicated or contradictory prompt context, or mark-scheme evidence that cannot grade the visible question.
8. Do not judge answer-chain quality except where the chain text has contaminated the visible question or grading fields.
9. For structured source tables or source strings represented in context sections, an image asset is not required unless the target response itself is diagram/image based.
10. Geography Paper 3 may include official fieldwork questions that explicitly ask the learner to use their own human or physical geography enquiry. Do not fail those merely because the app does not provide a concrete fieldwork scenario. Pass them when the learner-visible prompt clearly states the own-fieldwork dependency, the response surface is renderable, and the mark scheme/checklist/model answer can grade generic valid fieldwork evidence.
11. For English Literature, classify each target as whole-text, extract-plus-wider-text, single-source analysis, two-extract comparison, or poetry comparison. If the printed task supplies an extract, poem, or sources, the exact learner-visible bundle must contain each complete source before the marked prompt, with real line/stanza breaks and intact identity/title/speaker labels. Complete source-verbatim blocks or complete readable official source-page/printed-extract media are valid; selfContainedPromptText, a synopsis, model answer, or mark-scheme indicative content is not. Verify targetQuestion.selfContainment declares status="source_complete", accurate requiredSourceCount, and exact requiredAssetLabels: use 1 for one printed source plus recalled wider-work/anthology knowledge and 2 for two printed sources. Never accept status="source_complete" for a partial, hidden, placeholder, copyright-flagged, or review-flagged source. Require two source media for two printed extracts/poems unless one visually verified asset contains the complete ordered pair and completeSourceBundle=true. Inspect every media file and require exact overlay-to-asset references so no declared source is hidden. Whole-text questions need no unprinted work text. Fail any source-dependent target with missing/ambiguous source-count metadata or a missing, partial, unreadable, unordered, hidden, placeholder, copyright-flagged, or review-flagged source.
12. Use score >= ${minScore} for passed questions. Any blocking missingContext/renderFinding or non-empty requiredRepairs means the question fails.

Write exactly one JSON file named solvability-report.json with this shape:
{
  "status": "passed" or "failed",
  "sourceDocumentId": ${JSON.stringify(sourceDocumentId)},
  "minScore": ${minScore},
  "questionCount": ${plannedRefs.length},
  "passed": number,
  "failed": number,
  "results": [
    {
      "sourceQuestionRef": "01.1",
      "status": "passed" or "failed",
      "score": number from 0 to 1,
      "studentVisibleSolvable": true or false,
      "markSchemeFits": true or false,
      "missingContext": [{"severity":"blocking" or "warning","message":"..."}],
      "renderFindings": [{"severity":"blocking" or "warning","message":"..."}],
      "requiredRepairs": [],
      "rationale": "short evidence-grounded rationale"
    }
  ],
  "rationale": "concise whole-paper summary"
}

Return a concise final message with status, passed/failed counts, and any failing refs.`;
}

function normalizeAndValidateReport(rawReport) {
	const results = Array.isArray(rawReport?.results) ? rawReport.results : [];
	const expected = new Set(plannedRefs);
	const seen = new Set();
	const normalizedResults = results.map((result) => {
		const sourceQuestionRef = String(result?.sourceQuestionRef ?? '');
		seen.add(sourceQuestionRef);
		const score = Number(result?.score);
		const missingContext = Array.isArray(result?.missingContext) ? result.missingContext : [];
		const renderFindings = Array.isArray(result?.renderFindings) ? result.renderFindings : [];
		const requiredRepairs = Array.isArray(result?.requiredRepairs) ? result.requiredRepairs : [];
		const blockingFindings = [...missingContext, ...renderFindings].filter(
			(finding) => String(finding?.severity ?? '').toLowerCase() === 'blocking'
		);
		const passed =
			expected.has(sourceQuestionRef) &&
			Number.isFinite(score) &&
			score >= minScore &&
			result?.studentVisibleSolvable === true &&
			result?.markSchemeFits === true &&
			requiredRepairs.length === 0 &&
			blockingFindings.length === 0 &&
			String(result?.status ?? '').toLowerCase() === 'passed';
		return {
			sourceQuestionRef,
			status: passed ? 'passed' : 'failed',
			score: Number.isFinite(score) ? score : 0,
			studentVisibleSolvable: result?.studentVisibleSolvable === true,
			markSchemeFits: result?.markSchemeFits === true,
			missingContext,
			renderFindings,
			requiredRepairs,
			rationale: String(result?.rationale ?? '').trim()
		};
	});
	const missingRefs = plannedRefs.filter((ref) => !seen.has(ref));
	for (const sourceQuestionRef of missingRefs) {
		normalizedResults.push({
			sourceQuestionRef,
			status: 'failed',
			score: 0,
			studentVisibleSolvable: false,
			markSchemeFits: false,
			missingContext: [],
			renderFindings: [],
			requiredRepairs: ['Codex solvability report omitted this target question.'],
			rationale: 'Missing from Codex report.'
		});
	}
	const extraRefs = [...seen].filter((ref) => !expected.has(ref));
	for (const sourceQuestionRef of extraRefs) {
		normalizedResults.push({
			sourceQuestionRef,
			status: 'failed',
			score: 0,
			studentVisibleSolvable: false,
			markSchemeFits: false,
			missingContext: [],
			renderFindings: [],
			requiredRepairs: ['Codex solvability report included an unexpected target question.'],
			rationale: 'Unexpected ref in Codex report.'
		});
	}
	normalizedResults.sort((a, b) => compareQuestionRefs(a.sourceQuestionRef, b.sourceQuestionRef));
	const failed = normalizedResults.filter((result) => result.status !== 'passed').length;
	return {
		status: failed === 0 ? 'passed' : 'failed',
		sourceDocumentId,
		minScore,
		questionCount: plannedRefs.length,
		passed: normalizedResults.length - failed,
		failed,
		results: normalizedResults,
		rationale: String(rawReport?.rationale ?? '').trim()
	};
}

function artifacts() {
	return {
		workDir: relative(workDir),
		events: relative(path.join(workDir, 'events.jsonl')),
		prompt: relative(path.join(workDir, 'prompt.json')),
		candidate: relative(path.join(workDir, 'candidate.json')),
		contexts: relative(path.join(workDir, 'solvability-contexts.json')),
		report: relative(outputPath),
		summary: relative(summaryPath)
	};
}

function compareQuestionRefs(left, right) {
	return String(left).localeCompare(String(right), undefined, {
		numeric: true,
		sensitivity: 'base'
	});
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function requiredStringArg(name) {
	const value = stringArg(name, '');
	if (!value) throw new Error(`Pass --${name}=...\n\n${usage}`);
	return value;
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
	if (!Number.isInteger(value) || value < 1)
		throw new Error(`--${name} must be a positive integer.`);
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
