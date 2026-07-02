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

export function getGcsePastPaperSubjectPage(boardId: string, subjectSlug: string) {
	return gcsePastPaperData.pages.find(
		(page) => page.boardId === boardId && page.subjectSlug === subjectSlug
	);
}

export function getGcsePastPaperBoardPages(boardId: string) {
	return gcsePastPaperSubjectIndex.filter((page) => page.boardId === boardId);
}
