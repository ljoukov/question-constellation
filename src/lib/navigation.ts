import { resolve } from '$app/paths';

export type AppTopbarLink = {
	href: string;
	label: string;
};

export const primaryNavigationLinks: AppTopbarLink[] = [
	{ href: resolve('/chains'), label: 'Question bank' },
	{ href: resolve('/english'), label: 'English' },
	{ href: resolve('/past-papers'), label: 'Past papers' },
	{ href: resolve('/blog'), label: 'Blog' }
];
