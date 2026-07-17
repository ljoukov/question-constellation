import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
	SELECTIVE_PAPER_COHORT_LOCK_PATH,
	SELECTIVE_PAPER_COHORT_LOCK_SHA256,
	loadSelectivePaperCohortLock,
	resolveSelectivePaperBatchLock,
	resolveSelectivePaperCommandLock,
	sealSelectivePaperCohortRows,
	sourceDocumentIdForCohortRow,
	validateSelectivePaperCohortLock,
	verifySelectivePaperCommandInputs
} from '../../../scripts/lib/selective-paper-cohort-lock.mjs';

type LockedPaper = {
	sourceDocumentId: string;
	board: string;
	subject: string;
	component: string;
	series: string;
	questionPaperSha256: string;
	markSchemeSha256: string;
};

type LockedSupportingDocument = {
	documentType: string;
	filename: string;
	localPath: string;
	sha256: string;
};

type FixtureRow = {
	source_document_id?: string;
	board: string;
	qualification: string;
	subject: string;
	component: string;
	series: string;
	series_code: string;
	question_paper: { filename: string; local_path: string; sha256: string };
	mark_scheme: { filename: string; local_path: string; sha256: string };
	supporting_documents: Array<{
		document_type: string;
		filename: string;
		local_path: string;
		sha256: string;
	}>;
};

const lock = JSON.parse(
	readFileSync(path.resolve('data/release/selective-paper-cohort-lock.json'), 'utf8')
) as {
	cohortId: string;
	papers: LockedPaper[];
	supportingDocumentsBySourceId: Record<string, LockedSupportingDocument[]>;
};
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('selective paper cohort lock', () => {
	it('pins the canonical tracked path and exact lock bytes', () => {
		const loaded = loadSelectivePaperCohortLock(
			path.resolve(SELECTIVE_PAPER_COHORT_LOCK_PATH),
			process.cwd()
		);
		expect(loaded.sha256).toBe(SELECTIVE_PAPER_COHORT_LOCK_SHA256);

		const root = mkdtempSync(path.join(tmpdir(), 'alternate-selective-paper-lock-'));
		roots.push(root);
		const alternatePath = path.join(root, 'alternate.json');
		writeFileSync(alternatePath, readFileSync(loaded.path));
		expect(() => loadSelectivePaperCohortLock(alternatePath, process.cwd())).toThrow(
			/canonical tracked lock/
		);
	});

	it('automatically binds cohort commands and requires v2 manifests to embed the lock', () => {
		const commandLock = resolveSelectivePaperCommandLock({
			rootDir: process.cwd(),
			sourceDocumentId: lock.papers[0].sourceDocumentId
		});
		expect(commandLock?.sha256).toBe(SELECTIVE_PAPER_COHORT_LOCK_SHA256);
		expect(
			resolveSelectivePaperCommandLock({
				rootDir: process.cwd(),
				sourceDocumentId: 'unrelated-paper'
			})
		).toBeNull();

		expect(() =>
			resolveSelectivePaperBatchLock({
				manifest: { schema_version: 'current-model-paper-cohort-v2', rows: [] },
				rootDir: process.cwd(),
				requestedLockPath: SELECTIVE_PAPER_COHORT_LOCK_PATH
			})
		).toThrow(/must embed its cohort-lock record/);

		const batchLock = resolveSelectivePaperBatchLock({
			manifest: {
				schema_version: 'current-model-paper-cohort-v2',
				cohort_lock: {
					path: SELECTIVE_PAPER_COHORT_LOCK_PATH,
					sha256: SELECTIVE_PAPER_COHORT_LOCK_SHA256,
					cohort_id: lock.cohortId
				}
			},
			rootDir: process.cwd()
		});
		expect(batchLock?.relativePath).toBe(SELECTIVE_PAPER_COHORT_LOCK_PATH);
	});

	it('seals and orders exactly the tracked 20-paper identities without source files', () => {
		validateSelectivePaperCohortLock(lock);
		const rows = rowsFromLock().reverse();
		delete rows.find((row) => row.component === '8464B1H')!.source_document_id;

		const sealed = sealSelectivePaperCohortRows({
			rows,
			lock,
			subset: 'all',
			rootDir: process.cwd(),
			verifyLocalFiles: false
		});

		expect(sealed.map((row) => row.source_document_id)).toEqual(
			lock.papers.map((paper: { sourceDocumentId: string }) => paper.sourceDocumentId)
		);
		expect(sealed[0].question_paper.sha256).toBe(lock.papers[0].questionPaperSha256);
	});

	it('rejects a same-count substitution and support-document hash drift', () => {
		const substituted = rowsFromLock();
		substituted[0].source_document_id = 'aqa-substituted-same-count-paper-qp-jun24';
		expect(() =>
			sealSelectivePaperCohortRows({
				rows: substituted,
				lock,
				subset: 'all',
				rootDir: process.cwd(),
				verifyLocalFiles: false
			})
		).toThrow(/missing=aqa-8464b1h-qp-jun24.*unexpected=aqa-substituted/);

		const supportDrift = rowsFromLock();
		const rowWithSupport = supportDrift.find((row) => row.supporting_documents.length > 0)!;
		rowWithSupport.supporting_documents[0].sha256 = '0'.repeat(64);
		expect(() =>
			sealSelectivePaperCohortRows({
				rows: supportDrift,
				lock,
				subset: 'all',
				rootDir: process.cwd(),
				verifyLocalFiles: false
			})
		).toThrow(/metadata differs from the cohort lock/);
	});

	it('uses the same deterministic identity algorithm for AQA and OCR rows', () => {
		expect(
			sourceDocumentIdForCohortRow({
				board: 'AQA',
				component: '8464B1H',
				series_code: 'JUN24'
			})
		).toBe('aqa-8464b1h-qp-jun24');
		expect(
			sourceDocumentIdForCohortRow({
				board: 'OCR',
				spec_code: 'J352',
				unit_code: 'J352/01',
				series_code: 'JUN24'
			})
		).toBe('ocr-j352-01-qp-jun24');
	});

	it('byte-checks a single expensive pipeline command before execution', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'selective-paper-command-lock-'));
		roots.push(root);
		const questionPaperPath = path.join(root, 'data/question.pdf');
		const markSchemePath = path.join(root, 'data/mark.pdf');
		mkdirSync(path.dirname(questionPaperPath), { recursive: true });
		writeFileSync(questionPaperPath, 'question bytes');
		writeFileSync(markSchemePath, 'mark bytes');
		const commandLock = structuredClone(lock) as typeof lock;
		commandLock.papers[0].questionPaperSha256 = digest('question bytes');
		commandLock.papers[0].markSchemeSha256 = digest('mark bytes');

		expect(
			verifySelectivePaperCommandInputs({
				lock: commandLock,
				sourceDocumentId: commandLock.papers[0].sourceDocumentId,
				rootDir: root,
				questionPaperPath,
				markSchemePath,
				supportingDocumentPaths: []
			})
		).toMatchObject({
			position: 1,
			questionPaper: { path: 'data/question.pdf', sha256: digest('question bytes') },
			markScheme: { path: 'data/mark.pdf', sha256: digest('mark bytes') }
		});

		writeFileSync(questionPaperPath, 'changed');
		expect(() =>
			verifySelectivePaperCommandInputs({
				lock: commandLock,
				sourceDocumentId: commandLock.papers[0].sourceDocumentId,
				rootDir: root,
				questionPaperPath,
				markSchemePath,
				supportingDocumentPaths: []
			})
		).toThrow(/bytes differ from the lock/);
	});
});

function rowsFromLock(): FixtureRow[] {
	return lock.papers.map((paper) => ({
		source_document_id: paper.sourceDocumentId,
		board: paper.board,
		qualification: 'GCSE',
		subject: paper.subject,
		component: paper.component,
		series: paper.series,
		series_code: 'JUN24',
		question_paper: {
			filename: `${paper.sourceDocumentId}-question.pdf`,
			local_path: `data/test/${paper.sourceDocumentId}-question.pdf`,
			sha256: paper.questionPaperSha256
		},
		mark_scheme: {
			filename: `${paper.sourceDocumentId}-mark.pdf`,
			local_path: `data/test/${paper.sourceDocumentId}-mark.pdf`,
			sha256: paper.markSchemeSha256
		},
		supporting_documents: lock.supportingDocumentsBySourceId[paper.sourceDocumentId].map(
			(document) => ({
				document_type: document.documentType,
				filename: document.filename,
				local_path: document.localPath,
				sha256: document.sha256
			})
		)
	}));
}

function digest(value: string) {
	return createHash('sha256').update(value).digest('hex');
}
