import {
	getGcsePastPaperEntry,
	pastPaperEntryPath,
	pastPaperPageLabel,
	pastPaperSubjectPath
} from '$lib/pastPapers/gcsePastPapers';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const result = getGcsePastPaperEntry(params.board, params.subjectSlug, params.paperSlug);
	if (!result) {
		throw error(404, 'GCSE past paper not found.');
	}

	const { page, entry, localPath } = result;
	const pageLabel = pastPaperPageLabel(page);
	const subjectPath = pastPaperSubjectPath(page);
	const relatedRows = page.entries
		.filter((candidate) => candidate.id !== entry.id)
		.slice(0, 6)
		.map((candidate) => ({
			...candidate,
			pageId: page.id,
			pageLabel,
			localPath: subjectPath,
			paperLocalPath: pastPaperEntryPath(page, candidate)
		}));

	return {
		page: {
			id: page.id,
			boardId: page.boardId,
			boardName: page.boardName,
			category: page.category,
			subject: page.subject,
			subjectSlug: page.subjectSlug,
			tier: page.tier,
			pageLabel,
			subjectPath,
			localPath,
			entry,
			relatedRows
		},
		user: locals.user
	};
};
