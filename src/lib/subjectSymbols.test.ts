import { describe, expect, it } from 'vitest';
import { subjectSymbol } from './subjectSymbols.js';

describe('subjectSymbol', () => {
	it('uses emoji symbols for public chain subjects', () => {
		expect.assertions(9);

		expect(subjectSymbol('Biology')).toBe('🧬');
		expect(subjectSymbol('Chemistry')).toBe('⚗️');
		expect(subjectSymbol('Physics')).toBe('⚛️');
		expect(subjectSymbol('Computer Science')).toBe('💻');
		expect(subjectSymbol('Geography')).toBe('🌍');
		expect(subjectSymbol('History')).toBe('🏛️');
		expect(subjectSymbol('English Literature')).toBe('📚');
		expect(subjectSymbol('Mathematics')).toBe('🔢');
		expect(subjectSymbol('Combined Science')).toBe('🔬');
	});
});
