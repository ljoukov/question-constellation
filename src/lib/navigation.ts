import { resolve } from '$app/paths';

export type AppTopbarLink = {
	href: string;
	label: string;
	mobileLabel?: string;
	mobilePriority?: boolean;
};

export const primaryNavigationLinks: AppTopbarLink[] = [
	{
		href: resolve('/past-papers/gcse'),
		label: 'Past papers',
		mobilePriority: true
	},
	{ href: resolve('/blog'), label: 'Blog', mobilePriority: true }
];
