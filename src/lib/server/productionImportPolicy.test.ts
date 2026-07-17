import { describe, expect, it } from 'vitest';
import {
	assertRealImportGatePolicy,
	assertRealImportModelPolicy,
	assertRealImportSourceDropPolicy,
	codexRunMatchesModelPolicy,
	REQUIRED_PRODUCTION_MODEL,
	REQUIRED_PRODUCTION_THINKING_LEVEL
} from '../../../scripts/lib/production-import-policy.mjs';
import { OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_SOURCE_IDS } from '../../../scripts/lib/ocr-english-copyright-subsets.mjs';
import {
	SELECTIVE_PAPER_COHORT_ID,
	SELECTIVE_PAPER_COHORT_LOCK_PATH,
	SELECTIVE_PAPER_COHORT_LOCK_SHA256
} from '../../../scripts/lib/selective-paper-cohort-lock.mjs';

function requiredPhases() {
	return Object.fromEntries(
		['extraction', 'extraction judge', 'answer chains', 'solvability'].map((phase) => [
			phase,
			{
				model: REQUIRED_PRODUCTION_MODEL,
				thinkingLevel: REQUIRED_PRODUCTION_THINKING_LEVEL
			}
		])
	);
}

describe('real production import model policy', () => {
	it('accepts the exact required model and thinking level for every model phase', () => {
		expect(() =>
			assertRealImportModelPolicy({ importToD1: true, phases: requiredPhases() })
		).not.toThrow();
	});

	it('rejects an arbitrary solvability model before a real import can run', () => {
		const phases = requiredPhases();
		phases.solvability.model = 'gpt-5.5';
		expect(() => assertRealImportModelPolicy({ importToD1: true, phases })).toThrow(
			/solvability.*gpt-5\.6-sol.*max/
		);
	});

	it('rejects a reduced thinking level on any real-import phase', () => {
		const phases = requiredPhases();
		phases['extraction judge'].thinkingLevel = 'high';
		expect(() => assertRealImportModelPolicy({ importToD1: true, phases })).toThrow(
			/extraction judge.*gpt-5\.6-sol.*max/
		);
	});

	it('keeps diagnostic and dry-run model selection configurable', () => {
		const phases = requiredPhases();
		phases.solvability.model = 'diagnostic-model';
		phases.extraction.thinkingLevel = 'low';
		expect(() => assertRealImportModelPolicy({ importToD1: false, phases })).not.toThrow();
	});

	it('refuses to reuse a passed phase whose actual run used another model or thinking level', () => {
		const expected = requiredPhases().solvability;
		const run = {
			status: 'passed',
			threadId: 'thread-solvability',
			model: REQUIRED_PRODUCTION_MODEL,
			thinkingLevel: REQUIRED_PRODUCTION_THINKING_LEVEL
		};
		expect(codexRunMatchesModelPolicy(run, expected)).toBe(true);
		expect(codexRunMatchesModelPolicy({ ...run, model: 'gpt-5.5' }, expected)).toBe(false);
		expect(codexRunMatchesModelPolicy({ ...run, thinkingLevel: 'high' }, expected)).toBe(false);
	});

	it('rejects real-import attempts that skip the extraction judge or existing-D1 check', () => {
		expect(() =>
			assertRealImportGatePolicy({
				importToD1: true,
				extractionJudgeEnabled: false,
				d1ConflictCheckEnabled: true
			})
		).toThrow(/cannot opt out of the independent extraction judge/);
		expect(() =>
			assertRealImportGatePolicy({
				importToD1: true,
				extractionJudgeEnabled: true,
				d1ConflictCheckEnabled: false
			})
		).toThrow(/cannot opt out of the existing-D1 conflict check/);
	});

	it('always rejects the diagnostic import-ready drop escape hatch on a real import', () => {
		expect(() =>
			assertRealImportSourceDropPolicy({
				importToD1: true,
				sourceDocumentId: 'ocr-j351-01-qp-jun24',
				droppedQuestionsAllowed: true,
				cohortLockEvidence: canonicalLockEvidence('ocr-j351-01-qp-jun24')
			})
		).toThrow(/cannot use --allow-dropped-questions/);
	});

	it.each(OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_SOURCE_IDS)(
		'allows the exact source-copyright hold-out flag for locked paper %s',
		(sourceDocumentId) => {
			expect(() =>
				assertRealImportSourceDropPolicy({
					importToD1: true,
					sourceDocumentId,
					unpublishableSourceDropsAllowed: true,
					cohortLockEvidence: canonicalLockEvidence(sourceDocumentId)
				})
			).not.toThrow();
		}
	);

	it('rejects the source-copyright flag for any other paper or without the verified lock', () => {
		expect(() =>
			assertRealImportSourceDropPolicy({
				importToD1: true,
				sourceDocumentId: 'aqa-history-paper',
				unpublishableSourceDropsAllowed: true,
				cohortLockEvidence: canonicalLockEvidence('aqa-history-paper')
			})
		).toThrow(/limited to the three reviewed OCR/);
		expect(() =>
			assertRealImportSourceDropPolicy({
				importToD1: true,
				sourceDocumentId: 'ocr-j351-01-qp-jun24',
				unpublishableSourceDropsAllowed: true,
				cohortLockEvidence: null
			})
		).toThrow(/verified canonical selective-paper cohort lock/);
	});

	it('allows diagnostic runs to omit production-only gates', () => {
		expect(() =>
			assertRealImportGatePolicy({
				importToD1: false,
				extractionJudgeEnabled: false,
				d1ConflictCheckEnabled: false
			})
		).not.toThrow();
		expect(() =>
			assertRealImportSourceDropPolicy({
				importToD1: false,
				sourceDocumentId: 'diagnostic-paper',
				unpublishableSourceDropsAllowed: true,
				droppedQuestionsAllowed: true
			})
		).not.toThrow();
	});
});

function canonicalLockEvidence(sourceDocumentId: string) {
	return {
		path: SELECTIVE_PAPER_COHORT_LOCK_PATH,
		sha256: SELECTIVE_PAPER_COHORT_LOCK_SHA256,
		cohortId: SELECTIVE_PAPER_COHORT_ID,
		sourceDocumentId
	};
}
