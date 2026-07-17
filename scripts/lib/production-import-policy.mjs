import { OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_SOURCE_IDS } from './ocr-english-copyright-subsets.mjs';
import {
	SELECTIVE_PAPER_COHORT_ID,
	SELECTIVE_PAPER_COHORT_LOCK_PATH,
	SELECTIVE_PAPER_COHORT_LOCK_SHA256
} from './selective-paper-cohort-lock.mjs';

export const REQUIRED_PRODUCTION_MODEL = 'gpt-5.6-sol';
export const REQUIRED_PRODUCTION_THINKING_LEVEL = 'max';
const OCR_COPYRIGHT_SUBSET_SOURCE_IDS = new Set(OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_SOURCE_IDS);

/**
 * @param {{
 *   importToD1: boolean,
 *   phases: Record<string, {model: string, thinkingLevel: string}>
 * }} input
 */
export function assertRealImportModelPolicy({ importToD1, phases }) {
	if (!importToD1) return;
	for (const [phase, run] of Object.entries(phases)) {
		if (
			run?.model !== REQUIRED_PRODUCTION_MODEL ||
			run?.thinkingLevel !== REQUIRED_PRODUCTION_THINKING_LEVEL
		) {
			throw new Error(
				`A real --import requires ${phase} to use ${REQUIRED_PRODUCTION_MODEL} with ${REQUIRED_PRODUCTION_THINKING_LEVEL} reasoning.`
			);
		}
	}
}

/**
 * @param {{
 *   importToD1: boolean,
 *   extractionJudgeEnabled: boolean,
 *   d1ConflictCheckEnabled: boolean
 * }} input
 */
export function assertRealImportGatePolicy({
	importToD1,
	extractionJudgeEnabled,
	d1ConflictCheckEnabled
}) {
	if (!importToD1) return;
	if (!extractionJudgeEnabled) {
		throw new Error('A real --import cannot opt out of the independent extraction judge.');
	}
	if (!d1ConflictCheckEnabled) {
		throw new Error('A real --import cannot opt out of the existing-D1 conflict check.');
	}
}

/**
 * `--allow-dropped-questions` is a diagnostic import-ready escape hatch and is
 * never valid for a write. The narrower source-copyright hold-out flag is
 * allowed only for the three reviewed OCR papers after their exact tracked
 * cohort inputs have been verified.
 *
 * @param {{
 *   importToD1: boolean,
 *   sourceDocumentId: string,
 *   unpublishableSourceDropsAllowed?: boolean,
 *   droppedQuestionsAllowed?: boolean,
 *   cohortLockEvidence?: Record<string, any> | null
 * }} input
 */
export function assertRealImportSourceDropPolicy({
	importToD1,
	sourceDocumentId,
	unpublishableSourceDropsAllowed = false,
	droppedQuestionsAllowed = false,
	cohortLockEvidence = null
}) {
	if (!importToD1) return;
	if (droppedQuestionsAllowed) {
		throw new Error(
			'A real --import cannot use --allow-dropped-questions or import a partial import-ready subset.'
		);
	}
	if (!unpublishableSourceDropsAllowed) return;
	if (!OCR_COPYRIGHT_SUBSET_SOURCE_IDS.has(sourceDocumentId)) {
		throw new Error(
			'--allow-unpublishable-source-drops on a real --import is limited to the three reviewed OCR June 2024 copyright-subset papers.'
		);
	}
	if (
		cohortLockEvidence?.path !== SELECTIVE_PAPER_COHORT_LOCK_PATH ||
		cohortLockEvidence?.sha256 !== SELECTIVE_PAPER_COHORT_LOCK_SHA256 ||
		cohortLockEvidence?.cohortId !== SELECTIVE_PAPER_COHORT_ID ||
		cohortLockEvidence?.sourceDocumentId !== sourceDocumentId
	) {
		throw new Error(
			'--allow-unpublishable-source-drops on a real --import requires the verified canonical selective-paper cohort lock.'
		);
	}
}

/**
 * @param {any} run
 * @param {{model: string, thinkingLevel: string}} expected
 */
export function codexRunMatchesModelPolicy(run, expected) {
	return (
		run?.status === 'passed' &&
		Boolean(run?.threadId) &&
		run?.model === expected?.model &&
		run?.thinkingLevel === expected?.thinkingLevel
	);
}
