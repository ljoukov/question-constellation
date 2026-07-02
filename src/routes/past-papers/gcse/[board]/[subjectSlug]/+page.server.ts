import {
	getGcsePastPaperSubjectPage,
	pastPaperEntryPath,
	pastPaperPageLabel,
	pastPaperSubjectPath,
	type PastPaperEntry,
	type PastPaperSubjectPage
} from '$lib/pastPapers/gcsePastPapers';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const page = getGcsePastPaperSubjectPage(params.board, params.subjectSlug);
	if (!page) {
		throw error(404, 'GCSE past paper subject not found.');
	}

	const pageLabel = pastPaperPageLabel(page);
	const localPath = pastPaperSubjectPath(page);
	const paperFilters = paperFilterOptions(page.entries);
	const paperParam = url.searchParams.get('paper');
	const selectedPaperFilterId = paperFilters.some((filter) => filter.id === paperParam)
		? paperParam
		: 'all';
	const entries =
		selectedPaperFilterId === 'all'
			? page.entries
			: page.entries.filter((entry) => paperFilterForEntry(entry)?.id === selectedPaperFilterId);

	return {
		page: {
			...page,
			category: displayCategoryForPage(page),
			pageLabel,
			localPath,
			paperFilters,
			selectedPaperFilterId,
			rows: entries.map((entry) => ({
				...entry,
				pageId: page.id,
				pageLabel,
				localPath,
				paperLocalPath: pastPaperEntryPath(page, entry)
			}))
		}
	};
};

function displayCategoryForPage(
	page: Pick<PastPaperSubjectPage, 'category' | 'subject' | 'subjectSlug'>
) {
	const subject = page.subject.toLowerCase();
	const slug = page.subjectSlug.toLowerCase();
	if (/\b(biology|chemistry|physics)\b/.test(subject) || /science-double-award/.test(slug)) {
		return 'STEM Subjects';
	}
	return page.category;
}

function paperFilterOptions(entries: PastPaperEntry[]) {
	const filters = new Map<string, { id: string; label: string; order: number; count: number }>();
	for (const entry of entries) {
		const filter = paperFilterForEntry(entry);
		if (!filter) continue;
		const existing = filters.get(filter.id);
		if (existing) {
			existing.count += 1;
			continue;
		}
		filters.set(filter.id, { ...filter, count: 1 });
	}
	return [...filters.values()].sort((left, right) => left.order - right.order);
}

function paperFilterForEntry(entry: Pick<PastPaperEntry, 'paper'>) {
	const paper = entry.paper.trim();
	const paperMatch = /\bpaper\s*(\d+)\b/i.exec(paper);
	if (paperMatch) {
		const number = Number(paperMatch[1]);
		return {
			id: `paper-${number}`,
			label: `Paper ${number}`,
			order: number
		};
	}

	const unitMatch = /\bunit\s*(\d+)\b/i.exec(paper);
	if (unitMatch) {
		const number = Number(unitMatch[1]);
		return {
			id: `unit-${number}`,
			label: `Unit ${number}`,
			order: 100 + number
		};
	}

	const componentMatch = /\bcomponent\s*(\d+)\b/i.exec(paper);
	if (componentMatch) {
		const number = Number(componentMatch[1]);
		return {
			id: `component-${number}`,
			label: `Component ${number}`,
			order: 200 + number
		};
	}

	return null;
}
