const INLINE_MATH = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+\$|\\\([^\n]+?\\\)/g;

function delimitedMathRuns(value: string) {
	return Array.from(value.matchAll(new RegExp(INLINE_MATH.source, INLINE_MATH.flags)));
}

/**
 * Equation blocks can contain either one TeX expression or a centred, printed
 * word equation with small inline TeX runs. Only the former should be handed
 * to KaTeX as one display expression.
 */
export function equationBlockUsesDisplayMath(text: string): boolean {
	const value = text.trim();
	if (!value) return false;
	const runs = delimitedMathRuns(value);
	if (runs.length > 0) {
		return runs.length === 1 && runs[0].index === 0 && runs[0][0].length === value.length;
	}

	const withoutCommands = value.replace(/\\[A-Za-z]+/g, '');
	if (/[A-Za-z]{4,}/.test(withoutCommands)) return false;

	// Undelimited TeX is the established representation for a pure formula.
	if (/\\[A-Za-z]+/.test(value)) return true;

	// Printed word equations and named quantities should retain ordinary text
	// spacing and letterforms instead of becoming a run of italic variables.
	return true;
}
