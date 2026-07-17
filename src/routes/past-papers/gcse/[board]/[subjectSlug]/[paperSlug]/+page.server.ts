import {
	getGcsePastPaperEntry,
	pastPaperEntryPath,
	pastPaperPageLabel,
	pastPaperSubjectPath
} from '$lib/pastPapers/gcsePastPapers';
import { getSittablePaperForPastPaperEntry } from '$lib/server/paperSittingReadiness';
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
	let sitting: Awaited<ReturnType<typeof getSittablePaperForPastPaperEntry>> = null;
	try {
		sitting = await getSittablePaperForPastPaperEntry(entry.id);
	} catch (cause) {
		// An optional online sitting must never take down public PDF browsing.
		console.error('[past-paper-sitting] readiness lookup failed', {
			entryId: entry.id,
			cause: cause instanceof Error ? cause.message : String(cause)
		});
	}

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
		sitting: sitting
			? {
					href: `/experiments/questions/${sitting.paper.id}?mode=sit`,
					durationMinutes: sitting.availability.durationMinutes,
					totalMarks: sitting.availability.totalMarks,
					questionCount: sitting.availability.inventoryQuestionCount
				}
			: null,
		user: locals.user
	};
};
