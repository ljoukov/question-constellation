import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const practicePageSource = readFileSync(
	new URL('./[questionId]/practice/+page.svelte', import.meta.url),
	'utf8'
);

describe('whole-answer practice page', () => {
	it('keeps marking guidance out of the attempt state', () => {
		expect(practicePageSource).not.toContain('MarkSchemeDisclosure');
		expect(practicePageSource).not.toContain('Show marking points');
	});

	it('shows marking-point diagnostics only as checked-result content', () => {
		expect(practicePageSource).toContain('aria-label={rewriteCheckPending');
		expect(practicePageSource).toContain("'Checked marking points'");
		expect(practicePageSource).toContain('class="qc-marking-result"');
	});

	it('keeps row status semantic without non-interactive status chips', () => {
		expect(practicePageSource).not.toContain('qc-marking-result-status');
		expect(practicePageSource).toContain("? 'Included: '");
		expect(practicePageSource).toContain(": 'Missing: '");
	});

	it('keeps the result masthead to question metadata', () => {
		const resultHeader = practicePageSource.slice(
			practicePageSource.indexOf('class="qc-practice-result-header"'),
			practicePageSource.indexOf(
				'<section class="qc-practice-original-question"',
				practicePageSource.indexOf('class="qc-practice-result-header"')
			)
		);

		expect(resultHeader).toContain('data.question.sourceRef');
		expect(resultHeader).not.toContain('marking points included');
		expect(resultHeader).not.toContain('marks');
		expect(resultHeader).not.toContain('Use the missing');
		expect(resultHeader).not.toContain('Not quite');
	});

	it('puts a clear incorrect-choice result after the original question', () => {
		expect(practicePageSource.indexOf('class="qc-practice-original-question"')).toBeLessThan(
			practicePageSource.indexOf('class:qc-choice-result-card')
		);
		expect(practicePageSource).toContain("choiceNeedsRetry ? 'Not quite' : 'Correct'");
		expect(practicePageSource).toContain('That answer is not correct.');
		expect(practicePageSource).toContain('class:incorrect={choiceNeedsRetry}');
	});

	it('uses disclosures as secondary controls', () => {
		expect(practicePageSource).not.toContain('qc-practice-reveal-button primary');
		expect(practicePageSource).toContain(
			'class="qc-practice-reveal qc-practice-full-mark-reveal qc-choice-correct-reveal"'
		);
	});
});
