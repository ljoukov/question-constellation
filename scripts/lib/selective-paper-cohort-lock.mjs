import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const SELECTIVE_PAPER_COHORT_LOCK_SCHEMA = 'selective-paper-cohort-lock-v1';
export const SELECTIVE_PAPER_COHORT_ID = 'current-model-representative-20-july-2026';
export const SELECTIVE_PAPER_COHORT_SIZE = 20;
export const SELECTIVE_COMBINED_PAPER_COUNT = 6;
export const SELECTIVE_PAPER_COHORT_LOCK_PATH = 'data/release/selective-paper-cohort-lock.json';
export const SELECTIVE_PAPER_COHORT_LOCK_SHA256 =
	'9a980e3d4197c5b1e327f885338f33511fdcd6a452ce1287db1d76924731c2e0';

/** @typedef {Record<string, any>} JsonObject */

/**
 * Load only the tracked, byte-pinned cohort contract. Accepting an arbitrary
 * structurally valid file would let a caller relabel one official paper as
 * another before an expensive extraction run.
 *
 * @param {string} lockPath
 * @param {string} [rootDir]
 */
export function loadSelectivePaperCohortLock(lockPath, rootDir = process.cwd()) {
	const canonicalPath = path.resolve(rootDir, SELECTIVE_PAPER_COHORT_LOCK_PATH);
	const resolvedPath = path.resolve(lockPath);
	if (resolvedPath !== canonicalPath) {
		throw new Error(
			`Selective-paper runs must use the canonical tracked lock: ${SELECTIVE_PAPER_COHORT_LOCK_PATH}`
		);
	}
	if (!existsSync(resolvedPath))
		throw new Error(`Missing selective-paper cohort lock: ${lockPath}`);
	const bytes = readFileSync(resolvedPath);
	const digest = sha256(bytes);
	if (digest !== SELECTIVE_PAPER_COHORT_LOCK_SHA256) {
		throw new Error(
			'The canonical selective-paper cohort lock bytes differ from the pinned SHA-256.'
		);
	}
	let lock;
	try {
		lock = JSON.parse(bytes.toString('utf8'));
	} catch {
		throw new Error(`Selective-paper cohort lock is not valid JSON: ${lockPath}`);
	}
	validateSelectivePaperCohortLock(lock);
	return { lock, path: resolvedPath, sha256: digest };
}

/**
 * Resolve the lock for a single-paper command. Selective-cohort source IDs are
 * locked automatically even when the caller omits --cohort-lock; a supplied
 * path is still required to be the canonical tracked path.
 *
 * @param {{rootDir: string, sourceDocumentId: string, requestedLockPath?: string}} options
 */
export function resolveSelectivePaperCommandLock({
	rootDir,
	sourceDocumentId,
	requestedLockPath = ''
}) {
	const canonical = loadSelectivePaperCohortLock(
		path.resolve(rootDir, SELECTIVE_PAPER_COHORT_LOCK_PATH),
		rootDir
	);
	const sourceIsLocked = canonical.lock.papers.some(
		/** @param {JsonObject} paper */
		(paper) => paper.sourceDocumentId === sourceDocumentId
	);
	if (!sourceIsLocked && !requestedLockPath) return null;
	const loaded = requestedLockPath
		? loadSelectivePaperCohortLock(path.resolve(rootDir, requestedLockPath), rootDir)
		: canonical;
	if (
		!loaded.lock.papers.some(
			/** @param {JsonObject} paper */
			(paper) => paper.sourceDocumentId === sourceDocumentId
		)
	) {
		throw new Error(`${sourceDocumentId} is not one exact paper in the selective cohort lock.`);
	}
	return loaded;
}

/**
 * Resolve and validate a batch manifest's lock binding. V2 manifests must
 * carry their own exact lock record; a CLI argument may confirm it but cannot
 * supply a missing record or select another file.
 *
 * @param {{manifest: JsonObject, rootDir: string, requestedLockPath?: string}} options
 */
export function resolveSelectivePaperBatchLock({ manifest, rootDir, requestedLockPath = '' }) {
	const embedded = manifest?.cohort_lock ?? null;
	if (manifest?.schema_version === 'current-model-paper-cohort-v2' && !embedded) {
		throw new Error('A current-model-paper-cohort-v2 manifest must embed its cohort-lock record.');
	}
	if (!embedded && !requestedLockPath) return null;
	const loaded = loadSelectivePaperCohortLock(
		path.resolve(rootDir, requestedLockPath || embedded.path),
		rootDir
	);
	const relativePath = path.relative(rootDir, loaded.path).split(path.sep).join('/');
	if (
		embedded &&
		(embedded.path !== relativePath ||
			embedded.sha256 !== loaded.sha256 ||
			embedded.cohort_id !== loaded.lock.cohortId)
	) {
		throw new Error(
			'The batch manifest cohort-lock record differs from the canonical tracked lock.'
		);
	}
	return { loaded, relativePath };
}

/** @param {JsonObject} lock */
export function validateSelectivePaperCohortLock(lock) {
	const papers = /** @type {JsonObject[]} */ (Array.isArray(lock?.papers) ? lock.papers : []);
	const supporting = /** @type {Record<string, JsonObject[]> | null} */ (
		lock?.supportingDocumentsBySourceId ?? null
	);
	if (
		lock?.schemaVersion !== SELECTIVE_PAPER_COHORT_LOCK_SCHEMA ||
		lock?.cohortId !== SELECTIVE_PAPER_COHORT_ID ||
		papers.length !== SELECTIVE_PAPER_COHORT_SIZE ||
		new Set(papers.map((paper) => paper?.sourceDocumentId)).size !== papers.length ||
		papers.some(
			(paper, index) =>
				paper?.position !== index + 1 ||
				!String(paper?.sourceDocumentId ?? '').trim() ||
				!validSha256(paper?.questionPaperSha256) ||
				!validSha256(paper?.markSchemeSha256)
		) ||
		!supporting ||
		typeof supporting !== 'object' ||
		Array.isArray(supporting) ||
		Object.keys(supporting).length !== papers.length ||
		papers.some((paper) => !Array.isArray(supporting[paper.sourceDocumentId]))
	) {
		throw new Error('Selective-paper cohort lock is not the exact reviewed 20-paper contract.');
	}
	for (const [sourceDocumentId, documents] of Object.entries(supporting)) {
		for (const document of documents) {
			if (
				!String(document?.documentType ?? '').trim() ||
				!String(document?.filename ?? '').trim() ||
				!safeRelativePdfPath(document?.localPath) ||
				path.posix.basename(document.localPath) !== document.filename ||
				!validSha256(document?.sha256)
			) {
				throw new Error(`${sourceDocumentId} has an invalid locked support-document record.`);
			}
		}
	}
	return lock;
}

/**
 * @param {JsonObject} row
 * @param {JsonObject} [defaults]
 */
export function sourceDocumentIdForCohortRow(row, defaults = {}) {
	if (String(row?.source_document_id ?? '').trim()) return row.source_document_id;
	const board = slugPart(row?.board ?? defaults.board ?? 'source');
	const spec = slugPart(row?.spec_code ?? defaults.spec_code ?? row?.unit_code ?? row?.component);
	const unit = slugPart(row?.unit_code ?? row?.component ?? row?.paper);
	const series = slugPart(row?.series_code ?? row?.series ?? row?.year);
	const componentParts = unit.startsWith(spec) ? [unit] : [spec, unit];
	return [board, ...componentParts, 'qp', series].filter(Boolean).join('-');
}

/**
 * @param {{
 *   rows: JsonObject[],
 *   lock: JsonObject,
 *   subset?: 'all' | 'combined',
 *   rootDir: string,
 *   verifyLocalFiles?: boolean
 * }} options
 * @returns {JsonObject[]}
 */
export function sealSelectivePaperCohortRows({
	rows,
	lock,
	subset = 'all',
	rootDir,
	verifyLocalFiles = true
}) {
	validateSelectivePaperCohortLock(lock);
	if (!['all', 'combined'].includes(subset)) {
		throw new Error('Selective-paper cohort subset must be all or combined.');
	}
	const expected = /** @type {JsonObject[]} */ (
		subset === 'all' ? lock.papers : lock.papers.slice(0, SELECTIVE_COMBINED_PAPER_COUNT)
	);
	const normalizedRows = /** @type {JsonObject[]} */ (
		(Array.isArray(rows) ? rows : []).map((row) => ({
			...row,
			source_document_id: sourceDocumentIdForCohortRow(row)
		}))
	);
	const ids = normalizedRows.map((row) => row.source_document_id);
	if (new Set(ids).size !== ids.length) {
		throw new Error('Selective-paper cohort candidate rows contain duplicate source identities.');
	}
	const expectedIds = expected.map((paper) => paper.sourceDocumentId);
	const expectedSet = new Set(expectedIds);
	const actualSet = new Set(ids);
	const missing = expectedIds.filter((id) => !actualSet.has(id));
	const unexpected = ids.filter((id) => !expectedSet.has(id));
	if (missing.length || unexpected.length || ids.length !== expectedIds.length) {
		throw new Error(
			`Selective-paper cohort candidates differ from the exact ${subset} lock: ` +
				`missing=${missing.join(',') || 'none'}; unexpected=${unexpected.join(',') || 'none'}.`
		);
	}

	const byId = new Map(
		/** @type {Array<[string, JsonObject]>} */ (
			normalizedRows.map((row) => [row.source_document_id, row])
		)
	);
	return expected.map((locked) => {
		const row = byId.get(locked.sourceDocumentId);
		if (!row) throw new Error(`${locked.sourceDocumentId} is absent after exact-set validation.`);
		if (
			row.board !== locked.board ||
			row.qualification !== 'GCSE' ||
			(row.subject_area ?? row.subject) !== locked.subject ||
			row.component !== locked.component ||
			row.series !== locked.series
		) {
			throw new Error(`${locked.sourceDocumentId} metadata differs from the cohort lock.`);
		}
		const questionPaper = sealedDocument(
			row.question_paper,
			locked.questionPaperSha256,
			rootDir,
			verifyLocalFiles,
			`${locked.sourceDocumentId} question paper`
		);
		const markScheme = sealedDocument(
			row.mark_scheme,
			locked.markSchemeSha256,
			rootDir,
			verifyLocalFiles,
			`${locked.sourceDocumentId} mark scheme`
		);
		const actualSupporting = supportingDocumentsForRow(row);
		const expectedSupporting = lock.supportingDocumentsBySourceId[locked.sourceDocumentId];
		if (actualSupporting.length !== expectedSupporting.length) {
			throw new Error(`${locked.sourceDocumentId} support-document count differs from the lock.`);
		}
		for (let index = 0; index < expectedSupporting.length; index += 1) {
			const actual = actualSupporting[index];
			const expectedDocument = expectedSupporting[index];
			if (
				(actual.document_type ?? actual.documentType) !== expectedDocument.documentType ||
				actual.filename !== expectedDocument.filename ||
				actual.local_path !== expectedDocument.localPath
			) {
				throw new Error(
					`${locked.sourceDocumentId} support document ${index + 1} differs from the lock.`
				);
			}
			sealedDocument(
				actual,
				expectedDocument.sha256,
				rootDir,
				verifyLocalFiles,
				`${locked.sourceDocumentId} support document ${index + 1}`
			);
		}
		return { ...row, question_paper: questionPaper, mark_scheme: markScheme };
	});
}

/**
 * Verify a single expensive pipeline invocation before it starts a model or a
 * write. Question-paper and mark-scheme paths are byte-bound; support paths are
 * additionally exact because the lock records their canonical identities.
 *
 * @param {{
 *   lock: JsonObject,
 *   sourceDocumentId: string,
 *   rootDir: string,
 *   questionPaperPath: string,
 *   markSchemePath: string,
 *   supportingDocumentPaths?: string[]
 * }} options
 */
export function verifySelectivePaperCommandInputs({
	lock,
	sourceDocumentId,
	rootDir,
	questionPaperPath,
	markSchemePath,
	supportingDocumentPaths = []
}) {
	validateSelectivePaperCohortLock(lock);
	const matches = lock.papers.filter(
		/** @param {JsonObject} paper */
		(paper) => paper.sourceDocumentId === sourceDocumentId
	);
	if (matches.length !== 1) {
		throw new Error(`${sourceDocumentId} is not one exact paper in the selective cohort lock.`);
	}
	const paper = matches[0];
	const questionPaper = commandInputRecord(rootDir, questionPaperPath, paper.questionPaperSha256);
	const markScheme = commandInputRecord(rootDir, markSchemePath, paper.markSchemeSha256);
	const supporting = supportingDocumentPaths.map((filePath) =>
		commandInputRecord(rootDir, filePath, null)
	);
	const expectedSupporting = lock.supportingDocumentsBySourceId[sourceDocumentId];
	if (
		supporting.length !== expectedSupporting.length ||
		supporting.some(
			(input, index) =>
				input.path !== expectedSupporting[index].localPath ||
				input.sha256 !== expectedSupporting[index].sha256
		)
	) {
		throw new Error(`${sourceDocumentId} command support inputs differ from the cohort lock.`);
	}
	return {
		cohortId: lock.cohortId,
		sourceDocumentId,
		position: paper.position,
		questionPaper,
		markScheme,
		supportingDocuments: supporting
	};
}

/**
 * @param {JsonObject} document
 * @param {string} expectedSha256
 * @param {string} rootDir
 * @param {boolean} verifyLocalFiles
 * @param {string} label
 */
function sealedDocument(document, expectedSha256, rootDir, verifyLocalFiles, label) {
	if (
		!document ||
		!String(document.filename ?? '').trim() ||
		!safeRelativePdfPath(document.local_path) ||
		path.posix.basename(document.local_path) !== document.filename ||
		!validSha256(expectedSha256) ||
		(document.sha256 != null && document.sha256 !== expectedSha256)
	) {
		throw new Error(`${label} metadata differs from the cohort lock.`);
	}
	if (!verifyLocalFiles && document.sha256 !== expectedSha256) {
		throw new Error(`${label} lacks the exact locked SHA-256.`);
	}
	if (verifyLocalFiles) {
		const filePath = safeLocalPath(rootDir, document.local_path);
		if (!filePath || !existsSync(filePath) || sha256(readFileSync(filePath)) !== expectedSha256) {
			throw new Error(`${label} bytes are missing or differ from the cohort lock.`);
		}
	}
	return { ...document, sha256: expectedSha256 };
}

/** @param {JsonObject} row */
function supportingDocumentsForRow(row) {
	const candidates = [
		row.examiner_report,
		...(Array.isArray(row.examiner_reports) ? row.examiner_reports : []),
		...(Array.isArray(row.supporting_documents) ? row.supporting_documents : [])
	].filter(Boolean);
	const seen = new Set();
	return candidates.filter((document) => {
		const key = `${document.local_path ?? ''}\n${document.filename ?? ''}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * @param {string} rootDir
 * @param {string} relativePath
 */
function safeLocalPath(rootDir, relativePath) {
	if (!safeRelativePdfPath(relativePath)) return null;
	const root = path.resolve(rootDir);
	const resolved = path.resolve(root, relativePath);
	return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

/**
 * @param {string} rootDir
 * @param {string} filePath
 * @param {string | null} expectedSha256
 */
function commandInputRecord(rootDir, filePath, expectedSha256) {
	const root = path.resolve(rootDir);
	const absolute = path.resolve(filePath);
	const dataRoot = path.join(root, 'data');
	if (
		!absolute.startsWith(`${dataRoot}${path.sep}`) ||
		path.extname(absolute).toLowerCase() !== '.pdf' ||
		!existsSync(absolute)
	) {
		throw new Error(`Selective cohort input is not a present PDF under data/: ${filePath}`);
	}
	const digest = sha256(readFileSync(absolute));
	if (expectedSha256 && digest !== expectedSha256) {
		throw new Error(`Selective cohort input bytes differ from the lock: ${filePath}`);
	}
	return {
		path: path.relative(root, absolute).split(path.sep).join('/'),
		sha256: digest
	};
}

/** @param {unknown} value */
function safeRelativePdfPath(value) {
	const stringValue = String(value ?? '');
	if (!stringValue.trim() || path.isAbsolute(stringValue)) return false;
	const normalized = path.posix.normalize(stringValue.replaceAll(path.sep, '/'));
	return (
		normalized === value &&
		normalized.startsWith('data/') &&
		!normalized.startsWith('../') &&
		path.posix.extname(normalized).toLowerCase() === '.pdf'
	);
}

/** @param {unknown} value */
function slugPart(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** @param {unknown} value */
function validSha256(value) {
	return /^[a-f0-9]{64}$/.test(String(value ?? ''));
}

/** @param {any} value */
function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
