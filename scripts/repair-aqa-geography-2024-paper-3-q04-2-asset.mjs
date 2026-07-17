#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { binaryArtifact, jsonArtifact } from './lib/codex-phase-artifacts.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const sourceDocumentId = 'aqa-geography-2024-june-paper-3-geographical-applications-qp';
const failedEvidenceRoot =
	'tmp/current-model-paper-cohort/reviewed-repairs/aqa-geography-2024-paper-3-q04-2/failed-judge-20260717T0226Z';
const candidatePath = resolveArg('candidate', `${failedEvidenceRoot}/failed-candidate.json`);
const judgeReportPath = resolveArg('judge-report', `${failedEvidenceRoot}/judge-report.json`);
const clippedAssetPath = resolveArg(
	'clipped-asset',
	`${failedEvidenceRoot}/q04-2-pie-chart-clipped.png`
);
const questionPaperPath = resolveArg(
	'question-paper',
	'data/aqa-gcse-history-geography-computer-science/question-papers/AQA-80353-QP-JUN24.PDF'
);
const renderedPagePath = resolveArg(
	'rendered-page',
	'tmp/current-model-paper-cohort/retry-runs/aqa-geography-2024-june-paper-3-geographical-applications-qp/codex-extraction/qp-pages/page-11.png'
);
const outputAssetPath = path.resolve(
	rootDir,
	stringArg(
		'output-asset',
		'tmp/current-model-paper-cohort/retry-runs/aqa-geography-2024-june-paper-3-geographical-applications-qp/codex-extraction/assets/q04-2-pie-chart.png'
	)
);
const validationPath = path.resolve(
	rootDir,
	stringArg(
		'validation',
		'tmp/current-model-paper-cohort/reviewed-repairs/aqa-geography-2024-paper-3-q04-2/validation.json'
	)
);
const evidencePath = path.resolve(
	rootDir,
	stringArg('evidence', 'docs/release-evidence/aqa-geography-2024-paper-3-q04-2-asset-repair.json')
);

const crop = { x: 270, y: 270, width: 1070, height: 700 };
const expectedHashes = {
	candidate: '61fdb7e84e92347399f358f27058b46d6fe879751f9fa1f7fb5dfa4d2a02cebc',
	judgeReport: '1fa8136350976007d73d29a8940d0c56e23be71ae2f4ee768aa794d4bb71ea28',
	questionPaper: '8d23077d12b26f56b46f86c641a24ac16981a66f10aa62c20c74c713ca9f1ed3',
	renderedPage: '07a12a265b076ef360235aacf2cf6af1855383118a04e9d3dd50d3eb86f0533f',
	clippedAsset: 'cc3389972fe32ab1f8dbd8309133dd197d173f23af242276c214cbd2c3539cd4',
	repairedAsset: '22e6a017d73b863bc788f38c3956b84dc0b9e943fb5f94e4f9ae507dbd1d1243'
};
const inputs = {
	candidate: checkedArtifact(candidatePath, expectedHashes.candidate, true),
	judgeReport: checkedArtifact(judgeReportPath, expectedHashes.judgeReport, true),
	questionPaper: checkedArtifact(questionPaperPath, expectedHashes.questionPaper),
	renderedOfficialPage: checkedArtifact(renderedPagePath, expectedHashes.renderedPage),
	clippedAsset: checkedArtifact(clippedAssetPath, expectedHashes.clippedAsset)
};
const candidate = readJson(candidatePath);
const judgeReport = readJson(judgeReportPath);
assertCandidateContract(candidate);
assertFailedJudgeContract(judgeReport);

const clippedOcrText = ocrText(clippedAssetPath);
const requiredKeyLabels = [
	'Cheaper fares',
	'Increased frequency',
	'Shorter journey times',
	'Increased parking charges'
];
const clippedMissingLabels = requiredKeyLabels.filter(
	(label) => !normalizedText(clippedOcrText).includes(normalizedText(label))
);
if (
	JSON.stringify(clippedMissingLabels) !==
	JSON.stringify(['Increased frequency', 'Shorter journey times', 'Increased parking charges'])
) {
	throw new Error(
		`Archived clipped asset no longer demonstrates the exact three-label defect: ${JSON.stringify(clippedMissingLabels)}`
	);
}

cropOfficialPage();
const outputAsset = checkedArtifact(outputAssetPath, expectedHashes.repairedAsset);
const dimensions = identifyDimensions(outputAssetPath);
if (dimensions.width !== crop.width || dimensions.height !== crop.height) {
	throw new Error(`Repaired crop dimensions changed: ${JSON.stringify(dimensions)}`);
}
const repairedOcrText = ocrText(outputAssetPath);
const repairedMissingLabels = requiredKeyLabels.filter(
	(label) => !normalizedText(repairedOcrText).includes(normalizedText(label))
);
if (repairedMissingLabels.length !== 0) {
	throw new Error(
		`Repaired official crop still omits required key labels: ${JSON.stringify(repairedMissingLabels)}`
	);
}

runValidation();
const validation = readJson(validationPath);
if (
	validation.status !== 'passed' ||
	validation.questionCount !== 25 ||
	validation.markTotal !== 76 ||
	(validation.blockingIssues ?? []).length !== 0
) {
	throw new Error(`Candidate validation changed after asset repair: ${JSON.stringify(validation)}`);
}
const liveCandidateArtifact = jsonArtifact(
	path.resolve(
		rootDir,
		'tmp/current-model-paper-cohort/retry-runs/aqa-geography-2024-june-paper-3-geographical-applications-qp/raw/aqa-geography-2024-june-paper-3-geographical-applications-qp.json'
	),
	{ rootDir }
);
if (
	liveCandidateArtifact.sha256 !== inputs.candidate.sha256 ||
	liveCandidateArtifact.canonicalJsonSha256 !== inputs.candidate.canonicalJsonSha256
) {
	throw new Error('Asset-only repair unexpectedly changed the live extraction JSON.');
}

const evidence = {
	schemaVersion: 'codex-reviewed-extraction-asset-repair-v1',
	status: 'passed',
	sourceDocumentId,
	basis:
		'One official-PDF crop widened only at the right edge in response to the complete failed independent judge report. No extraction JSON, question, mark, key, prompt, model answer, chain, or other asset changed.',
	inputs,
	failedModelAudit: {
		status: judgeReport.status,
		verdict: judgeReport.verdict,
		score: judgeReport.score,
		checkedRefs: judgeReport.checkedRefs,
		requiredRepairs: judgeReport.requiredRepairs
	},
	repair: {
		sourceQuestionRef: '04.2',
		assetId: 'q04-2-pie-chart',
		assetLabel: 'Q04.2 pie chart response',
		officialPage: 11,
		beforeCrop: { x: 270, y: 270, width: 950, height: 700 },
		afterCrop: crop,
		changedGeometry: ['width'],
		requiredKeyLabels,
		clippedMissingLabels,
		repairedMissingLabels,
		method:
			'ImageMagick crop of the unchanged 180-DPI official question-paper page render; no synthetic pixels, labels, annotations, or other edits.'
	},
	outputAsset: {
		...outputAsset,
		dimensions
	},
	unchangedCandidateArtifact: liveCandidateArtifact,
	deterministicValidation: {
		...validation,
		artifact: jsonArtifact(validationPath, { rootDir })
	},
	invariants: {
		exactFailedCandidateHash: true,
		exactFailedJudgeHash: true,
		exactOfficialQuestionPaperHash: true,
		exactOfficialRenderedPageHash: true,
		exactClippedAssetHash: true,
		requiredRepairCountExact: judgeReport.requiredRepairs.length === 1,
		onlyCropWidthChanged: true,
		allFourOfficialKeyLabelsVisibleAfterRepair: repairedMissingLabels.length === 0,
		noExtractionJsonChanged: true,
		questionCountPreserved: validation.questionCount === 25,
		markTotalPreserved: validation.markTotal === 76,
		deterministicValidationPassed: true
	}
};
writeJson(evidencePath, evidence);
console.log(
	JSON.stringify(
		{
			status: 'passed',
			asset: relative(outputAssetPath),
			assetSha256: outputAsset.sha256,
			dimensions,
			evidence: relative(evidencePath),
			evidenceSha256: jsonArtifact(evidencePath, { rootDir }).sha256,
			validation: { questionCount: validation.questionCount, markTotal: validation.markTotal }
		},
		null,
		2
	)
);

function assertCandidateContract(paper) {
	if (paper?.sourceDocument?.id !== sourceDocumentId) {
		throw new Error(`Candidate source mismatch: ${paper?.sourceDocument?.id ?? 'missing'}`);
	}
	const questions = paper?.questions ?? [];
	if (
		questions.length !== 25 ||
		questions.reduce((sum, question) => sum + question.marks, 0) !== 76
	) {
		throw new Error('Geography paper inventory no longer equals 25 questions / 76 marks.');
	}
	const question = questions.find((entry) => entry.sourceQuestionRef === '04.2');
	const asset = question?.assets?.find((entry) => entry.assetId === 'q04-2-pie-chart');
	if (
		!asset ||
		asset.sourceLabel !== 'Q04.2 pie chart response' ||
		asset.role !== 'response-surface' ||
		asset.required !== true ||
		path.resolve(asset.filePath) !== outputAssetPath
	) {
		throw new Error('Q04.2 no longer binds exactly to the repaired response-surface asset.');
	}
}

function assertFailedJudgeContract(report) {
	if (
		report?.status !== 'failed' ||
		report?.verdict !== 'fail' ||
		Number(report?.score) !== 0.97 ||
		(report?.questionCount ?? null) !== 25 ||
		(report?.markTotal ?? null) !== 76 ||
		!Array.isArray(report?.checkedRefs) ||
		report.checkedRefs.length !== 25 ||
		!Array.isArray(report?.requiredRepairs) ||
		report.requiredRepairs.length !== 1 ||
		report.requiredRepairs[0]?.sourceQuestionRef !== '04.2' ||
		!String(report.requiredRepairs[0]?.repair ?? '').includes('wider crop')
	) {
		throw new Error('Failed Geography judge report no longer has the exact one-crop contract.');
	}
}

function cropOfficialPage() {
	const result = spawnSync(
		'convert',
		[
			renderedPagePath,
			'-crop',
			`${crop.width}x${crop.height}+${crop.x}+${crop.y}`,
			'+repage',
			'-strip',
			outputAssetPath
		],
		{ cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
	);
	if (result.status !== 0) {
		throw new Error(`Official-page crop failed.\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
	}
}

function identifyDimensions(filePath) {
	const result = spawnSync('identify', ['-format', '%w %h', filePath], {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
	if (result.status !== 0) {
		throw new Error(`identify failed for ${filePath}: ${result.stderr ?? ''}`);
	}
	const [width, height] = result.stdout.trim().split(/\s+/).map(Number);
	return { width, height };
}

function ocrText(filePath) {
	const result = spawnSync('tesseract', [filePath, 'stdout', '--psm', '6'], {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 16 * 1024 * 1024
	});
	if (result.status !== 0) {
		throw new Error(`OCR visibility check failed for ${filePath}: ${result.stderr ?? ''}`);
	}
	return result.stdout;
}

function normalizedText(value) {
	return String(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function runValidation() {
	const result = spawnSync(
		process.execPath,
		[
			'scripts/codex-import-helper.mjs',
			'validate-extraction',
			`--input=${candidatePath}`,
			'--expected-marks=76',
			'--expected-questions=25',
			`--output=${validationPath}`
		],
		{
			cwd: rootDir,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 64 * 1024 * 1024
		}
	);
	if (result.status !== 0) {
		throw new Error(`Geography validation failed.\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
	}
}

function checkedArtifact(filePath, expectedSha256, json = false) {
	const value = json ? jsonArtifact(filePath, { rootDir }) : binaryArtifact(filePath, { rootDir });
	if (value.sha256 !== expectedSha256) {
		throw new Error(
			`${value.path}: expected SHA-256 ${expectedSha256}, found ${value.sha256 ?? 'missing'}.`
		);
	}
	return value;
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function resolveArg(name, fallback) {
	const resolved = path.resolve(rootDir, stringArg(name, fallback));
	if (!existsSync(resolved)) throw new Error(`--${name} file does not exist: ${resolved}`);
	return resolved;
}

function stringArg(name, fallback = '') {
	const prefix = `--${name}=`;
	const argument = process.argv.find((candidate) => candidate.startsWith(prefix));
	return argument ? argument.slice(prefix.length) : fallback;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}
