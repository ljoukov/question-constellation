import {
	updateUserThemePreference,
	updateUserVisualEffectsPreference,
	type ThemePreference
} from '$lib/server/userTheme';
import { json, type RequestHandler } from '@sveltejs/kit';

function parseThemePreference(value: unknown): ThemePreference | null {
	return value === 'auto' || value === 'light' || value === 'dark' ? value : null;
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return json({ error: 'invalid_appearance_preference' }, { status: 400 });
	}

	const record = body as Record<string, unknown>;
	const keys = Object.keys(record);
	const allowedKeys = new Set(['themePreference', 'visualEffectsEnabled']);
	if (keys.length === 0 || keys.some((key) => !allowedKeys.has(key))) {
		return json({ error: 'invalid_appearance_preference' }, { status: 400 });
	}

	const hasThemePreference = Object.hasOwn(record, 'themePreference');
	const hasVisualEffectsEnabled = Object.hasOwn(record, 'visualEffectsEnabled');
	const themePreference = hasThemePreference ? parseThemePreference(record.themePreference) : null;

	if (hasThemePreference && !themePreference) {
		return json({ error: 'invalid_theme_preference' }, { status: 400 });
	}
	if (hasVisualEffectsEnabled && typeof record.visualEffectsEnabled !== 'boolean') {
		return json({ error: 'invalid_visual_effects_preference' }, { status: 400 });
	}

	const response: {
		themePreference?: ThemePreference;
		visualEffectsEnabled?: boolean;
	} = {};

	if (themePreference) {
		response.themePreference = await updateUserThemePreference({
			user: locals.user,
			themePreference
		});
	}
	if (hasVisualEffectsEnabled) {
		response.visualEffectsEnabled = await updateUserVisualEffectsPreference({
			user: locals.user,
			visualEffectsEnabled: record.visualEffectsEnabled as boolean
		});
	}

	return json(response);
};
