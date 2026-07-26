import {
	bundledShortRecallPrompt,
	shortRecallPromptContentSha256
} from '$lib/challenges/shortRecallCatalog';
import { validateShortRecallPrompt, type ShortRecallPrompt } from '$lib/challenges/shortRecall';
import { queryRows } from './db';

export type ShortRecallPromptRow = {
	challenge_id: string;
	prompt_stem: string;
	canonical_answer: string;
	accepted_aliases_json: string;
	spelling_variants_json: string;
	preferred_hidden_step_index: number;
	content_version: string;
	content_sha256: string;
};

export async function getChallengeShortRecallPrompt(
	challengeId: string
): Promise<ShortRecallPrompt | null> {
	const fallback = bundledShortRecallPrompt(challengeId);
	if (!fallback) return null;

	try {
		const rows = await queryRows<ShortRecallPromptRow>(
			`SELECT
				challenge_id,
				prompt_stem,
				canonical_answer,
				accepted_aliases_json,
				spelling_variants_json,
				preferred_hidden_step_index,
				content_version,
				content_sha256
			 FROM challenge_short_recall_prompts
			 WHERE challenge_id = ?
			 LIMIT 1`,
			[challengeId]
		);
		return shortRecallPromptFromRow(rows[0], fallback) ?? fallback;
	} catch {
		return fallback;
	}
}

export function shortRecallPromptFromRow(
	row: ShortRecallPromptRow | null | undefined,
	expected: ShortRecallPrompt
): ShortRecallPrompt | null {
	if (!row) return null;

	try {
		const expectedSha256 = shortRecallPromptContentSha256(expected);
		if (
			row.challenge_id !== expected.challengeId ||
			row.content_version !== expected.contentVersion ||
			row.content_sha256 !== expectedSha256
		) {
			return null;
		}
		const acceptedAliases = JSON.parse(row.accepted_aliases_json) as unknown;
		const spellingVariants = JSON.parse(row.spelling_variants_json) as unknown;
		if (!Array.isArray(acceptedAliases) || !Array.isArray(spellingVariants)) return null;

		const prompt = validateShortRecallPrompt({
			challengeId: row.challenge_id,
			stem: row.prompt_stem,
			canonicalAnswer: row.canonical_answer,
			acceptedAliases,
			spellingVariants,
			preferredHiddenStepIndex: row.preferred_hidden_step_index,
			contentVersion: row.content_version
		});
		return prompt && shortRecallPromptContentSha256(prompt) === expectedSha256 ? prompt : null;
	} catch {
		return null;
	}
}
