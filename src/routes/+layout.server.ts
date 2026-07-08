import type { LayoutServerLoad } from './$types';
import { getUserThemePreference } from '$lib/server/personalLearning';

export const load: LayoutServerLoad = async ({ locals }) => {
	const themePreference = locals.user
		? await getUserThemePreference(locals.user).catch(() => 'auto' as const)
		: null;

	return {
		user: locals.user,
		themePreference
	};
};
