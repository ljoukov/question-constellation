import { gcsePastPaperBoards } from '$lib/pastPapers/gcsePastPapers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {
		boards: gcsePastPaperBoards
			.filter((board) => board.id !== 'all')
			.map((board) => ({
				...board,
				localPath: `/past-papers/gcse/${board.id}`
			}))
	};
};
