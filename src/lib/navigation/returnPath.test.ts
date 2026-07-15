import { describe, expect, it } from 'vitest';
import { safeInternalReturnPath } from './returnPath';

describe('safeInternalReturnPath', () => {
	it('keeps local app routes including their query', () => {
		expect(safeInternalReturnPath('/subjects/biology?view=progress')).toBe(
			'/subjects/biology?view=progress'
		);
	});

	it('rejects external and malformed destinations', () => {
		expect(safeInternalReturnPath('https://example.com')).toBeNull();
		expect(safeInternalReturnPath('//example.com/path')).toBeNull();
		expect(safeInternalReturnPath('/subjects/biology\nnext')).toBeNull();
	});
});
