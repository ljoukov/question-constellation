export const ocrEnglishLiteratureOptions = {
	modernTexts: [
		'Anita and Me',
		'Never Let Me Go',
		'Animal Farm',
		'An Inspector Calls',
		'Leave Taking',
		'DNA'
	],
	nineteenthCenturyNovels: [
		'Great Expectations',
		'A Christmas Carol',
		'Pride and Prejudice',
		'The War of the Worlds',
		'The Strange Case of Dr Jekyll and Mr Hyde',
		'Jane Eyre'
	],
	poetryClusters: ['Love and Relationships', 'Conflict', 'Youth and Age'],
	shakespearePlays: [
		'Romeo and Juliet',
		'The Merchant of Venice',
		'Macbeth',
		'Much Ado About Nothing'
	]
} as const;

export type EnglishLiteratureSelections = {
	board: 'OCR';
	specificationCode: 'J352';
	modernText: string | null;
	nineteenthCenturyNovel: string | null;
	poetryCluster: string | null;
	shakespearePlay: string | null;
};

export type EnglishLiteratureSelectionInput = Omit<
	EnglishLiteratureSelections,
	'board' | 'specificationCode'
>;

export function emptyOcrEnglishLiteratureSelections(): EnglishLiteratureSelections {
	return {
		board: 'OCR',
		specificationCode: 'J352',
		modernText: null,
		nineteenthCenturyNovel: null,
		poetryCluster: null,
		shakespearePlay: null
	};
}

export function parseOcrEnglishLiteratureSelections(
	values: Record<keyof EnglishLiteratureSelectionInput, FormDataEntryValue | null>
): EnglishLiteratureSelectionInput | null {
	const modernText = parseOption(values.modernText, ocrEnglishLiteratureOptions.modernTexts);
	const nineteenthCenturyNovel = parseOption(
		values.nineteenthCenturyNovel,
		ocrEnglishLiteratureOptions.nineteenthCenturyNovels
	);
	const poetryCluster = parseOption(
		values.poetryCluster,
		ocrEnglishLiteratureOptions.poetryClusters
	);
	const shakespearePlay = parseOption(
		values.shakespearePlay,
		ocrEnglishLiteratureOptions.shakespearePlays
	);

	if (
		modernText === undefined ||
		nineteenthCenturyNovel === undefined ||
		poetryCluster === undefined ||
		shakespearePlay === undefined
	) {
		return null;
	}

	return { modernText, nineteenthCenturyNovel, poetryCluster, shakespearePlay };
}

function parseOption(
	value: FormDataEntryValue | null,
	options: readonly string[]
): string | null | undefined {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	if (!normalized) return null;
	return options.includes(normalized) ? normalized : undefined;
}
