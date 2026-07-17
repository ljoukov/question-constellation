import { describe, expect, it } from 'vitest';
import {
	addExternalInputSource,
	constructedAnswerIsIndependent,
	externalInputSourceFromBeforeInput,
	normalizeConstructedAnswerAssistance,
	normalizeExternalInputSources
} from './answerAssistance';

describe('written-answer assistance', () => {
	it('detects paste and drop insertion without classifying typing, dictation or autofill', () => {
		expect(externalInputSourceFromBeforeInput('insertFromPaste')).toBe('paste');
		expect(externalInputSourceFromBeforeInput('insertFromDrop')).toBe('drop');
		expect(externalInputSourceFromBeforeInput('insertText')).toBeNull();
		expect(externalInputSourceFromBeforeInput('insertFromDictation')).toBeNull();
		expect(externalInputSourceFromBeforeInput('insertReplacementText')).toBeNull();
		expect(externalInputSourceFromBeforeInput(null)).toBeNull();
	});

	it('keeps a small canonical, deduplicated set of external-insert sources', () => {
		expect(normalizeExternalInputSources(['drop', 'paste', 'drop', 'unknown'])).toEqual([
			'paste',
			'drop'
		]);
		expect(addExternalInputSource(['paste'], 'paste')).toEqual(['paste']);
		expect(addExternalInputSource(['drop'], 'paste')).toEqual(['paste', 'drop']);
	});

	it('fails closed when either the boolean or a source reports external insertion', () => {
		expect(constructedAnswerIsIndependent(undefined)).toBe(true);
		expect(constructedAnswerIsIndependent({ externalInputDetected: true })).toBe(false);
		expect(constructedAnswerIsIndependent({ externalInputSources: ['paste'] })).toBe(false);
		expect(constructedAnswerIsIndependent({ hintOpened: true })).toBe(false);

		expect(
			normalizeConstructedAnswerAssistance({
				externalInputDetected: false,
				externalInputSources: ['drop']
			})
		).toMatchObject({
			externalInputDetected: true,
			externalInputSources: ['drop']
		});
	});
});
