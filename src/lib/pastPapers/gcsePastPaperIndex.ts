import rawPastPaperIndexData from './gcsePastPaperIndexData.json';
import type { PastPaperBoardId, PastPaperSubjectIndex } from './gcsePastPapers';

export type { PastPaperBoardId, PastPaperSubjectIndex } from './gcsePastPapers';

type PastPaperBoardIndex = {
	id: PastPaperBoardId;
	name: string;
	subjectPageCount: number;
};

type GcsePastPaperIndexData = {
	boards: PastPaperBoardIndex[];
	pages: PastPaperSubjectIndex[];
};

const gcsePastPaperIndexData = rawPastPaperIndexData as GcsePastPaperIndexData;

export const gcsePastPaperIndexBoards = [
	{
		id: 'all',
		name: 'All boards',
		subjectPageCount: gcsePastPaperIndexData.pages.length
	},
	...gcsePastPaperIndexData.boards
] as Array<{ id: PastPaperBoardId | 'all'; name: string; subjectPageCount: number }>;

export const gcsePastPaperSubjectIndex = gcsePastPaperIndexData.pages;
