import rawPastPaperData from './gcsePastPaperData.json';

export type PastPaperBoardId = 'aqa' | 'edexcel' | 'ocr' | 'wjec';

export type PastPaperDocumentType = 'questionPaper' | 'markScheme' | 'insert' | 'other';

export type PastPaperDocument = {
	type: PastPaperDocumentType;
	label: string;
	url: string;
};

export type PastPaperEntry = {
	id: string;
	boardId: PastPaperBoardId;
	boardName: string;
	subject: string;
	subjectSlug: string;
	tier: string | null;
	category: string;
	year: number;
	series: string;
	paper: string;
	documents: PastPaperDocument[];
};

export type PastPaperSubjectPage = {
	id: string;
	boardId: PastPaperBoardId;
	boardName: string;
	category: string;
	subject: string;
	subjectSlug: string;
	tier: string | null;
	title: string;
	description: string;
	entries: PastPaperEntry[];
};

export type PastPaperBoardSummary = {
	id: PastPaperBoardId;
	name: string;
	subjectPageCount: number;
	entryCount: number;
	documentCellCount: number;
};

export type PastPaperSubjectIndex = {
	id: string;
	boardId: PastPaperBoardId;
	boardName: string;
	category: string;
	subject: string;
	subjectSlug: string;
	tier: string | null;
	localPath: string;
	entryCount: number;
	documentCount: number;
	firstYear: number;
	latestYear: number;
};

export type PastPaperDownloadRow = PastPaperEntry & {
	pageId: string;
	pageLabel: string;
	localPath: string;
	paperLocalPath: string;
};

export type GcsePastPaperData = {
	summary: {
		boardCount: number;
		subjectPageCount: number;
		entryCount: number;
		documentCellCount: number;
		uniqueDocumentUrlCount: number;
		verification: {
			skipped: boolean;
			checkedUrlCount: number;
			okUrlCount: number;
			statusCounts: Record<string, number>;
			brokenUrls: unknown[];
		};
		urlFixes: Array<{ url: string; note: string }>;
		boards: PastPaperBoardSummary[];
	};
	pages: PastPaperSubjectPage[];
};

export const gcsePastPaperData = rawPastPaperData as GcsePastPaperData;

export const gcsePastPaperSubjects = [
	'All subjects',
	...Array.from(new Set(gcsePastPaperData.pages.map((page) => page.subject))).sort((a, b) =>
		a.localeCompare(b)
	)
];

export const gcsePastPaperBoards = [
	{ id: 'all', name: 'All boards', subjectPageCount: gcsePastPaperData.summary.subjectPageCount },
	...gcsePastPaperData.summary.boards.map((board) => ({
		id: board.id,
		name: board.name,
		subjectPageCount: board.subjectPageCount
	}))
] as Array<{ id: PastPaperBoardId | 'all'; name: string; subjectPageCount: number }>;

export function pastPaperSubjectPath(page: Pick<PastPaperSubjectPage, 'boardId' | 'subjectSlug'>) {
	return `/past-papers/gcse/${page.boardId}/${page.subjectSlug}`;
}

export function pastPaperEntrySlug(
	page: Pick<PastPaperSubjectPage, 'id'>,
	entry: Pick<PastPaperEntry, 'id' | 'year' | 'series' | 'paper'>
) {
	const pagePrefix = `${page.id}-`;
	if (entry.id.startsWith(pagePrefix)) {
		return entry.id.slice(pagePrefix.length);
	}

	return slugifyPastPaperPart(`${entry.year} ${entry.series} ${entry.paper}`);
}

export function pastPaperEntryPath(
	page: Pick<PastPaperSubjectPage, 'id' | 'boardId' | 'subjectSlug'>,
	entry: Pick<PastPaperEntry, 'id' | 'year' | 'series' | 'paper'>
) {
	return `${pastPaperSubjectPath(page)}/${pastPaperEntrySlug(page, entry)}`;
}

export function pastPaperPageLabel(
	page: Pick<PastPaperSubjectPage, 'boardName' | 'subject' | 'tier'>
) {
	return [page.boardName, page.subject, page.tier].filter(Boolean).join(' ');
}

export const gcsePastPaperSubjectIndex: PastPaperSubjectIndex[] = gcsePastPaperData.pages.map(
	(page) => {
		const years = page.entries.map((entry) => entry.year);
		return {
			id: page.id,
			boardId: page.boardId,
			boardName: page.boardName,
			category: page.category,
			subject: page.subject,
			subjectSlug: page.subjectSlug,
			tier: page.tier,
			localPath: pastPaperSubjectPath(page),
			entryCount: page.entries.length,
			documentCount: page.entries.reduce((total, entry) => total + entry.documents.length, 0),
			firstYear: Math.min(...years),
			latestYear: Math.max(...years)
		};
	}
);

export const gcsePastPaperEntryIndex = gcsePastPaperData.pages.flatMap((page) =>
	page.entries.map((entry) => ({
		id: entry.id,
		boardId: page.boardId,
		subjectSlug: page.subjectSlug,
		year: entry.year,
		series: entry.series,
		paper: entry.paper,
		localPath: pastPaperEntryPath(page, entry)
	}))
);

export function getGcsePastPaperSubjectPage(boardId: string, subjectSlug: string) {
	return gcsePastPaperData.pages.find(
		(page) => page.boardId === boardId && page.subjectSlug === subjectSlug
	);
}

export function getGcsePastPaperEntry(boardId: string, subjectSlug: string, paperSlug: string) {
	const page = getGcsePastPaperSubjectPage(boardId, subjectSlug);
	if (!page) return null;

	const entry = page.entries.find((candidate) => pastPaperEntrySlug(page, candidate) === paperSlug);
	if (!entry) return null;

	return {
		page,
		entry,
		localPath: pastPaperEntryPath(page, entry)
	};
}

export function getGcsePastPaperBoardPages(boardId: string) {
	return gcsePastPaperSubjectIndex.filter((page) => page.boardId === boardId);
}

function slugifyPastPaperPart(value: string) {
	return value
		.toLowerCase()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
