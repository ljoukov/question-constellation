/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- This release helper validates intentionally untyped external JSON at runtime.
import { isDeepStrictEqual } from 'node:util';
import { auditOcrEnglishJune2024OriginalInventory } from './ocr-j351-june-2024-inventory.mjs';

const freezeRows = (rows) => Object.freeze(rows.map((row) => Object.freeze({ ...row })));

export const OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_DROPS = Object.freeze({
	'ocr-j351-01-qp-jun24': freezeRows([
		{ sourceQuestionRef: '02.0', marks: 6 },
		{ sourceQuestionRef: '03.0', marks: 12 },
		{ sourceQuestionRef: '04.0', marks: 18 }
	]),
	'ocr-j351-02-qp-jun24': freezeRows([
		{ sourceQuestionRef: '01.1a', marks: 3 },
		{ sourceQuestionRef: '01.1b', marks: 1 },
		{ sourceQuestionRef: '02.1', marks: 6 },
		{ sourceQuestionRef: '03.1', marks: 12 },
		{ sourceQuestionRef: '04.1', marks: 18 }
	]),
	'ocr-j352-01-qp-jun24': freezeRows([{ sourceQuestionRef: '17.1', marks: 40 }])
});

export const OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_SOURCE_IDS = Object.freeze(
	Object.keys(OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_DROPS)
);
export const OCR_ENGLISH_JUNE_2024_COPYRIGHT_DROPPED_QUESTION_COUNT = Object.values(
	OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_DROPS
).reduce((total, rows) => total + rows.length, 0);
export const OCR_ENGLISH_JUNE_2024_COPYRIGHT_DROPPED_MARK_TOTAL = Object.values(
	OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_DROPS
).reduce((total, rows) => total + rows.reduce((rowTotal, row) => rowTotal + row.marks, 0), 0);

export function expectedOcrEnglishCopyrightSubsetDrops(sourceDocumentId) {
	return OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_DROPS[sourceDocumentId] ?? null;
}

export function exactOcrEnglishCopyrightSubsetDrops(sourceDocumentId, droppedRows) {
	const expected = expectedOcrEnglishCopyrightSubsetDrops(sourceDocumentId);
	if (!expected || !Array.isArray(droppedRows)) return false;
	const actual = droppedRows.map((row) => ({
		sourceQuestionRef: String(row?.sourceQuestionRef ?? ''),
		marks: Number(row?.marks)
	}));
	return JSON.stringify(actual) === JSON.stringify(expected);
}

/**
 * Assert that a source-drop run is one of the reviewed OCR subsets, started
 * from its complete official inventory, and held out exactly the locked
 * ref/mark rows. This is deliberately stricter than the generic deterministic
 * copyright issue code.
 *
 * @param {{
 *   sourceDocumentId: string,
 *   originalInventoryLock: any,
 *   droppedRows: unknown
 * }} input
 */
export function assertExactOcrEnglishCopyrightSubsetDrops({
	sourceDocumentId,
	originalInventoryLock,
	droppedRows
}) {
	const auditedInventory = auditOcrEnglishJune2024OriginalInventory({
		sourceDocumentId,
		questions: originalInventoryLock?.actual?.questions
	});
	if (
		auditedInventory.status !== 'passed' ||
		!isDeepStrictEqual(originalInventoryLock, auditedInventory) ||
		!exactOcrEnglishCopyrightSubsetDrops(sourceDocumentId, droppedRows)
	) {
		throw new Error(
			`${sourceDocumentId} does not match the exact reviewed OCR June 2024 copyright-subset inventory and drop rows.`
		);
	}
	return {
		sourceDocumentId,
		originalInventoryLock: auditedInventory,
		droppedRows: expectedOcrEnglishCopyrightSubsetDrops(sourceDocumentId)
	};
}

/**
 * Validate the persisted extraction evidence used by both fresh post-phase
 * checks and exact resume. Artifact hashes/paths are checked by the parent
 * orchestrator; this function checks the bound JSON facts themselves.
 *
 * @param {{
 *   sourceDocumentId: string,
 *   extractionSummary: any,
 *   originalPaper: any,
 *   retainedPaper: any
 * }} input
 */
export function exactOcrEnglishCopyrightSubsetExtractionEvidence({
	sourceDocumentId,
	extractionSummary,
	originalPaper,
	retainedPaper
}) {
	const expectedDrops = expectedOcrEnglishCopyrightSubsetDrops(sourceDocumentId);
	if (!expectedDrops) return false;
	const originalInventory = auditOcrEnglishJune2024OriginalInventory({
		sourceDocumentId,
		questions: originalPaper?.questions
	});
	const summaryDrops = extractionSummary?.droppedExtractionQuestions;
	const subset = extractionSummary?.publishableSubset;
	const subsetDrops = subset?.dropped?.questions;
	const extractionRun = retainedPaper?.extractionRun;
	const retainedDrops = extractionRun?.droppedUnpublishableSourceQuestions;
	const retainedRefs = extractionRun?.droppedUnpublishableSourceQuestionRefs;
	const expectedRefs = expectedDrops.map((row) => row.sourceQuestionRef);
	const expectedMarkTotal = expectedDrops.reduce((total, row) => total + row.marks, 0);
	const retainedQuestions = retainedQuestionRows(originalPaper?.questions, expectedRefs);

	return (
		originalInventory.status === 'passed' &&
		isDeepStrictEqual(extractionSummary?.originalInventoryLock, originalInventory) &&
		exactOcrEnglishCopyrightSubsetDrops(sourceDocumentId, summaryDrops) &&
		exactOcrEnglishCopyrightSubsetDrops(sourceDocumentId, subsetDrops) &&
		exactOcrEnglishCopyrightSubsetDrops(sourceDocumentId, retainedDrops) &&
		isDeepStrictEqual(summaryDrops, subsetDrops) &&
		isDeepStrictEqual(summaryDrops, retainedDrops) &&
		isDeepStrictEqual(retainedRefs, expectedRefs) &&
		subset?.status === 'passed' &&
		subset?.policy === 'known_unresolved_copyright_source_only_v1' &&
		subset?.invariants?.questionCountConserved === true &&
		subset?.invariants?.markTotalConserved === true &&
		subset?.invariants?.onlyKnownUnresolvedCopyrightSource === true &&
		Number(subset?.original?.questionCount) === originalInventory.expected.questionCount &&
		Number(subset?.original?.markTotal) === originalInventory.expected.markTotal &&
		Number(subset?.retained?.questionCount) === retainedQuestions.length &&
		Number(subset?.retained?.markTotal) === questionMarkTotal(retainedQuestions) &&
		Number(subset?.dropped?.questionCount) === expectedDrops.length &&
		Number(subset?.dropped?.markTotal) === expectedMarkTotal &&
		extractionRun?.publishableSubset === true &&
		exactQuestionRows(retainedPaper?.questions, retainedQuestions)
	);
}

function retainedQuestionRows(questions, droppedRefs) {
	const dropped = new Set(droppedRefs);
	return (Array.isArray(questions) ? questions : []).filter(
		(question) => !dropped.has(String(question?.sourceQuestionRef ?? ''))
	);
}

function exactQuestionRows(actualQuestions, expectedQuestions) {
	if (!Array.isArray(actualQuestions) || !Array.isArray(expectedQuestions)) return false;
	const project = (questions) =>
		questions.map((question) => ({
			sourceQuestionRef: String(question?.sourceQuestionRef ?? ''),
			marks: Number(question?.marks)
		}));
	return JSON.stringify(project(actualQuestions)) === JSON.stringify(project(expectedQuestions));
}

function questionMarkTotal(questions) {
	return questions.reduce((total, question) => total + Number(question?.marks ?? 0), 0);
}
