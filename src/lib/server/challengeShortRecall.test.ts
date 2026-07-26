import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	bundledShortRecallPrompt,
	shortRecallPromptContentSha256
} from '$lib/challenges/shortRecallCatalog';
import type { ShortRecallPrompt } from '$lib/challenges/shortRecall';

const mocks = vi.hoisted(() => ({
	queryRows: vi.fn()
}));

vi.mock('./db', () => ({
	queryRows: mocks.queryRows
}));

import {
	getChallengeShortRecallPrompt,
	shortRecallPromptFromRow,
	type ShortRecallPromptRow
} from './challengeShortRecall';

describe('challenge short recall D1 rows', () => {
	beforeEach(() => {
		mocks.queryRows.mockReset();
	});

	it('accepts exact hash-and-version matches for authored and generated content versions', () => {
		const authored = bundledShortRecallPrompt('chemistry-collision-rate');
		expect(authored).not.toBeNull();
		expect(shortRecallPromptFromRow(rowFromPrompt(authored!), authored!)).toEqual(authored);

		const generated: ShortRecallPrompt = {
			challengeId: 'generated-science-test',
			stem: 'The generated evidence supports the ___.',
			canonicalAnswer: 'conclusion',
			acceptedAliases: ['finding'],
			spellingVariants: ['concluison'],
			preferredHiddenStepIndex: 2,
			contentVersion: 'generated-science-short-recall-v1'
		};
		expect(shortRecallPromptFromRow(rowFromPrompt(generated), generated)).toEqual(generated);
	});

	it('fails closed for malformed JSON, stale versions, stale hashes or tampered valid content', () => {
		const expected = bundledShortRecallPrompt('chemistry-collision-rate')!;
		const exact = rowFromPrompt(expected);

		expect(
			shortRecallPromptFromRow({ ...exact, spelling_variants_json: 'not-json' }, expected)
		).toBeNull();
		expect(
			shortRecallPromptFromRow({ ...exact, content_version: 'short-recall-v0' }, expected)
		).toBeNull();
		expect(
			shortRecallPromptFromRow({ ...exact, content_sha256: '0'.repeat(64) }, expected)
		).toBeNull();
		expect(
			shortRecallPromptFromRow(
				{
					...exact,
					prompt_stem: 'Structurally valid stale content has the ___.'
				},
				expected
			)
		).toBeNull();
	});

	it('falls back to the immutable catalog for missing, stale or failed D1 reads', async () => {
		const expected = bundledShortRecallPrompt('chemistry-collision-rate')!;
		mocks.queryRows.mockResolvedValueOnce([]);
		await expect(getChallengeShortRecallPrompt(expected.challengeId)).resolves.toEqual(expected);

		mocks.queryRows.mockResolvedValueOnce([
			{
				...rowFromPrompt(expected),
				prompt_stem: 'A stale row still satisfies the ___.'
			}
		]);
		await expect(getChallengeShortRecallPrompt(expected.challengeId)).resolves.toEqual(expected);

		mocks.queryRows.mockRejectedValueOnce(new Error('D1 unavailable'));
		await expect(getChallengeShortRecallPrompt(expected.challengeId)).resolves.toEqual(expected);
	});

	it('reads an exact D1 snapshot but never queries unknown challenge ids', async () => {
		const expected = bundledShortRecallPrompt('chemistry-collision-rate')!;
		mocks.queryRows.mockResolvedValueOnce([rowFromPrompt(expected)]);
		await expect(getChallengeShortRecallPrompt(expected.challengeId)).resolves.toEqual(expected);
		expect(mocks.queryRows).toHaveBeenCalledWith(expect.stringContaining('content_sha256'), [
			expected.challengeId
		]);

		mocks.queryRows.mockClear();
		await expect(getChallengeShortRecallPrompt('not-in-the-catalog')).resolves.toBeNull();
		expect(mocks.queryRows).not.toHaveBeenCalled();
	});
});

function rowFromPrompt(prompt: ShortRecallPrompt): ShortRecallPromptRow {
	return {
		challenge_id: prompt.challengeId,
		prompt_stem: prompt.stem,
		canonical_answer: prompt.canonicalAnswer,
		accepted_aliases_json: JSON.stringify(prompt.acceptedAliases),
		spelling_variants_json: JSON.stringify(prompt.spellingVariants ?? []),
		preferred_hidden_step_index: prompt.preferredHiddenStepIndex,
		content_version: prompt.contentVersion ?? '',
		content_sha256: shortRecallPromptContentSha256(prompt)
	};
}
