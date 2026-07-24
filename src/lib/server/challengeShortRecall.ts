import { bundledShortRecallPrompt } from '$lib/challenges/shortRecallCatalog';
import {
	SHORT_RECALL_CONTENT_VERSION,
	validateShortRecallPrompt,
	type ShortRecallPrompt
} from '$lib/challenges/shortRecall';
import { queryRows } from './db';

type ShortRecallPromptRow = {
	challenge_id: string;
	prompt_stem: string;
	canonical_answer: string;
	accepted_aliases_json: string;
	spelling_variants_json: string;
	preferred_hidden_step_index: number;
	content_version: string;
};

export async function getChallengeShortRecallPrompt(
	challengeId: string
): Promise<ShortRecallPrompt | null> {
	const fallback = bundledShortRecallPrompt(challengeId);

	try {
		const rows = await queryRows<ShortRecallPromptRow>(
			`SELECT
				challenge_id,
				prompt_stem,
				canonical_answer,
				accepted_aliases_json,
				spelling_variants_json,
				preferred_hidden_step_index,
				content_version
			 FROM challenge_short_recall_prompts
			 WHERE challenge_id = ?
			 LIMIT 1`,
			[challengeId]
		);
		return shortRecallPromptFromRow(rows[0]) ?? fallback;
	} catch {
		return fallback;
	}
}

export function shortRecallPromptFromRow(
	row: ShortRecallPromptRow | null | undefined
): ShortRecallPrompt | null {
	if (!row) return null;

	try {
		const acceptedAliases = JSON.parse(row.accepted_aliases_json) as unknown;
		const spellingVariants = JSON.parse(row.spelling_variants_json) as unknown;
		if (!Array.isArray(acceptedAliases) || !Array.isArray(spellingVariants)) return null;

		return validateShortRecallPrompt({
			challengeId: row.challenge_id,
			stem: row.prompt_stem,
			canonicalAnswer: row.canonical_answer,
			acceptedAliases,
			spellingVariants,
			preferredHiddenStepIndex: row.preferred_hidden_step_index,
			contentVersion: row.content_version || SHORT_RECALL_CONTENT_VERSION
		});
	} catch {
		return null;
	}
}
