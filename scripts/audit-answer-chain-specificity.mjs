#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
	answerChainSpecificityIssues,
	chainSpecificityIssueSummary
} from './answer-chain-specificity.mjs';

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));
const failOnBlocking = args.has('--fail-on-blocking');
const jsonOnly = args.has('--json');
const visionPhysicsDir = path.join(
	rootDir,
	'data/vision-extracted/aqa-combined-science-trilogy-higher/physics'
);
const semanticDir = path.join(
	rootDir,
	'data/extracted-questions/aqa-combined-science-trilogy-higher/semantic-chains'
);

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function auditVisionPhysics() {
	if (!existsSync(visionPhysicsDir)) return [];
	const findings = [];
	for (const fileName of readdirSync(visionPhysicsDir).filter((file) => file.endsWith('.json')).sort()) {
		const filePath = path.join(visionPhysicsDir, fileName);
		const paper = readJson(filePath);
		for (const question of paper.questions ?? []) {
			const issues = answerChainSpecificityIssues(question.answerChain, {
				commandWord: question.commandWord
			});
			if (!issues.length) continue;
			findings.push({
				source: 'vision-physics',
				file: path.relative(rootDir, filePath),
				sourceDocumentId: paper.sourceDocument?.id ?? path.basename(fileName, '.json'),
				sourceQuestionRef: question.sourceQuestionRef,
				chainId: question.answerChain?.id ?? null,
				chainTitle: question.answerChain?.title ?? null,
				issues
			});
		}
	}
	return findings;
}

function auditSemanticChains() {
	if (!existsSync(semanticDir)) return [];
	const findings = [];
	for (const fileName of readdirSync(semanticDir).filter((file) => file.endsWith('.json')).sort()) {
		const filePath = path.join(semanticDir, fileName);
		const semantic = readJson(filePath);
		for (const chain of semantic.answer_chain_candidates ?? []) {
			const issues = answerChainSpecificityIssues(chain);
			if (!issues.length) continue;
			findings.push({
				source: 'semantic-chains',
				file: path.relative(rootDir, filePath),
				sourceDocumentId: null,
				sourceQuestionRef: null,
				chainId: chain.id ?? null,
				chainTitle: chain.title ?? null,
				issues
			});
		}
	}
	return findings;
}

const findings = [...auditVisionPhysics(), ...auditSemanticChains()];
const blockingFindings = findings.filter((finding) =>
	finding.issues.some((issue) => issue.severity === 'error')
);
const warningFindings = findings.filter(
	(finding) =>
		finding.issues.some((issue) => issue.severity === 'warning') &&
		!finding.issues.some((issue) => issue.severity === 'error')
);
const result = {
	files_scanned: new Set(findings.map((finding) => finding.file)).size,
	findings: findings.length,
	blocking_findings: blockingFindings.length,
	warning_findings: warningFindings.length,
	blocking_examples: blockingFindings.slice(0, 20).map((finding) => ({
		file: finding.file,
		sourceDocumentId: finding.sourceDocumentId,
		sourceQuestionRef: finding.sourceQuestionRef,
		chainId: finding.chainId,
		chainTitle: finding.chainTitle,
		summary: chainSpecificityIssueSummary(
			finding.issues.filter((issue) => issue.severity === 'error'),
			3
		)
	})),
	warning_examples: warningFindings.slice(0, 10).map((finding) => ({
		file: finding.file,
		sourceDocumentId: finding.sourceDocumentId,
		sourceQuestionRef: finding.sourceQuestionRef,
		chainId: finding.chainId,
		chainTitle: finding.chainTitle,
		summary: chainSpecificityIssueSummary(
			finding.issues.filter((issue) => issue.severity === 'warning'),
			2
		)
	}))
};

if (jsonOnly) {
	console.log(JSON.stringify(result, null, 2));
} else {
	console.log(
		JSON.stringify(
			{
				files_scanned: result.files_scanned,
				findings: result.findings,
				blocking_findings: result.blocking_findings,
				warning_findings: result.warning_findings
			},
			null,
			2
		)
	);
	for (const example of result.blocking_examples) {
		console.log(
			`BLOCKING ${example.file} ${example.sourceQuestionRef ?? ''} ${example.chainId}: ${example.summary}`
		);
	}
	for (const example of result.warning_examples) {
		console.log(
			`WARNING ${example.file} ${example.sourceQuestionRef ?? ''} ${example.chainId}: ${example.summary}`
		);
	}
}

if (failOnBlocking && blockingFindings.length > 0) {
	process.exitCode = 1;
}
