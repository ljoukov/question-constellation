import { updateUserThemePreference, type ThemePreference } from '$lib/server/personalLearning';
import { json, type RequestHandler } from '@sveltejs/kit';

function parseThemePreference(value: unknown): ThemePreference | null {
	return value === 'auto' || value === 'light' || value === 'dark' ? value : null;
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const body = (await request.json().catch(() => null)) as { themePreference?: unknown } | null;
	const themePreference = parseThemePreference(body?.themePreference);
	if (!themePreference) {
		return json({ error: 'invalid_theme_preference' }, { status: 400 });
	}

	const savedThemePreference = await updateUserThemePreference({
		user: locals.user,
		themePreference
	});

	return json({ themePreference: savedThemePreference });
};
