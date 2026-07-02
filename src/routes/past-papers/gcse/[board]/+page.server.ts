import {
	gcsePastPaperBoards,
	gcsePastPaperSubjectIndex,
	type PastPaperSubjectIndex
} from '$lib/pastPapers/gcsePastPapers';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

type CourseFilter = {
	id: string;
	label: string;
};

type SubjectVariant = Pick<
	PastPaperSubjectIndex,
	'id' | 'boardId' | 'subjectSlug' | 'tier' | 'localPath' | 'entryCount' | 'documentCount'
> & {
	label: string;
};

type SubjectGroup = {
	id: string;
	subject: string;
	variants: SubjectVariant[];
};

const courseFilters: CourseFilter[] = [
	{ id: 'all', label: 'All subjects' },
	{ id: 'separate-science', label: 'Triple / Separate Science' },
	{ id: 'combined-science', label: 'Combined Science / Trilogy / Double Award' },
	{ id: 'maths', label: 'Maths' },
	{ id: 'english', label: 'English' },
	{ id: 'computing-technology', label: 'Computing & Technology' },
	{ id: 'humanities-social', label: 'Humanities & Social Sciences' }
];

export const load: PageServerLoad = async ({ params, url }) => {
	const board = gcsePastPaperBoards.find((candidate) => candidate.id === params.board);
	if (!board || board.id === 'all') {
		throw error(404, 'GCSE past paper board not found.');
	}

	const pages = gcsePastPaperSubjectIndex.filter((page) => page.boardId === board.id);
	const filters = courseFilters
		.map((filter) => ({
			...filter,
			count:
				filter.id === 'all'
					? pages.length
					: pages.filter((page) => courseFilterIdsForPage(page).has(filter.id)).length
		}))
		.filter((filter) => filter.id === 'all' || filter.count > 0);
	const courseParam = url.searchParams.get('course');
	const selectedCourseId =
		courseParam && filters.some((filter) => filter.id === courseParam) ? courseParam : 'all';
	const filteredPages =
		selectedCourseId === 'all'
			? pages
			: pages.filter((page) => courseFilterIdsForPage(page).has(selectedCourseId));
	const selectedCourseLabel =
		filters.find((filter) => filter.id === selectedCourseId)?.label ?? 'All subjects';
	const categories = Array.from(
		new Set(
			filteredPages.map((page) =>
				selectedCourseId === 'all' ? displayCategoryForPage(page) : selectedCourseLabel
			)
		)
	).map((category) => ({
		id: categoryId(category),
		name: category,
		subjects: subjectGroupsForPages(
			filteredPages.filter((page) => {
				const pageCategory =
					selectedCourseId === 'all' ? displayCategoryForPage(page) : selectedCourseLabel;
				return pageCategory === category;
			})
		),
		pages: filteredPages.filter((page) => {
			const pageCategory =
				selectedCourseId === 'all' ? displayCategoryForPage(page) : selectedCourseLabel;
			return pageCategory === category;
		})
	}));

	return {
		board: {
			...board,
			localPath: `/past-papers/gcse/${board.id}`
		},
		courseFilters: filters,
		selectedCourseId,
		categories
	};
};

function categoryId(category: string) {
	return category
		.toLowerCase()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function subjectGroupsForPages(pages: PastPaperSubjectIndex[]): SubjectGroup[] {
	const groups = new Map<string, SubjectGroup>();
	for (const page of pages) {
		const id = subjectId(page.subject);
		const existing = groups.get(id);
		const group = existing ?? {
			id,
			subject: page.subject,
			variants: []
		};
		group.variants.push({
			id: page.id,
			boardId: page.boardId,
			subjectSlug: page.subjectSlug,
			tier: page.tier,
			localPath: page.localPath,
			entryCount: page.entryCount,
			documentCount: page.documentCount,
			label: page.tier ?? 'Papers'
		});
		groups.set(id, group);
	}

	return [...groups.values()]
		.map((group) => ({
			...group,
			variants: group.variants.sort((left, right) => tierOrder(left.label) - tierOrder(right.label))
		}))
		.sort((left, right) => left.subject.localeCompare(right.subject));
}

function subjectId(subject: string) {
	return subject
		.toLowerCase()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function tierOrder(label: string) {
	if (label === 'Higher') return 1;
	if (label === 'Foundation') return 2;
	return 3;
}

function displayCategoryForPage(page: PastPaperSubjectIndex) {
	if (gcseScienceSubject(page)) return 'STEM Subjects';
	return page.category;
}

function gcseScienceSubject(page: PastPaperSubjectIndex) {
	const subject = page.subject.toLowerCase();
	const slug = page.subjectSlug.toLowerCase();
	return /\b(biology|chemistry|physics)\b/.test(subject) || /science-double-award/.test(slug);
}

function courseFilterIdsForPage(page: PastPaperSubjectIndex) {
	const ids = new Set<string>();
	const subject = page.subject.toLowerCase();
	const slug = page.subjectSlug.toLowerCase();
	const category = page.category.toLowerCase();
	const title = `${subject} ${slug}`;

	if (/\bcombined\b/.test(title) || /science-double-award/.test(slug)) {
		ids.add('combined-science');
	}

	if (
		gcseScienceSubject(page) &&
		!/\bcombined\b/.test(title) &&
		!/science-double-award/.test(slug)
	) {
		ids.add('separate-science');
	}

	if (/\b(mathematics|statistics)\b/.test(subject)) {
		ids.add('maths');
	}

	if (/\benglish\b/.test(subject)) {
		ids.add('english');
	}

	if (/\b(computer science|design and technology|engineering|food and nutrition)\b/.test(subject)) {
		ids.add('computing-technology');
	}

	if (category === 'humanities & social sciences' && !gcseScienceSubject(page)) {
		ids.add('humanities-social');
	}

	return ids;
}
