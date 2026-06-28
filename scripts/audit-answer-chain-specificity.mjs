#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	answerChainSpecificityIssues,
	chainSpecificityIssueSummary
} from './answer-chain-specificity.mjs';

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));
const failOnBlocking = args.has('--fail-on-blocking');
const jsonOnly = args.has('--json');
const inputPath = stringArg('input', '');
const inputRoot = path.resolve(rootDir, stringArg('input-root', 'data/vision-extracted'));
const semanticRoot = path.resolve(rootDir, stringArg('semantic-root', 'data/extracted-questions'));
const outputPath = stringArg('output', '');
const recursive = !args.has('--no-recursive');
const includeJson = !args.has('--no-json');
const includeSemantic = !args.has('--no-semantic');
const includeD1 = args.has('--d1');
const markReview = args.has('--mark-review');

if (markReview && !includeD1) {
	throw new Error('--mark-review requires --d1.');
}

if (!includeJson && !includeSemantic && !includeD1) {
	throw new Error('Enable at least one source: JSON, semantic chains, or --d1.');
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, value) {
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
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

function selectExtractedJsonFiles() {
	return inputPath ? [path.resolve(rootDir, inputPath)] : walkJsonFiles(inputRoot);
}

function auditExtractedJson() {
	if (!includeJson) return [];
	const findings = [];
	for (const filePath of selectExtractedJsonFiles()) {
		const paper = readJson(filePath);
		if (!Array.isArray(paper.questions)) continue;
		for (const question of paper.questions ?? []) {
			const issues = answerChainSpecificityIssues(question.answerChain, {
				commandWord: question.commandWord
			});
			if (!issues.length) continue;
			findings.push({
				source: 'extracted-json',
				file: relative(filePath),
				sourceDocumentId: paper.sourceDocument?.id ?? path.basename(filePath, '.json'),
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
	if (!includeSemantic || !existsSync(semanticRoot)) return [];
	const findings = [];
	for (const filePath of walkJsonFiles(semanticRoot).filter((file) =>
		file.split(path.sep).includes('semantic-chains')
	)) {
		const semantic = readJson(filePath);
		if (!Array.isArray(semantic.answer_chain_candidates)) continue;
		for (const chain of semantic.answer_chain_candidates ?? []) {
			const issues = answerChainSpecificityIssues(chain);
			if (!issues.length) continue;
			findings.push({
				source: 'semantic-chains',
				file: relative(filePath),
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

function parseJson(value, fallback) {
	try {
		return value ? JSON.parse(value) : fallback;
	} catch {
		return fallback;
	}
}

function loadDotEnvFile(filePath) {
	if (!existsSync(filePath)) return;
	for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;
		const [, key, rawValue] = match;
		if (process.env[key] !== undefined) continue;
		let value = rawValue.trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] = value;
	}
}

function readWranglerConfig() {
	const wranglerPath = path.join(rootDir, 'wrangler.jsonc');
	if (!existsSync(wranglerPath)) return {};
	const raw = readFileSync(wranglerPath, 'utf8')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/\/\*[\s\S]*?\*\//g, '');
	return JSON.parse(raw);
}

function requiredEnv(name, fallback = null) {
	const value = process.env[name] ?? fallback;
	if (!value) throw new Error(`${name} is required for D1 audit.`);
	return value;
}

function d1Config() {
	loadDotEnvFile(path.join(rootDir, '.env'));
	loadDotEnvFile(path.join(rootDir, '.env.local'));
	const wranglerConfig = readWranglerConfig();
	const databaseConfig = wranglerConfig.d1_databases?.find((db) => db.binding === 'QUESTION_DB');
	return {
		accountId: requiredEnv('CLOUDFLARE_ACCOUNT_ID'),
		apiToken: requiredEnv(
			'CLOUDFLARE_API_TOKEN',
			process.env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN ?? null
		),
		databaseId: requiredEnv('QUESTION_DB_DATABASE_ID', databaseConfig?.database_id ?? null)
	};
}

async function d1Query(sql, params = []) {
	const { accountId, apiToken, databaseId } = d1Config();
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({ sql, params })
		}
	);
	const bodyText = await response.text();
	if (!response.ok) {
		throw new Error(`D1 query failed: ${response.status} ${response.statusText}: ${bodyText}`);
	}
	const body = JSON.parse(bodyText);
	if (!body.success) throw new Error(`D1 query failed: ${JSON.stringify(body.errors ?? body)}`);
	const result = Array.isArray(body.result) ? body.result[0] : body.result;
	if (result?.success === false) throw new Error(`D1 statement failed: ${JSON.stringify(result)}`);
	return result?.results ?? [];
}

function groupBy(values, keyFn) {
	const map = new Map();
	for (const value of values) {
		const key = keyFn(value);
		const existing = map.get(key);
		if (existing) existing.push(value);
		else map.set(key, [value]);
	}
	return map;
}

function d1AnswerChain(row, steps) {
	return {
		id: row.id,
		title: row.title,
		canonicalChainText: row.canonical_chain_text,
		summary: row.summary,
		steps: steps.map((step) => ({
			stepText: step.step_text,
			stepRole: step.step_role,
			explanation: step.explanation,
			commonOmission: step.common_omission
		})),
		needsHumanReview: Boolean(row.needs_human_review),
		reviewNotes: parseJson(row.review_notes_json, [])
	};
}

async function auditD1() {
	if (!includeD1) return { findings: [], chains: [], memberships: [] };
	const [chains, steps, memberships] = await Promise.all([
		d1Query(
			`SELECT id, slug, title, canonical_chain_text, summary, subject_area, broad_topic,
			        needs_human_review, review_notes_json, status
			 FROM answer_chains
			 ORDER BY id`
		),
		d1Query(
			`SELECT answer_chain_id, display_order, step_text, step_role, explanation, common_omission
			 FROM answer_chain_steps
			 ORDER BY answer_chain_id, display_order`
		),
		d1Query(
			`SELECT qac.id AS membership_id, qac.answer_chain_id, qac.question_id,
			        qac.needs_human_review AS membership_needs_human_review,
			        qac.review_notes_json AS membership_review_notes_json,
			        q.source_document_id, q.source_question_ref, q.command_word
			 FROM question_answer_chains qac
			 LEFT JOIN questions q ON q.id = qac.question_id
			 ORDER BY qac.answer_chain_id, q.source_document_id, q.source_question_ref`
		)
	]);
	const stepsByChain = groupBy(steps, (step) => step.answer_chain_id);
	const membershipsByChain = groupBy(memberships, (membership) => membership.answer_chain_id);
	const findings = [];
	for (const chainRow of chains) {
		const contexts = membershipsByChain.get(chainRow.id) ?? [
			{
				membership_id: null,
				question_id: null,
				source_document_id: null,
				source_question_ref: null,
				command_word: null,
				membership_needs_human_review: null
			}
		];
		const chain = d1AnswerChain(chainRow, stepsByChain.get(chainRow.id) ?? []);
		for (const context of contexts) {
			const issues = answerChainSpecificityIssues(chain, {
				commandWord: context.command_word
			});
			if (!issues.length) continue;
			findings.push({
				source: 'd1',
				file: 'd1:answer_chains',
				sourceDocumentId: context.source_document_id ?? null,
				sourceQuestionRef: context.source_question_ref ?? null,
				questionId: context.question_id ?? null,
				membershipId: context.membership_id ?? null,
				chainId: chainRow.id,
				chainTitle: chainRow.title,
				chainStatus: chainRow.status,
				chainNeedsHumanReview: Boolean(chainRow.needs_human_review),
				membershipNeedsHumanReview: Boolean(context.membership_needs_human_review),
				issues
			});
		}
	}
	return { findings, chains, memberships };
}

function appendUniqueNote(rawNotes, note) {
	const notes = Array.isArray(rawNotes) ? rawNotes.filter((item) => typeof item === 'string') : [];
	if (!notes.includes(note)) notes.push(note);
	return notes;
}

async function markD1BlockingFindings(d1Audit, blockingFindings) {
	if (!markReview || !includeD1) return null;
	const blockingChainIds = [
		...new Set(
			blockingFindings
				.filter((finding) => finding.source === 'd1' && finding.chainId)
				.map((finding) => finding.chainId)
		)
	].sort();
	const note =
		'Answer-chain specificity audit: chain contains prompt-specific numeric solution text; rewrite as a reusable method before publishing.';
	const chainsById = new Map(d1Audit.chains.map((chain) => [chain.id, chain]));
	let markedChains = 0;
	let markedMemberships = 0;
	for (const chainId of blockingChainIds) {
		const chain = chainsById.get(chainId);
		const reviewNotes = appendUniqueNote(parseJson(chain?.review_notes_json, []), note);
		await d1Query(
			`UPDATE answer_chains
			 SET needs_human_review = 1,
			     status = 'draft',
			     review_notes_json = ?,
			     updated_at = CURRENT_TIMESTAMP
			 WHERE id = ?`,
			[JSON.stringify(reviewNotes), chainId]
		);
		markedChains += 1;
		for (const membership of d1Audit.memberships.filter(
			(candidate) => candidate.answer_chain_id === chainId
		)) {
			const membershipNotes = appendUniqueNote(
				parseJson(membership.membership_review_notes_json, []),
				note
			);
			await d1Query(
				`UPDATE question_answer_chains
				 SET needs_human_review = 1,
				     review_notes_json = ?
				 WHERE id = ?`,
				[JSON.stringify(membershipNotes), membership.membership_id]
			);
			markedMemberships += 1;
		}
	}
	return { markedChains, markedMemberships, note };
}

const d1Audit = await auditD1();
const findings = [...auditExtractedJson(), ...auditSemanticChains(), ...d1Audit.findings];
const blockingFindings = findings.filter((finding) =>
	finding.issues.some((issue) => issue.severity === 'error')
);
const warningFindings = findings.filter(
	(finding) =>
		finding.issues.some((issue) => issue.severity === 'warning') &&
		!finding.issues.some((issue) => issue.severity === 'error')
);
const markReviewResult = await markD1BlockingFindings(d1Audit, blockingFindings);
const unreviewedD1BlockingFindings = blockingFindings.filter(
	(finding) =>
		finding.source === 'd1' &&
		(!finding.chainNeedsHumanReview ||
			finding.chainStatus !== 'draft' ||
			!finding.membershipNeedsHumanReview)
);
const result = {
	files_scanned: includeJson
		? inputPath
			? 1
			: selectExtractedJsonFiles().filter((filePath) => {
					try {
						return Array.isArray(readJson(filePath).questions);
					} catch {
						return false;
					}
				}).length
		: 0,
	semantic_files_scanned: includeSemantic
		? walkJsonFiles(semanticRoot).filter((file) => file.split(path.sep).includes('semantic-chains'))
				.length
		: 0,
	d1_chains_scanned: d1Audit.chains.length,
	d1_memberships_scanned: d1Audit.memberships.length,
	findings: findings.length,
	blocking_findings: blockingFindings.length,
	warning_findings: warningFindings.length,
	blocking_chains: new Set(blockingFindings.map((finding) => finding.chainId).filter(Boolean))
		.size,
	warning_chains: new Set(warningFindings.map((finding) => finding.chainId).filter(Boolean)).size,
	unreviewed_d1_blocking_chains: new Set(
		unreviewedD1BlockingFindings.map((finding) => finding.chainId).filter(Boolean)
	).size,
	unreviewed_d1_blocking_memberships: new Set(
		unreviewedD1BlockingFindings.map((finding) => finding.membershipId).filter(Boolean)
	).size,
	mark_review: markReviewResult,
	blocking_examples: blockingFindings.slice(0, 20).map((finding) => ({
		source: finding.source,
		file: finding.file,
		sourceDocumentId: finding.sourceDocumentId,
		sourceQuestionRef: finding.sourceQuestionRef,
		questionId: finding.questionId ?? null,
		chainId: finding.chainId,
		chainTitle: finding.chainTitle,
		summary: chainSpecificityIssueSummary(
			finding.issues.filter((issue) => issue.severity === 'error'),
			3
		)
	})),
	warning_examples: warningFindings.slice(0, 10).map((finding) => ({
		source: finding.source,
		file: finding.file,
		sourceDocumentId: finding.sourceDocumentId,
		sourceQuestionRef: finding.sourceQuestionRef,
		questionId: finding.questionId ?? null,
		chainId: finding.chainId,
		chainTitle: finding.chainTitle,
		summary: chainSpecificityIssueSummary(
			finding.issues.filter((issue) => issue.severity === 'warning'),
			2
		)
	}))
};

if (outputPath) writeJsonFile(path.resolve(rootDir, outputPath), result);

if (jsonOnly) {
	console.log(JSON.stringify(result, null, 2));
} else {
	console.log(
		JSON.stringify(
			{
				files_scanned: result.files_scanned,
				semantic_files_scanned: result.semantic_files_scanned,
				d1_chains_scanned: result.d1_chains_scanned,
				d1_memberships_scanned: result.d1_memberships_scanned,
				findings: result.findings,
				blocking_findings: result.blocking_findings,
				warning_findings: result.warning_findings,
				blocking_chains: result.blocking_chains,
				warning_chains: result.warning_chains,
				unreviewed_d1_blocking_chains: result.unreviewed_d1_blocking_chains,
				unreviewed_d1_blocking_memberships: result.unreviewed_d1_blocking_memberships,
				mark_review: result.mark_review
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
