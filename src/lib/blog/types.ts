export type BlogCategory = 'Comparison' | 'Revision research' | 'Exam technique';

export type BlogFaq = {
	question: string;
	answer: string;
};

export type BlogSource = {
	label: string;
	url: string;
};

export type BlogArticleMeta = {
	slug: string;
	title: string;
	shortTitle: string;
	description: string;
	standfirst: string;
	category: BlogCategory;
	publishedAt: string;
	updatedAt?: string;
	readMinutes: number;
	tags: string[];
	comparisonTool?: string;
	quickTake: string;
	faqs?: BlogFaq[];
	sources?: BlogSource[];
	relatedSlugs: string[];
};

export type BlogArticle = BlogArticleMeta & {
	bodyMarkdown: string;
};
