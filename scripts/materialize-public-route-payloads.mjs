#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { QUESTION_PRACTICE_PAGE_CACHE_VERSION } from '../src/lib/questionPracticeCache.js';
import { d1Config } from './lib/d1-rest.mjs';
import {
	deleteLegacyPracticePayloadsStatement,
	deleteStaleQuestionPracticePayloadVersionsStatement
} from './lib/public-route-materialization-scope.mjs';

const DEFAULT_BATCH_SIZE = 50;
const PAYLOAD_COMPRESSION_THRESHOLD_BYTES = 128 * 1024;

function integerArg(name, defaultValue, minValue) {
	const arg = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
	if (!arg) return defaultValue;
	const value = Number(arg.slice(name.length + 3));
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer greater than or equal to ${minValue}.`);
	}
	return value;
}

async function executeBatch(statements, label, { rootDir, dryRun, batchSize }) {
	if (statements.length === 0) return;
	if (dryRun) {
		console.log(`${label}: dry run, ${statements.length} statements`);
		return;
	}

	const { accountId, apiToken, databaseId } = d1Config(rootDir);
	const d1QueryUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
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

function upsertPayloadStatement({ id, routeKind, routePath, payload, sourceVersion }) {
	const { storageJson } = encodePayloadForStorage(payload);
	return {
		sql: `INSERT INTO public_route_payloads
		      (id, route_kind, route_path, payload_json, source_version, updated_at)
		      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		      ON CONFLICT(id) DO UPDATE SET
		        route_kind = excluded.route_kind,
		        route_path = excluded.route_path,
		        payload_json = excluded.payload_json,
		        source_version = excluded.source_version,
		        updated_at = CURRENT_TIMESTAMP`,
		params: [id, routeKind, routePath, storageJson, sourceVersion ?? null]
	};
}

function encodePayloadForStorage(payload) {
	const rawJson = JSON.stringify(payload);
	const rawBytes = Buffer.byteLength(rawJson);
	if (rawBytes < PAYLOAD_COMPRESSION_THRESHOLD_BYTES) {
		return {
			storageJson: rawJson,
			rawBytes,
			storedBytes: rawBytes,
			compressed: false
		};
	}

	const compressed = gzipSync(Buffer.from(rawJson));
	const storageJson = JSON.stringify({
		__qcPayloadEncoding: 'gzip-base64',
		data: compressed.toString('base64'),
		rawBytes
	});
	return {
		storageJson,
		rawBytes,
		storedBytes: Buffer.byteLength(storageJson),
		compressed: true
	};
}

async function fetchAppPublicPayloads({ rootDir }) {
	const { createServer } = await import('vite');
	const vite = await createServer({
		root: rootDir,
		logLevel: 'error',
		appType: 'custom',
		server: { middlewareMode: true }
	});

	try {
		const learningChainData = await vite.ssrLoadModule('/src/lib/server/learningChainData.ts');
		const subjectLearning = await vite.ssrLoadModule('/src/lib/server/subjectLearning.ts');
		const [browseData, homeData, subjectLearningCatalog] = await Promise.all([
			learningChainData.getFreshQuestionBankBrowseData(),
			learningChainData.getFreshHomePagePublicData(),
			subjectLearning.getFreshSubjectLearningPublicCatalog()
		]);
		return { browseData, homeData, subjectLearningCatalog };
	} finally {
		await vite.close();
	}
}

async function fetchSubjectLearningPublicCatalog({ rootDir }) {
	const { createServer } = await import('vite');
	const vite = await createServer({
		root: rootDir,
		logLevel: 'error',
		appType: 'custom',
		server: { middlewareMode: true }
	});

	try {
		const subjectLearning = await vite.ssrLoadModule('/src/lib/server/subjectLearning.ts');
		return await subjectLearning.getFreshSubjectLearningPublicCatalog();
	} finally {
		await vite.close();
	}
}

export async function materializePublicRoutePayloads({
	rootDir = process.cwd(),
	dryRun = false,
	batchSize = DEFAULT_BATCH_SIZE,
	ownedChainIds = null
} = {}) {
	const sourceVersion = new Date().toISOString();
	const { browseData, homeData, subjectLearningCatalog } = await fetchAppPublicPayloads({
		rootDir
	});
	const visibilityStatements = [
		upsertPayloadStatement({
			id: 'chains:browse',
			routeKind: 'questions',
			routePath: '/questions',
			payload: browseData,
			sourceVersion
		}),
		upsertPayloadStatement({
			id: 'home:public-summary',
			routeKind: 'home',
			routePath: '/',
			payload: homeData,
			sourceVersion
		}),
		upsertPayloadStatement({
			id: 'subject-learning:catalog',
			routeKind: 'subject-learning-catalog',
			routePath: '/_materialized/subject-learning-catalog',
			payload: subjectLearningCatalog,
			sourceVersion
		})
	];

	// The legacy route family has been removed. Every materialization retires any
	// remaining payload rows for it, while canonical question-practice caches keep
	// their independent `question-practice-page` lifecycle.
	const cleanupStatements = [deleteLegacyPracticePayloadsStatement()];
	if (!Array.isArray(ownedChainIds)) {
		cleanupStatements.push(
			deleteStaleQuestionPracticePayloadVersionsStatement(QUESTION_PRACTICE_PAGE_CACHE_VERSION)
		);
	}

	await executeBatch(visibilityStatements, 'materialize browse and home routes', {
		rootDir,
		dryRun,
		batchSize
	});
	await executeBatch(cleanupStatements, 'retire legacy practice routes', {
		rootDir,
		dryRun,
		batchSize
	});
	const statementCount = visibilityStatements.length + cleanupStatements.length;
	const summary = {
		chains_browse_payload_raw_kb: Math.round(encodePayloadForStorage(browseData).rawBytes / 1024),
		chains_browse_payload_stored_kb: Math.round(
			encodePayloadForStorage(browseData).storedBytes / 1024
		),
		chains_browse_payload_compressed: encodePayloadForStorage(browseData).compressed,
		home_payload_raw_kb: Math.round(encodePayloadForStorage(homeData).rawBytes / 1024),
		home_payload_stored_kb: Math.round(encodePayloadForStorage(homeData).storedBytes / 1024),
		subject_learning_payload_raw_kb: Math.round(
			encodePayloadForStorage(subjectLearningCatalog).rawBytes / 1024
		),
		subject_learning_payload_stored_kb: Math.round(
			encodePayloadForStorage(subjectLearningCatalog).storedBytes / 1024
		),
		subject_learning_offerings: subjectLearningCatalog.offerings.length,
		subject_learning_questions: subjectLearningCatalog.offerings.reduce(
			(total, offering) => total + offering.questions.length,
			0
		),
		subject_learning_recall_cards: subjectLearningCatalog.offerings.reduce(
			(total, offering) => total + offering.recallCards.length,
			0
		),
		subject_learning_resume_questions: subjectLearningCatalog.resumeQuestions.length,
		subject_learning_profile_subjects: subjectLearningCatalog.boardAvailability.length,
		browse_questions: browseData.questions.length,
		browse_topics: browseData.topics.length,
		statements: statementCount,
		dry_run: dryRun
	};
	console.log(JSON.stringify(summary, null, 2));
	return summary;
}

export async function materializeSubjectLearningPublicCatalog({
	rootDir = process.cwd(),
	dryRun = false
} = {}) {
	const sourceVersion = new Date().toISOString();
	const payload = await fetchSubjectLearningPublicCatalog({ rootDir });
	const statement = upsertPayloadStatement({
		id: 'subject-learning:catalog',
		routeKind: 'subject-learning-catalog',
		routePath: '/_materialized/subject-learning-catalog',
		payload,
		sourceVersion
	});
	await executeBatch([statement], 'materialize subject-learning catalog', {
		rootDir,
		dryRun,
		batchSize: 1
	});
	const encoded = encodePayloadForStorage(payload);
	const summary = {
		subject_learning_payload_raw_kb: Math.round(encoded.rawBytes / 1024),
		subject_learning_payload_stored_kb: Math.round(encoded.storedBytes / 1024),
		subject_learning_payload_compressed: encoded.compressed,
		subject_learning_offerings: payload.offerings.length,
		subject_learning_questions: payload.offerings.reduce(
			(total, offering) => total + offering.questions.length,
			0
		),
		subject_learning_recall_cards: payload.offerings.reduce(
			(total, offering) => total + offering.recallCards.length,
			0
		),
		subject_learning_resume_questions: payload.resumeQuestions.length,
		subject_learning_profile_subjects: payload.boardAvailability.length,
		dry_run: dryRun
	};
	console.log(JSON.stringify(summary, null, 2));
	return summary;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	const rootDir = process.cwd();
	const dryRun = process.argv.includes('--dry-run');
	const batchSize = integerArg('batch-size', DEFAULT_BATCH_SIZE, 1);
	const run = process.argv.includes('--subject-learning-only')
		? materializeSubjectLearningPublicCatalog({ rootDir, dryRun })
		: materializePublicRoutePayloads({ rootDir, dryRun, batchSize });
	run.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
