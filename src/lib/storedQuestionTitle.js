import { deriveEnglishQuestionCardTitle } from './englishQuestionCardTitle.ts';
import { deriveQuestionCardTitle, questionCardTitleIssues } from './questionCardTitle.js';

/** @param {string | null | undefined} raw @param {any} fallback */
function parseJson(raw, fallback) {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw);
	} catch {
		return fallback;
	}
}

/**
 * One canonical title hydrator for both materialized question-bank cards and
 * live question pages. Reviewed metadata wins; derivation is only a fallback.
 *
 * @param {{
 *   id:string,
 *   subject?:string|null,
 *   metadataJson?:string|null,
 *   promptText:string,
 *   selfContainedPromptText?:string|null,
 *   topicPathJson?:string|null
 * }} input
 */
export function storedQuestionTitle(input) {
	const metadata = parseJson(input.metadataJson, {});
	const genericTitle = deriveQuestionCardTitle({
		cardTitle: metadata.card_title ?? metadata.title,
		promptText: input.promptText,
		selfContainedPromptText: input.selfContainedPromptText,
		fallback: input.id
	});
	if (genericTitle !== 'Unlabelled science question') return genericTitle;

	if (/^English (?:Language|Literature)$/i.test(input.subject ?? '')) {
		return (
			deriveEnglishQuestionCardTitle({
				promptText: input.promptText,
				topicPath: parseJson(input.topicPathJson, [])
			}) ?? genericTitle
		);
	}

	return genericTitle;
}

/**
 * Validate the title that learners will actually see. Science titles use the
 * stricter semantic-card rules; English titles have their own concise-focus
 * derivation and therefore need a small, format-specific guard instead.
 *
 * @param {{
 *   title:string,
 *   subject?:string|null,
 *   promptText?:string|null,
 *   selfContainedPromptText?:string|null,
 *   answerText?:string|null
 * }} input
 */
export function storedQuestionTitleIssues(input) {
	const title = String(input.title ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!/^English (?:Language|Literature)$/i.test(input.subject ?? '')) {
		return questionCardTitleIssues(title, {
			promptText: [input.promptText, input.selfContainedPromptText].filter(Boolean).join('\n'),
			answerText: input.answerText
		});
	}

	const issues = [];
	const words = title.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
	if (!title) issues.push('missing');
	if (title.length > 64) issues.push('too_long');
	if (words < 2) issues.push('too_few_words');
	if (words > 9) issues.push('too_many_words');
	if (
		/^(?:unlabelled(?:\s+science\s+question)?|gcse exam question|question(?:\s+\d+)?)$/i.test(title)
	) {
		issues.push('mechanics_only');
	}
	if (/\.\.\.|\u2026/.test(title)) issues.push('truncated');
	return [...new Set(issues)];
}
