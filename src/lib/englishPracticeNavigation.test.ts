import { describe, expect, it } from 'vitest';
import { englishPracticeContext, withEnglishPracticeContext } from './englishPracticeNavigation';

describe('English guided-practice navigation context', () => {
	it('preserves a valid entry and internal return path across stage URLs', () => {
		const search = new URLSearchParams({
			entry: 'question',
			returnTo: '/questions/ocr-1?view=result'
		});

		expect(withEnglishPracticeContext('/questions/ocr-1/practice/step-by-step/task', search)).toBe(
			'/questions/ocr-1/practice/step-by-step/task?entry=question&returnTo=%2Fquestions%2Focr-1%3Fview%3Dresult'
		);
	});

	it('drops external, protocol-relative and malformed context values', () => {
		for (const returnTo of ['https://example.test', '//example.test/path', 'javascript:alert(1)']) {
			const context = englishPracticeContext(
				new URLSearchParams({ entry: 'not valid!', returnTo })
			);
			expect(context.toString()).toBe('');
		}
	});

	it('leaves a context-free public URL unchanged', () => {
		expect(withEnglishPracticeContext('/questions/ocr-1/practice/step-by-step/task', new URLSearchParams())).toBe(
			'/questions/ocr-1/practice/step-by-step/task'
		);
	});
});
