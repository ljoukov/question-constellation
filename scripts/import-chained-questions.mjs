#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const extractionRoot = path.join(
	rootDir,
	'data/extracted-questions/aqa-combined-science-trilogy-higher'
);
const baselinePath = path.join(extractionRoot, 'baseline/all-papers.json');
const semanticDir = path.join(extractionRoot, 'semantic-chains');
const migrationPath = path.join(rootDir, 'migrations/0001_public_content.sql');
const wranglerPath = path.join(rootDir, 'wrangler.jsonc');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const schemaOnly = args.has('--schema-only');
const skipSchema = args.has('--skip-schema');
const batchSize = integerArg('batch-size', 50, 1);

function integerArg(name, defaultValue, minValue) {
	const arg = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
	if (!arg) return defaultValue;
	const value = Number(arg.slice(name.length + 3));
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer greater than or equal to ${minValue}.`);
	}
	return value;
}

function loadDotEnvFile(filePath) {
	if (!existsSync(filePath)) return;
	const raw = readFileSync(filePath, 'utf8');
	for (const line of raw.split(/\r?\n/)) {
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

loadDotEnvFile(path.join(rootDir, '.env'));
loadDotEnvFile(path.join(rootDir, '.env.local'));

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readWranglerConfig() {
	const raw = readFileSync(wranglerPath, 'utf8')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/\/\*[\s\S]*?\*\//g, '');
	return JSON.parse(raw);
}

function requiredEnv(name, fallback = null) {
	const value = process.env[name] ?? fallback;
	if (!value) {
		throw new Error(`${name} is required for D1 REST import.`);
	}
	return value;
}

const wranglerConfig = readWranglerConfig();
const databaseConfig = wranglerConfig.d1_databases?.find((db) => db.binding === 'QUESTION_DB');
const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
const apiToken = requiredEnv(
	'CLOUDFLARE_API_TOKEN',
	process.env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN ?? null
);
const databaseId = requiredEnv('QUESTION_DB_DATABASE_ID', databaseConfig?.database_id ?? null);
const d1QueryUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

function json(value, fallback) {
	return JSON.stringify(value ?? fallback);
}

function bool(value) {
	return value ? 1 : 0;
}

function normalizeTransferDistance(value) {
	const normalized = String(value ?? 'unclassified').replaceAll('-', '_');
	if (normalized === 'exam_transfer') return 'exam_transfer';
	if (['start', 'near', 'stretch', 'unclassified'].includes(normalized)) return normalized;
	return 'unclassified';
}

function firstText(...values) {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return null;
}

function titleFromQuestion(question) {
	const text =
		firstText(question.prompt_text, question.self_contained_prompt_text, question.id) ??
		question.id;
	const cleaned = text
		.replace(/\[[^\]]*marks?\]/gi, '')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line && !/^figure\s+\d+$/i.test(line) && !/^table\s+\d+$/i.test(line))
		.at(-1);
	const base = cleaned || text.replace(/\s+/g, ' ');
	return base.length > 96 ? `${base.slice(0, 93).trim()}...` : base;
}

function contextText(question) {
	const parts = [];
	if (question.parent_stem) parts.push(question.parent_stem);
	for (const block of question.context_blocks ?? []) {
		if (block?.kind === 'parent_stem') continue;
		if (block?.text && block.text.length <= 1200) parts.push(block.text);
	}
	if (
		question.self_containment?.added_context &&
		question.self_containment.added_context.length <= 1200
	) {
		parts.push(question.self_containment.added_context);
	}
	return Array.from(new Set(parts.map((part) => part.trim()).filter(Boolean))).join('\n\n');
}

function evidenceForStep(step) {
	return step.supporting_evidence ?? step.mark_support ?? step.mark_scheme_support ?? [];
}

function collectQuestionMemberships(semanticFiles) {
	const memberships = new Map();

	function upsert(questionId, chainId, patch = {}) {
		if (!questionId || !chainId) return;
		const key = `${questionId}:${chainId}`;
		const existing = memberships.get(key) ?? {
			question_id: questionId,
			answer_chain_id: chainId,
			is_primary: 1,
			transfer_distance: 'unclassified',
			display_order: null,
			fit_confidence: null,
			fit_notes: null,
			needs_human_review: 0,
			review_notes: [],
			metadata: {}
		};
		memberships.set(key, {
			...existing,
			...patch,
			review_notes: [
				...(existing.review_notes ?? []),
				...(patch.review_notes ?? []),
				...(patch.question_review_notes ?? [])
			].filter(Boolean),
			metadata: { ...(existing.metadata ?? {}), ...(patch.metadata ?? {}) }
		});
	}

	for (const semantic of semanticFiles) {
		const chainIds = new Set((semantic.answer_chain_candidates ?? []).map((chain) => chain.id));

		for (const chain of semantic.answer_chain_candidates ?? []) {
			for (const [index, question] of (chain.supporting_questions ?? []).entries()) {
				upsert(question.question_id, chain.id, {
					transfer_distance: normalizeTransferDistance(question.transfer_distance),
					display_order: question.display_order ?? index + 1,
					fit_confidence: question.fit_confidence ?? null,
					fit_notes:
						question.fit_rationale ?? question.rationale ?? question.prompt_summary ?? null,
					needs_human_review: bool(
						question.needs_human_review ?? question.needs_human_review_from_baseline
					),
					review_notes: question.review_notes ?? question.question_review_notes ?? [],
					metadata: { source: 'answer_chain.supporting_questions', raw: question }
				});
			}
			for (const [index, question] of (chain.constellation_questions ?? []).entries()) {
				upsert(question.question_id, chain.id, {
					transfer_distance: normalizeTransferDistance(question.transfer_distance),
					display_order: question.display_order ?? index + 1,
					fit_confidence: question.fit_confidence ?? null,
					fit_notes: question.fit_rationale ?? question.rationale ?? null,
					needs_human_review: bool(question.needs_human_review),
					review_notes: question.review_notes ?? [],
					metadata: { source: 'answer_chain.constellation_questions', raw: question }
				});
			}
		}

		for (const constellation of semantic.constellation_candidates ?? []) {
			const chainId =
				constellation.answer_chain_id ??
				constellation.answer_chain_candidate_id ??
				constellation.chain_id;
			if (!chainId || !chainIds.has(chainId)) continue;
			const questions = constellation.questions ?? constellation.member_questions ?? [];
			for (const [index, question] of questions.entries()) {
				upsert(question.question_id, chainId, {
					transfer_distance: normalizeTransferDistance(question.transfer_distance),
					display_order: question.display_order ?? index + 1,
					fit_confidence: question.fit_confidence ?? question.confidence ?? null,
					fit_notes: question.rationale ?? question.fit_rationale ?? null,
					needs_human_review: bool(question.needs_human_review),
					review_notes: question.review_notes ?? [],
					metadata: { source: 'constellation.questions', raw: question }
				});
			}
		}

		const autoMatches = semantic.backlog?.auto_matched_candidate_questions_by_chain ?? {};
		for (const [chainId, questions] of Object.entries(autoMatches)) {
			for (const [index, question] of (questions ?? []).entries()) {
				upsert(question.question_id ?? question.id, chainId, {
					transfer_distance: normalizeTransferDistance(question.transfer_distance),
					display_order: question.display_order ?? 1000 + index,
					fit_confidence: question.fit_confidence ?? question.confidence ?? null,
					fit_notes:
						question.rationale ?? question.fit_rationale ?? 'Auto-matched chain candidate.',
					needs_human_review: bool(question.needs_human_review ?? true),
					review_notes: question.review_notes ?? [
						'Auto-matched candidate; review before publishing.'
					],
					metadata: { source: 'backlog.auto_matched_candidate_questions_by_chain', raw: question }
				});
			}
		}
	}

	return Array.from(memberships.values());
}

function splitSqlStatements(sql) {
	return sql
		.split(';')
		.map((statement) => statement.trim())
		.filter((statement) => statement && !statement.startsWith('--'));
}

async function executeBatch(statements, label) {
	if (statements.length === 0 || dryRun) return;

	for (let index = 0; index < statements.length; index += batchSize) {
		const batch = statements.slice(index, index + batchSize);
		const response = await fetch(d1QueryUrl, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({ batch })
		});
		const bodyText = await response.text();
		if (!response.ok) {
			throw new Error(
				`D1 batch failed (${label} ${index + 1}-${index + batch.length}): ${response.status} ${response.statusText}: ${bodyText}`
			);
		}
		const body = JSON.parse(bodyText);
		if (!body.success) {
			throw new Error(
				`D1 batch failed (${label} ${index + 1}-${index + batch.length}): ${JSON.stringify(body.errors ?? body)}`
			);
		}
		const failed = (body.result ?? []).find((result) => result?.success === false);
		if (failed) {
			throw new Error(
				`D1 batch statement failed (${label} ${index + 1}-${index + batch.length}): ${JSON.stringify(failed)}`
			);
		}
		console.log(
			`${label}: ${Math.min(index + batch.length, statements.length)}/${statements.length}`
		);
	}
}

async function applySchema() {
	const sql = readFileSync(migrationPath, 'utf8');
	await executeBatch(
		splitSqlStatements(sql).map((statement) => ({ sql: statement })),
		'schema'
	);
}

async function clearPublicTables() {
	const tables = [
		'constellation_questions',
		'constellations',
		'common_weak_answers',
		'question_answer_chains',
		'answer_chain_steps',
		'answer_chains',
		'model_answers',
		'mark_checklist_items',
		'mark_scheme_items',
		'question_assets',
		'questions',
		'source_documents',
		'content_imports'
	];
	await executeBatch(
		tables.map((table) => ({ sql: `DELETE FROM ${table}` })),
		'clear'
	);
}

function insertStatement(table, columns, values) {
	const placeholders = columns.map(() => '?').join(', ');
	return {
		sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
		params: values
	};
}

function semanticChainIdForConstellation(constellation) {
	return (
		constellation.answer_chain_id ??
		constellation.answer_chain_candidate_id ??
		constellation.chain_id
	);
}

const baseline = readJson(baselinePath);
const semanticFiles = ['biology', 'chemistry', 'physics'].map((subject) =>
	readJson(path.join(semanticDir, `${subject}.json`))
);
const allQuestions = new Map((baseline.questions ?? []).map((question) => [question.id, question]));
const sourceDocuments = new Map((baseline.source_documents ?? []).map((doc) => [doc.id, doc]));
const chains = semanticFiles.flatMap((semantic) => semantic.answer_chain_candidates ?? []);
const constellations = semanticFiles.flatMap((semantic) => semantic.constellation_candidates ?? []);
const memberships = collectQuestionMemberships(semanticFiles).filter((membership) =>
	allQuestions.has(membership.question_id)
);
const chainedQuestionIds = new Set(memberships.map((membership) => membership.question_id));
const neededSourceDocumentIds = new Set(
	Array.from(chainedQuestionIds)
		.map((questionId) => allQuestions.get(questionId)?.source_document_id)
		.filter(Boolean)
);
const importedConstellations = constellations.filter((constellation) =>
	chains.some((chain) => chain.id === semanticChainIdForConstellation(constellation))
);

console.log(
	JSON.stringify(
		{
			database_id: databaseId,
			dry_run: dryRun,
			schema_only: schemaOnly,
			chains: chains.length,
			constellations: importedConstellations.length,
			chained_questions: chainedQuestionIds.size,
			memberships: memberships.length,
			question_assets: Array.from(chainedQuestionIds).reduce(
				(count, questionId) => count + (allQuestions.get(questionId)?.assets?.length ?? 0),
				0
			)
		},
		null,
		2
	)
);

if (!skipSchema) {
	await applySchema();
}

if (!schemaOnly) {
	await clearPublicTables();
	const insertStatements = [];

	for (const sourceDocumentId of neededSourceDocumentIds) {
		const doc = sourceDocuments.get(sourceDocumentId);
		if (!doc) continue;
		insertStatements.push(
			insertStatement(
				'source_documents',
				[
					'id',
					'doc_type',
					'board',
					'qualification',
					'subject',
					'subject_area',
					'tier',
					'paper',
					'component_code',
					'series',
					'year',
					'title',
					'source_url',
					'file_path',
					'file_hash',
					'page_count',
					'metadata_json'
				],
				[
					doc.id,
					doc.doc_type,
					doc.board ?? null,
					doc.qualification ?? null,
					doc.subject ?? null,
					doc.subject_area ?? null,
					doc.tier ?? null,
					doc.paper ?? null,
					doc.component_code ?? null,
					doc.series ?? null,
					doc.year ?? null,
					doc.title ?? null,
					doc.source_url ?? null,
					doc.file_path ?? null,
					doc.file_hash ?? null,
					doc.page_count ?? null,
					json(doc.metadata, {})
				]
			)
		);
	}

	for (const questionId of chainedQuestionIds) {
		const question = allQuestions.get(questionId);
		const prompt = firstText(
			question.prompt_text,
			question.self_contained_prompt_text,
			question.full_prompt_text
		);
		insertStatements.push(
			insertStatement(
				'questions',
				[
					'id',
					'source_document_id',
					'parent_source_question_ref',
					'source_question_ref',
					'slug',
					'display_order',
					'prompt_text',
					'self_contained_prompt_text',
					'context_text',
					'command_word',
					'marks',
					'board',
					'qualification',
					'subject',
					'subject_area',
					'tier',
					'paper',
					'component_code',
					'series',
					'year',
					'topic_path_json',
					'spec_ref',
					'page_start',
					'page_end',
					'answer_format',
					'source_constraints_json',
					'self_containment_json',
					'extraction_confidence',
					'needs_human_review',
					'review_notes_json',
					'status',
					'metadata_json'
				],
				[
					question.id,
					question.source_document_id,
					question.parent_source_question_ref ?? null,
					question.source_question_ref,
					question.id,
					question.display_order ?? 0,
					prompt,
					question.self_contained_prompt_text ?? null,
					contextText(question) || null,
					question.command_word ?? null,
					question.marks ?? null,
					question.board ?? null,
					question.qualification ?? null,
					question.subject ?? null,
					question.subject_area ?? null,
					question.tier ?? null,
					question.paper ?? null,
					question.component_code ?? null,
					question.series ?? null,
					question.year ?? null,
					json(question.topic_path, []),
					question.spec_ref ?? null,
					question.page_start ?? null,
					question.page_end ?? null,
					question.answer_format ?? null,
					json(question.source_constraints, []),
					json(question.self_containment, {}),
					question.question_segmentation_confidence ?? null,
					bool(question.needs_human_review),
					json(question.review_notes, []),
					question.status ?? 'draft',
					json(
						{
							title: titleFromQuestion(question),
							figure_refs: question.figure_refs ?? [],
							table_refs: question.table_refs ?? [],
							visual_dependency: question.visual_dependency ?? 'none',
							full_prompt_text: question.full_prompt_text ?? null
						},
						{}
					)
				]
			)
		);

		for (const [index, asset] of (question.assets ?? []).entries()) {
			insertStatements.push(
				insertStatement(
					'question_assets',
					[
						'id',
						'question_id',
						'asset_type',
						'source_label',
						'required',
						'role',
						'page_number',
						'bbox_json',
						'alt_text',
						'extracted_text',
						'file_path',
						'r2_key',
						'public_path',
						'extraction_confidence',
						'needs_human_review',
						'metadata_json'
					],
					[
						asset.id ?? `${question.id}-asset-${index + 1}`,
						question.id,
						asset.asset_type ?? 'image',
						asset.source_label ?? null,
						bool(asset.required),
						asset.role ?? null,
						asset.page_number ?? null,
						json(asset.bbox, null),
						asset.alt_text ?? null,
						asset.extracted_text ?? null,
						asset.file_path ?? null,
						asset.r2_key ?? null,
						asset.public_path ?? null,
						asset.extraction_confidence ?? null,
						bool(asset.needs_human_review),
						json(asset.metadata, {})
					]
				)
			);
		}

		for (const [index, item] of (question.mark_scheme_items ?? []).entries()) {
			insertStatements.push(
				insertStatement(
					'mark_scheme_items',
					[
						'id',
						'question_id',
						'source_document_id',
						'display_order',
						'item_type',
						'text',
						'marks',
						'source_ref',
						'confidence',
						'metadata_json'
					],
					[
						`${question.id}-ms-${index + 1}`,
						question.id,
						item.source_document_id ?? null,
						index + 1,
						item.item_type ?? 'mark',
						item.text,
						item.marks ?? null,
						item.source_ref ?? null,
						item.confidence ?? null,
						json(item.metadata, {})
					]
				)
			);
		}

		for (const [index, item] of (question.mark_checklist ?? []).entries()) {
			const markSchemeItemIds = (item.mark_scheme_item_indexes ?? []).map(
				(itemIndex) => `${question.id}-ms-${Number(itemIndex) + 1}`
			);
			insertStatements.push(
				insertStatement(
					'mark_checklist_items',
					[
						'id',
						'question_id',
						'display_order',
						'text',
						'required',
						'mark_scheme_item_ids_json',
						'confidence',
						'needs_human_review'
					],
					[
						`${question.id}-check-${index + 1}`,
						question.id,
						index + 1,
						item.text,
						bool(item.required ?? true),
						json(markSchemeItemIds, []),
						item.confidence ?? null,
						bool(item.needs_human_review)
					]
				)
			);
		}

		if (question.model_answer?.answer_text) {
			insertStatements.push(
				insertStatement(
					'model_answers',
					[
						'id',
						'question_id',
						'answer_text',
						'derivation',
						'supporting_mark_scheme_item_ids_json',
						'confidence',
						'needs_human_review'
					],
					[
						`${question.id}-model-answer`,
						question.id,
						question.model_answer.answer_text,
						question.model_answer.derivation ?? 'generated_from_mark_scheme',
						json(question.model_answer.supporting_mark_scheme_item_ids, []),
						question.model_answer.confidence ?? null,
						bool(question.model_answer.needs_human_review)
					]
				)
			);
		}
	}

	for (const chain of chains) {
		insertStatements.push(
			insertStatement(
				'answer_chains',
				[
					'id',
					'slug',
					'title',
					'canonical_chain_text',
					'subject',
					'subject_area',
					'broad_topic',
					'summary',
					'created_by',
					'confidence',
					'needs_human_review',
					'review_notes_json',
					'status',
					'metadata_json'
				],
				[
					chain.id,
					chain.id,
					chain.title,
					chain.canonical_chain_text,
					'Combined Science',
					chain.subject_area ?? null,
					chain.broad_topic_metadata ?? null,
					chain.why_questions_share_chain ?? chain.why_same_chain ?? null,
					'extraction_agent',
					chain.confidence ?? null,
					bool(chain.needs_human_review),
					json(chain.review_notes, []),
					chain.status ?? 'draft',
					json(
						{
							why_questions_share_chain:
								chain.why_questions_share_chain ?? chain.why_same_chain ?? null,
							why_not_keyword_grouping:
								chain.why_not_keyword_grouping ?? chain.why_not_keyword_group ?? null,
							why_similar_questions_excluded: chain.why_similar_questions_excluded ?? null,
							excluded_similar_questions: chain.excluded_similar_questions ?? []
						},
						{}
					)
				]
			)
		);

		for (const [index, step] of (chain.steps ?? []).entries()) {
			insertStatements.push(
				insertStatement(
					'answer_chain_steps',
					[
						'id',
						'answer_chain_id',
						'display_order',
						'step_text',
						'step_role',
						'explanation',
						'common_omission',
						'supported_by_mark_scheme_item_ids_json',
						'evidence_json'
					],
					[
						`${chain.id}-step-${index + 1}`,
						chain.id,
						index + 1,
						step.step_text,
						step.step_role ?? 'link',
						step.explanation ?? null,
						step.common_omission ?? null,
						json(step.supported_by_mark_scheme_item_ids, []),
						json(evidenceForStep(step), [])
					]
				)
			);
		}
	}

	for (const membership of memberships) {
		insertStatements.push(
			insertStatement(
				'question_answer_chains',
				[
					'id',
					'question_id',
					'answer_chain_id',
					'is_primary',
					'fit_confidence',
					'fit_notes',
					'transfer_distance',
					'display_order',
					'needs_human_review',
					'review_notes_json',
					'metadata_json'
				],
				[
					`${membership.question_id}--${membership.answer_chain_id}`,
					membership.question_id,
					membership.answer_chain_id,
					bool(membership.is_primary),
					membership.fit_confidence ?? null,
					membership.fit_notes ?? null,
					normalizeTransferDistance(membership.transfer_distance),
					membership.display_order ?? null,
					bool(membership.needs_human_review),
					json(membership.review_notes, []),
					json(membership.metadata, {})
				]
			)
		);
	}

	for (const constellation of importedConstellations) {
		const chainId = semanticChainIdForConstellation(constellation);
		insertStatements.push(
			insertStatement(
				'constellations',
				[
					'id',
					'slug',
					'title',
					'answer_chain_id',
					'board',
					'qualification',
					'subject',
					'subject_area',
					'tier',
					'paper',
					'topic_path_json',
					'summary',
					'confidence',
					'needs_human_review',
					'review_notes_json',
					'status',
					'metadata_json'
				],
				[
					constellation.id,
					constellation.id,
					constellation.title,
					chainId,
					'AQA',
					'GCSE',
					'Combined Science',
					constellation.subject_area ?? null,
					'Higher',
					null,
					json([], []),
					constellation.why_questions_share_chain ?? constellation.why_same_chain ?? null,
					constellation.confidence ?? null,
					bool(constellation.needs_human_review),
					json(constellation.review_notes, []),
					constellation.status ?? 'draft',
					json(
						{
							why_not_keyword_grouping:
								constellation.why_not_keyword_grouping ??
								constellation.why_not_keyword_group ??
								null,
							why_similar_questions_excluded: constellation.why_similar_questions_excluded ?? null,
							excluded_similar_questions: constellation.excluded_similar_questions ?? []
						},
						{}
					)
				]
			)
		);

		const questions = constellation.questions ?? constellation.member_questions ?? [];
		for (const [index, question] of questions.entries()) {
			if (!chainedQuestionIds.has(question.question_id)) continue;
			insertStatements.push(
				insertStatement(
					'constellation_questions',
					[
						'id',
						'constellation_id',
						'question_id',
						'display_order',
						'transfer_distance',
						'role',
						'rationale',
						'confidence',
						'needs_human_review',
						'metadata_json'
					],
					[
						`${constellation.id}--${question.question_id}`,
						constellation.id,
						question.question_id,
						question.display_order ?? index + 1,
						normalizeTransferDistance(question.transfer_distance),
						normalizeTransferDistance(question.transfer_distance) === 'start'
							? 'start'
							: 'practice',
						question.rationale ?? question.fit_rationale ?? null,
						question.fit_confidence ?? question.confidence ?? null,
						bool(question.needs_human_review),
						json({ raw: question }, {})
					]
				)
			);
		}
	}

	for (const questionId of chainedQuestionIds) {
		const question = allQuestions.get(questionId);
		for (const [index, weakAnswer] of (question.common_weak_answers ?? []).entries()) {
			insertStatements.push(
				insertStatement(
					'common_weak_answers',
					[
						'id',
						'question_id',
						'answer_chain_id',
						'weak_answer_text',
						'missing_chain_step_ids_json',
						'explanation',
						'source',
						'confidence',
						'needs_human_review'
					],
					[
						`${question.id}-weak-${index + 1}`,
						question.id,
						null,
						weakAnswer.weak_answer_text,
						json(weakAnswer.missing_step_indexes ?? [], []),
						null,
						'agent',
						weakAnswer.confidence ?? null,
						bool(weakAnswer.needs_human_review)
					]
				)
			);
		}
	}

	insertStatements.push(
		insertStatement(
			'content_imports',
			['id', 'source', 'question_count', 'chain_count', 'constellation_count', 'metadata_json'],
			[
				`chained-aqa-${new Date().toISOString()}`,
				'data/extracted-questions/aqa-combined-science-trilogy-higher/semantic-chains',
				chainedQuestionIds.size,
				chains.length,
				importedConstellations.length,
				json(
					{
						baseline_file: path.relative(rootDir, baselinePath),
						semantic_files: ['biology.json', 'chemistry.json', 'physics.json'].map((file) =>
							path.relative(rootDir, path.join(semanticDir, file))
						)
					},
					{}
				)
			]
		)
	);

	await executeBatch(insertStatements, 'insert');
}

console.log('Import complete.');
