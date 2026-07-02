import {
	getGcsePastPaperSubjectPage,
	pastPaperPageLabel,
	pastPaperSubjectPath
} from '$lib/pastPapers/gcsePastPapers';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const page = getGcsePastPaperSubjectPage(params.board, params.subjectSlug);
	if (!page) {
		throw error(404, 'GCSE past paper subject not found.');
	}

	const pageLabel = pastPaperPageLabel(page);
	const localPath = pastPaperSubjectPath(page);

	return {
		page: {
			...page,
			pageLabel,
			localPath,
			rows: page.entries.map((entry) => ({
				...entry,
				pageId: page.id,
				pageLabel,
				localPath
			}))
		}
	};
};
