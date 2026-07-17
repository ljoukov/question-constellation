#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';
import {
	loadSelectivePaperCohortLock,
	sealSelectivePaperCohortRows
} from './lib/selective-paper-cohort-lock.mjs';

const rootDir = process.cwd();
const outputPath = path.resolve(
	rootDir,
	process.argv.find((argument) => argument.startsWith('--output='))?.slice('--output='.length) ??
		'tmp/current-model-paper-cohort/manifest.json'
);
const subset =
	process.argv.find((argument) => argument.startsWith('--subset='))?.slice('--subset='.length) ??
	'all';
const cohortLockPath = path.resolve(
	rootDir,
	process.argv
		.find((argument) => argument.startsWith('--cohort-lock='))
		?.slice('--cohort-lock='.length) ?? 'data/release/selective-paper-cohort-lock.json'
);
if (!['all', 'combined'].includes(subset)) {
	throw new Error('--subset must be all or combined.');
}

const sources = [
	{
		key: 'combined',
		name: 'AQA Combined Science June 2024',
		dataRoot: 'data/aqa-combined-science-trilogy-higher',
		select: (row) => row.series_code === 'JUN24'
	},
	{
		key: 'separate',
		name: 'AQA Separate Sciences June 2024',
		dataRoot: 'data/aqa-separate-science-higher',
		select: (row) => row.series_code === 'JUN24'
	},
	{
		key: 'english-language',
		name: 'OCR English Language June 2024',
		dataRoot: 'data/ocr-gcse-english-language',
		select: (row) => row.series_code === 'JUN24'
	},
	{
		key: 'english-literature',
		name: 'OCR English Literature June 2024',
		dataRoot: 'data/ocr-gcse-english-literature',
		select: (row) => row.series_code === 'JUN24'
	},
	{
		key: 'representative-options',
		name: 'AQA representative option papers June 2024',
		dataRoot: 'data/aqa-gcse-history-geography-computer-science',
		select: (row) =>
			new Set([
				'aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp',
				'aqa-computer-science-2024-june-paper-2-computing-concepts-qp',
				'aqa-geography-2024-june-paper-3-geographical-applications-qp',
				'aqa-history-2024-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp'
			]).has(row.source_document_id)
	}
];

const selectedSources =
	subset === 'all' ? sources : sources.filter((source) => source.key === subset);
const candidateRows = selectedSources.flatMap((source) => {
	const manifestPath = path.join(rootDir, source.dataRoot, 'manifest.json');
	if (!existsSync(manifestPath)) throw new Error(`Missing source manifest: ${manifestPath}`);
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	return (manifest.rows ?? []).filter(source.select).map((row) => ({
		...row,
		board: row.board ?? manifest.board,
		qualification: row.qualification ?? manifest.qualification,
		subject: row.subject ?? manifest.subject,
		subject_area: row.subject_area ?? row.subject ?? manifest.subject,
		tier: row.tier ?? manifest.tier ?? '',
		question_paper: documentWithLocalPath(row.question_paper, source.dataRoot, 'question-papers'),
		mark_scheme: documentWithLocalPath(row.mark_scheme, source.dataRoot, 'mark-schemes'),
		examiner_report: documentWithLocalPath(
			row.examiner_report,
			source.dataRoot,
			'examiner-reports'
		),
		examiner_reports: (row.examiner_reports ?? []).map((document) =>
			documentWithLocalPath(document, source.dataRoot, 'examiner-reports')
		),
		supporting_documents: (row.supporting_documents ?? []).map((document) =>
			documentWithLocalPath(document, source.dataRoot, 'supporting-documents')
		),
		cohort_source: source.name
	}));
});

const expectedCount = subset === 'all' ? 20 : 6;
const cohortLock = loadSelectivePaperCohortLock(cohortLockPath, rootDir);
const rows = sealSelectivePaperCohortRows({
	rows: candidateRows,
	lock: cohortLock.lock,
	subset,
	rootDir,
	verifyLocalFiles: true
});
if (rows.length !== expectedCount) throw new Error(`Expected ${expectedCount} locked papers.`);
const identities = rows.map((row) => row.source_document_id);

writeJson(outputPath, {
	schema_version: 'current-model-paper-cohort-v2',
	generated_at: new Date().toISOString(),
	scope:
		'Reviewed representative cohort: all June 2024 Combined/Separate Science and OCR English papers, plus two AQA Computer Science papers and one Geography and History paper.',
	subset,
	cohort_lock: {
		path: path.relative(rootDir, cohortLock.path).split(path.sep).join('/'),
		sha256: cohortLock.sha256,
		cohort_id: cohortLock.lock.cohortId
	},
	rows
});
console.log(JSON.stringify({ outputPath, papers: rows.length, identities }, null, 2));

function documentWithLocalPath(document, dataRoot, defaultSubdir) {
	if (!document) return document;
	return {
		...document,
		document_type: document.document_type ?? inferredDocumentType(document, defaultSubdir),
		local_path: document.local_path ?? path.join(dataRoot, defaultSubdir, document.filename ?? '')
	};
}

function inferredDocumentType(document, defaultSubdir) {
	if (defaultSubdir === 'question-papers') return 'question_paper';
	if (defaultSubdir === 'mark-schemes') return 'mark_scheme';
	if (defaultSubdir === 'examiner-reports') return 'examiner_report';
	const identity = `${document.filename ?? ''} ${document.title ?? ''}`.toLowerCase();
	if (identity.includes('pre-release') || identity.includes('pre release')) return 'pre_release';
	if (identity.includes('-ins-') || identity.includes('insert')) return 'insert';
	return 'supporting_document';
}
