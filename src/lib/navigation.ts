import { resolve } from '$app/paths';

export type AppTopbarLink = {
	href: string;
	label: string;
	mobileLabel?: string;
	mobilePriority?: boolean;
};

export const primaryNavigationLinks: AppTopbarLink[] = [
	{
		href: resolve('/questions'),
		label: 'Questions',
		mobileLabel: 'Questions',
		mobilePriority: true
	},
	{
		href: resolve('/challenges'),
		label: 'Challenges',
		mobilePriority: true
	},
	{
		href: resolve('/past-papers/gcse'),
		label: 'Past papers'
	},
	{ href: resolve('/blog'), label: 'Blog' }
];
