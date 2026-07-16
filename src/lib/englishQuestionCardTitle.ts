const ENGLISH_TITLE_MAX_WORDS = 9;
const ENGLISH_TITLE_MAX_CHARS = 64;

function cleanText(value: string): string {
	return value
		.replace(/\*\*/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[.?!:;,]+$/g, '')
		.trim();
}

function wordCount(value: string): number {
	return value.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
}

function conciseTitle(value: string): string | null {
	const title = cleanText(value);
	const words = wordCount(title);
	if (words < 2 || words > ENGLISH_TITLE_MAX_WORDS || title.length > ENGLISH_TITLE_MAX_CHARS) {
		return null;
	}
	return title[0].toUpperCase() + title.slice(1);
}

function workFromTopicPath(topicPath: string[]): string | null {
	const usefulParts = topicPath
		.flatMap((part) => part.split(':'))
		.map(cleanText)
		.filter(
			(part) =>
				part.length > 0 &&
				!/^(?:english literature|english language|section [a-z0-9]+|paper \d+)$/i.test(part) &&
				!/^(?:fate|character|theme|extract|comparison|poetry|prose|drama)$/i.test(part)
		);
	return usefulParts.at(-1) ?? null;
}

function focusTitle(focus: string, work: string | null): string | null {
	let candidate = cleanText(focus)
		.replace(/,?\s+in this extract(?:\s+and\s+elsewhere\s+in\s+(?:the\s+)?(?:novel|play|text))?[\s\S]*$/i, '')
		.replace(/,?\s+in the extract(?:\s+and\s+elsewhere\s+in\s+(?:the\s+)?(?:novel|play|text))?[\s\S]*$/i, '')
		.replace(/^the relationship between (.+?) and (.+)$/i, "$1 and $2's relationship")
		.replace(/^you to feel (.+)$/i, '$1');

	if (work) {
		candidate = candidate.replace(/\bin this (?:tragedy|play|novel|text|poem)\b/i, `in ${work}`);
	}

	return conciseTitle(candidate);
}

function comparisonFocus(prompt: string, work: string | null): string | null {
	let candidate = prompt
		.replace(/^Compare\s+(?:the ways in which\s+)?/i, '')
		.replace(/^how\s+/i, '')
		.replace(/^(?:these two extracts|these extracts|these two poems|these poems)\s+present\s+/i, '')
		.replace(/^the writers\s+present\s+/i, '')
		.replace(/^the speakers in these poems\s+express\s+/i, '')
		.replace(/\s+(?:is|are)\s+presented\s+in\s+these two extracts[\s\S]*$/i, '')
		.replace(/\s+in\s+these two extracts[\s\S]*$/i, '')
		.replace(/\s+in\s+these poems[\s\S]*$/i, '')
		.replace(/^the ways in which (?:these two poems|these poems) present\s+/i, '')
		.replace(/^how (?:these two poems|these poems) present\s+/i, '')
		.replace(/[.][\s\S]*$/, '');

	return focusTitle(candidate, work);
}

function otherMomentFocus(prompt: string, work: string | null): string | null {
	const match = prompt.match(
		/^Explore another moment in [\s\S]+?\s+(?:where|in which|which)\s+(.+?)(?:\.|$)/i
	);
	if (!match?.[1]) return null;

	let candidate = cleanText(match[1])
		.replace(/^there is\s+/i, '')
		.replace(/^(something)\s+unexpected\s+happens$/i, '$1 unexpected')
		.replace(/\s+(?:is|are)\s+(?:memorably\s+)?(?:presented|described|revealed)(?:\s+dramatically)?$/i, '')
		.replace(/^the\s+/i, '');
	return focusTitle(candidate, work);
}

function anthologyFocus(prompt: string, work: string | null): string | null {
	const match = prompt.match(
		/^Explore in detail(?: how)? one other poem from your anthology (?:which|that) presents?\s+(.+?)(?:\.|$)/i
	);
	return match?.[1] ? focusTitle(match[1], work) : null;
}

function judgementFocus(prompt: string, work: string | null): string | null {
	const quoted = prompt.match(/^[\s'‘“]+(.+?)[\s'’”]+\s+(?:How far|To what extent)/i)?.[1];
	if (!quoted) return null;

	let claim = cleanText(quoted)
		.replace(new RegExp(`^In ${work?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') ?? '$a'}[,]?\\s+`, 'i'), '')
		.replace(/^there are no\s+/i, '')
		.replace(/^(?:Dickens|Austen|Wells|Stevenson|Bront[eë]|Shakespeare) presents?\s+/i, '');

	const presentedAs = claim.match(/^(.+?)\s+as\s+(?:mainly\s+)?(.+)$/i);
	if (presentedAs) {
		const compressed = `${cleanText(presentedAs[1])}: ${cleanText(presentedAs[2])}`;
		const title = conciseTitle(compressed);
		if (title) return title;
	}

	const changesStory = claim.match(/^The (.+?) (?:completely )?changes (?:the|this) (?:play|novel|story)$/i);
	if (changesStory) return conciseTitle(`${cleanText(changesStory[1])} as a turning point`);

	return focusTitle(claim, work);
}

/**
 * Derive a short, source-grounded focus label for English question rails. Imported English
 * questions often have no card_title, while the science title fallback cannot sensibly name them.
 */
export function deriveEnglishQuestionCardTitle(input: {
	promptText: string;
	topicPath?: string[];
}): string | null {
	const prompt = cleanText(input.promptText);
	const work = workFromTopicPath(input.topicPath ?? []);
	if (/^Compare\b/i.test(prompt)) {
		const title = comparisonFocus(prompt, work);
		if (title) return title;
	}

	const otherMomentTitle = otherMomentFocus(prompt, work);
	if (otherMomentTitle) return otherMomentTitle;

	const anthologyTitle = anthologyFocus(prompt, work);
	if (anthologyTitle) return anthologyTitle;

	const judgementTitle = judgementFocus(prompt, work);
	if (judgementTitle) return judgementTitle;

	const passivePresentation = prompt.match(
		/^Explore how (.+?) is presented in (?:the|this) play(?:\.|$)/i
	)?.[1];
	if (passivePresentation) {
		const title = focusTitle(work ? `${passivePresentation} in ${work}` : passivePresentation, work);
		if (title) return title;
	}

	const encouragedPity = prompt.match(
		/^To what extent does [A-Z][A-Za-z'’-]+ encourage the audience to (?:feel )?pity for (.+?)(?:\?|$)/i
	)?.[1];
	if (encouragedPity) {
		const title = focusTitle(`Pity for ${encouragedPity}`, work);
		if (title) return title;
	}

	const devicePity = prompt.match(
		/^To what extent do (.+?) encourage the audience to pity (.+?)(?:\?|$)/i
	);
	if (devicePity?.[1] && devicePity[2]) {
		const object = /^(?:him|her|them)$/i.test(cleanText(devicePity[2]))
			? ''
			: ` for ${cleanText(devicePity[2])}`;
		const title = focusTitle(`Pity${object} through ${devicePity[1]}`, work);
		if (title) return title;
	}

	const patterns = [
		/\bHow does [A-Z][A-Za-z'’-]+ encourage you to feel (.+?)(?:\?|$)/i,
		/\bHow does [A-Z][A-Za-z'’-]+ present (.+?)(?:\?|$)/i,
		/\bHow does [A-Z][A-Za-z'’-]+ create (.+?)(?:\?|$)/i,
		/\bExplore how [A-Z][A-Za-z'’-]+ presents? (.+?)(?:\?|$)/i,
		/\bExplore the ways in which [A-Z][A-Za-z'’-]+ presents? (.+?)(?:\.\s+Refer\b|\?|$)/i,
		/\bExplore the (?:different )?ways [A-Z][A-Za-z'’-]+ portrays? (.+?)(?:\.\s+Refer\b|\?|$)/i,
		/\bIn what ways does [A-Z][A-Za-z'’-]+ present (.+?)(?:\?|$)/i
	];

	for (const pattern of patterns) {
		const match = prompt.match(pattern);
		const title = match?.[1] ? focusTitle(match[1], work) : null;
		if (title) return title;
	}

	return null;
}
