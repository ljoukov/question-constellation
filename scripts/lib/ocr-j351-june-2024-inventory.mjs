/** @typedef {{ sourceQuestionRef: string, marks: number }} OcrQuestionRow */
/**
 * @typedef {Readonly<{
 *   questionCount: number,
 *   markTotal: number,
 *   questions: readonly Readonly<OcrQuestionRow>[]
 * }>} OcrOriginalInventory
 */
/** @typedef {Readonly<Record<string, OcrOriginalInventory>>} OcrOriginalInventories */
/** @typedef {{ sourceDocumentId: string, questions?: unknown }} InventoryAuditInput */
/**
 * @typedef {{
 *   sourceDocumentId: string,
 *   questions?: unknown,
 *   inventories: OcrOriginalInventories,
 *   policy: string
 * }} ExactInventoryAuditInput
 */
/** @typedef {{ sourceQuestionRef: string, expectedMarks: number, actualMarks: number }} MarkMismatch */
/**
 * @typedef {{
 *   questionCountExact: boolean,
 *   markTotalExact: boolean,
 *   refsExact: boolean,
 *   noDuplicateRefs: boolean,
 *   refOrderExact: boolean,
 *   marksExact: boolean
 * }} InventoryInvariants
 */
/**
 * @typedef {{
 *   applies: false,
 *   status: 'not-applicable',
 *   sourceDocumentId: string
 * }} NotApplicableInventoryAudit
 */
/**
 * @typedef {{
 *   applies: true,
 *   status: 'passed' | 'failed',
 *   policy: string,
 *   sourceDocumentId: string,
 *   expected: {
 *     questionCount: number,
 *     markTotal: number,
 *     questions: readonly Readonly<OcrQuestionRow>[]
 *   },
 *   actual: {
 *     questionCount: number,
 *     markTotal: number | null,
 *     questions: OcrQuestionRow[]
 *   },
 *   missingRefs: string[],
 *   unexpectedRefs: string[],
 *   duplicateRefs: string[],
 *   markMismatches: MarkMismatch[],
 *   invariants: InventoryInvariants
 * }} ApplicableInventoryAudit
 */
/** @typedef {NotApplicableInventoryAudit | ApplicableInventoryAudit} InventoryAudit */

/**
 * @param {OcrQuestionRow[]} rows
 * @returns {readonly Readonly<OcrQuestionRow>[]}
 */
const freezeRows = (rows) => Object.freeze(rows.map((row) => Object.freeze({ ...row })));

/** @type {OcrOriginalInventories} */
export const OCR_J351_JUNE_2024_ORIGINAL_INVENTORIES = Object.freeze({
	'ocr-j351-01-qp-jun24': Object.freeze({
		questionCount: 8,
		markTotal: 120,
		questions: freezeRows([
			{ sourceQuestionRef: '01.1a', marks: 1 },
			{ sourceQuestionRef: '01.1b', marks: 1 },
			{ sourceQuestionRef: '01.1c', marks: 2 },
			{ sourceQuestionRef: '02.0', marks: 6 },
			{ sourceQuestionRef: '03.0', marks: 12 },
			{ sourceQuestionRef: '04.0', marks: 18 },
			{ sourceQuestionRef: '05.0', marks: 40 },
			{ sourceQuestionRef: '06.0', marks: 40 }
		])
	}),
	'ocr-j351-02-qp-jun24': Object.freeze({
		questionCount: 7,
		markTotal: 120,
		questions: freezeRows([
			{ sourceQuestionRef: '01.1a', marks: 3 },
			{ sourceQuestionRef: '01.1b', marks: 1 },
			{ sourceQuestionRef: '02.1', marks: 6 },
			{ sourceQuestionRef: '03.1', marks: 12 },
			{ sourceQuestionRef: '04.1', marks: 18 },
			{ sourceQuestionRef: '05.1', marks: 40 },
			{ sourceQuestionRef: '06.1', marks: 40 }
		])
	})
});

/** @type {OcrOriginalInventories} */
export const OCR_J352_JUNE_2024_ORIGINAL_INVENTORIES = Object.freeze({
	'ocr-j352-01-qp-jun24': Object.freeze({
		questionCount: 24,
		markTotal: 720,
		questions: freezeRows([
			{ sourceQuestionRef: '01.1a', marks: 20 },
			{ sourceQuestionRef: '01.1b', marks: 20 },
			{ sourceQuestionRef: '02.1a', marks: 20 },
			{ sourceQuestionRef: '02.1b', marks: 20 },
			{ sourceQuestionRef: '03.1a', marks: 20 },
			{ sourceQuestionRef: '03.1b', marks: 20 },
			{ sourceQuestionRef: '04.1a', marks: 20 },
			{ sourceQuestionRef: '04.1b', marks: 20 },
			{ sourceQuestionRef: '05.1a', marks: 20 },
			{ sourceQuestionRef: '05.1b', marks: 20 },
			{ sourceQuestionRef: '06.1a', marks: 20 },
			{ sourceQuestionRef: '06.1b', marks: 20 },
			{ sourceQuestionRef: '07.1', marks: 40 },
			{ sourceQuestionRef: '08.1', marks: 40 },
			{ sourceQuestionRef: '09.1', marks: 40 },
			{ sourceQuestionRef: '10.1', marks: 40 },
			{ sourceQuestionRef: '11.1', marks: 40 },
			{ sourceQuestionRef: '12.1', marks: 40 },
			{ sourceQuestionRef: '13.1', marks: 40 },
			{ sourceQuestionRef: '14.1', marks: 40 },
			{ sourceQuestionRef: '15.1', marks: 40 },
			{ sourceQuestionRef: '16.1', marks: 40 },
			{ sourceQuestionRef: '17.1', marks: 40 },
			{ sourceQuestionRef: '18.1', marks: 40 }
		])
	})
});

/** @type {OcrOriginalInventories} */
export const OCR_ENGLISH_JUNE_2024_ORIGINAL_INVENTORIES = Object.freeze({
	...OCR_J351_JUNE_2024_ORIGINAL_INVENTORIES,
	...OCR_J352_JUNE_2024_ORIGINAL_INVENTORIES
});

/**
 * @param {InventoryAuditInput} input
 * @returns {InventoryAudit}
 */
export function auditOcrJ351June2024OriginalInventory(input) {
	return auditExactOriginalInventory({
		...input,
		inventories: OCR_J351_JUNE_2024_ORIGINAL_INVENTORIES,
		policy: 'ocr_j351_june_2024_exact_original_inventory_v1'
	});
}

/**
 * @param {InventoryAuditInput} input
 * @returns {InventoryAudit}
 */
export function auditOcrEnglishJune2024OriginalInventory(input) {
	return auditExactOriginalInventory({
		...input,
		inventories: OCR_ENGLISH_JUNE_2024_ORIGINAL_INVENTORIES,
		policy: String(input?.sourceDocumentId ?? '').startsWith('ocr-j352-')
			? 'ocr_j352_june_2024_exact_original_inventory_v1'
			: 'ocr_j351_june_2024_exact_original_inventory_v1'
	});
}

/**
 * @param {ExactInventoryAuditInput} input
 * @returns {InventoryAudit}
 */
function auditExactOriginalInventory({ sourceDocumentId, questions, inventories, policy }) {
	const expected = inventories[sourceDocumentId] ?? null;
	if (!expected) {
		return {
			applies: false,
			status: 'not-applicable',
			sourceDocumentId
		};
	}

	const actualQuestions = Array.isArray(questions) ? /** @type {unknown[]} */ (questions) : [];
	const actualRows = actualQuestions.map((question) => {
		const row = /** @type {{ sourceQuestionRef?: unknown, marks?: unknown } | null} */ (question);
		return {
			sourceQuestionRef: String(row?.sourceQuestionRef ?? ''),
			marks: Number(row?.marks)
		};
	});
	/** @type {Map<string, number[]>} */
	const actualByRef = new Map();
	for (const row of actualRows) {
		if (!actualByRef.has(row.sourceQuestionRef)) actualByRef.set(row.sourceQuestionRef, []);
		/** @type {number[]} */ (actualByRef.get(row.sourceQuestionRef)).push(row.marks);
	}
	const expectedByRef = new Map(
		expected.questions.map((row) => [row.sourceQuestionRef, row.marks])
	);
	const missingRefs = expected.questions
		.map((row) => row.sourceQuestionRef)
		.filter((ref) => !actualByRef.has(ref));
	const unexpectedRefs = actualRows
		.map((row) => row.sourceQuestionRef)
		.filter((ref) => !expectedByRef.has(ref));
	const duplicateRefs = [...actualByRef.entries()]
		.filter(([, marks]) => marks.length > 1)
		.map(([ref]) => ref);
	const markMismatches = expected.questions.flatMap((row) => {
		const actualMarks = actualByRef.get(row.sourceQuestionRef);
		if (!actualMarks || actualMarks.length !== 1 || actualMarks[0] === row.marks) return [];
		return [
			{
				sourceQuestionRef: row.sourceQuestionRef,
				expectedMarks: row.marks,
				actualMarks: actualMarks[0]
			}
		];
	});
	const expectedRefOrder = expected.questions.map((row) => row.sourceQuestionRef);
	const actualRefOrder = actualRows.map((row) => row.sourceQuestionRef);
	const finiteMarks = actualRows.every((row) => Number.isFinite(row.marks));
	const actualMarkTotal = finiteMarks
		? actualRows.reduce((total, row) => total + row.marks, 0)
		: null;
	const invariants = {
		questionCountExact: actualRows.length === expected.questionCount,
		markTotalExact: actualMarkTotal === expected.markTotal,
		refsExact: missingRefs.length === 0 && unexpectedRefs.length === 0,
		noDuplicateRefs: duplicateRefs.length === 0,
		refOrderExact: JSON.stringify(actualRefOrder) === JSON.stringify(expectedRefOrder),
		marksExact: markMismatches.length === 0 && finiteMarks
	};
	const passed = Object.values(invariants).every(Boolean);

	return {
		applies: true,
		status: passed ? 'passed' : 'failed',
		policy,
		sourceDocumentId,
		expected: {
			questionCount: expected.questionCount,
			markTotal: expected.markTotal,
			questions: expected.questions
		},
		actual: {
			questionCount: actualRows.length,
			markTotal: actualMarkTotal,
			questions: actualRows
		},
		missingRefs,
		unexpectedRefs,
		duplicateRefs,
		markMismatches,
		invariants
	};
}

/**
 * @param {InventoryAuditInput} input
 * @returns {InventoryAudit}
 */
export function assertOcrJ351June2024OriginalInventory(input) {
	const audit = auditOcrJ351June2024OriginalInventory(input);
	if (!audit.applies || audit.status === 'passed') return audit;
	const error = /** @type {Error & { code?: string, audit?: InventoryAudit }} */ (
		new Error(`OCR J351 June 2024 original inventory lock failed: ${JSON.stringify(audit)}`)
	);
	error.code = 'OCR_J351_JUNE_2024_ORIGINAL_INVENTORY_MISMATCH';
	error.audit = audit;
	throw error;
}

/**
 * @param {InventoryAuditInput} input
 * @returns {InventoryAudit}
 */
export function assertOcrEnglishJune2024OriginalInventory(input) {
	const audit = auditOcrEnglishJune2024OriginalInventory(input);
	if (!audit.applies || audit.status === 'passed') return audit;
	const error = /** @type {Error & { code?: string, audit?: InventoryAudit }} */ (
		new Error(`OCR English June 2024 original inventory lock failed: ${JSON.stringify(audit)}`)
	);
	error.code = 'OCR_ENGLISH_JUNE_2024_ORIGINAL_INVENTORY_MISMATCH';
	error.audit = audit;
	throw error;
}
