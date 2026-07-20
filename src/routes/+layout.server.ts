import type { LayoutServerLoad } from './$types';
import { fallbackUserHomeSnapshot, getUserHomeSnapshot } from '$lib/server/homeSnapshot';

const defaultAppearance = {
	themePreference: 'auto' as const,
	visualEffectsEnabled: true
};

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		return {
			user: null,
			themePreference: null,
			visualEffectsEnabled: true,
			homeSnapshot: null,
			homeSnapshotShouldRefresh: false
		};
	}

	const user = locals.user;
	const snapshotResult = await getUserHomeSnapshot(user).catch(() => ({
		status: 'fallback' as const,
		snapshot: fallbackUserHomeSnapshot(user),
		shouldRefresh: true
	}));
	const appearance = snapshotResult.snapshot.appearance ?? defaultAppearance;

	return {
		user,
		themePreference: appearance.themePreference,
		visualEffectsEnabled: appearance.visualEffectsEnabled,
		homeSnapshot: snapshotResult.snapshot,
		homeSnapshotShouldRefresh: snapshotResult.shouldRefresh
	};
};
