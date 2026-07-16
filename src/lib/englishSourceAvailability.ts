type EnglishSourceAvailability = {
	sourcePaperUrl?: string | null;
	signedIn: boolean;
	prompt: string;
	context: string;
	hasAssets: boolean;
};

/**
 * Signed-in practice should link to the paper only when the task depends on
 * printed source material that is not already present on the page.
 */
export function shouldShowEnglishSourcePaper({
	sourcePaperUrl,
	signedIn,
	prompt,
	context,
	hasAssets
}: EnglishSourceAvailability) {
	if (!sourcePaperUrl) return false;
	if (!signedIn) return true;

	const needsPrintedSource =
		/\b(?:extracts?|source texts?|read the (?:two )?(?:poems|passages|sources))\b/i.test(
			`${context} ${prompt}`
		);
	const hasEmbeddedSource =
		hasAssets || context.trim().length >= 500 || prompt.trim().length >= 800;
	return needsPrintedSource && !hasEmbeddedSource;
}
