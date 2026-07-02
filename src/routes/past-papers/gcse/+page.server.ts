import {
	gcsePastPaperBoards,
	gcsePastPaperData,
	gcsePastPaperSubjectIndex
} from '$lib/pastPapers/gcsePastPapers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const boardSections = gcsePastPaperBoards
		.filter((board) => board.id !== 'all')
		.map((board) => {
			const pages = gcsePastPaperSubjectIndex.filter((page) => page.boardId === board.id);
			const categories = Array.from(new Set(pages.map((page) => page.category))).map(
				(category) => ({
					name: category,
					pages: pages.filter((page) => page.category === category)
				})
			);
			return {
				...board,
				categories
			};
		});

	return {
		summary: gcsePastPaperData.summary,
		boardSections
	};
};
