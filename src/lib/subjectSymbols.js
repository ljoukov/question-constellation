const SUBJECT_SYMBOLS = /** @type {[RegExp, string][]} */ ([
	[/biology/i, '🧬'],
	[/chemistry/i, '⚗️'],
	[/physics/i, '⚛️'],
	[/computer/i, '💻'],
	[/geography/i, '🌍'],
	[/history/i, '🏛️'],
	[/english/i, '📚'],
	[/math|statistics/i, '🔢'],
	[/science/i, '🔬']
]);

/**
 * Return the compact visual symbol used in public question-bank cards.
 *
 * Keep this as an emoji, not a text abbreviation: the browse cards reserve a
 * large icon-sized slot for it.
 *
 * @param {string | null | undefined} subject
 */
export function subjectSymbol(subject) {
	const value = String(subject ?? '');
	const match = SUBJECT_SYMBOLS.find(([pattern]) => pattern.test(value));
	return match?.[1] ?? '✨';
}
