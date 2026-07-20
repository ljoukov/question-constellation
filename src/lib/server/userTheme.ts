import type { AdminUser } from '$lib/server/auth/session';
import { executePersonalQuery, queryPersonalFirst } from './db';

export type ThemePreference = 'auto' | 'light' | 'dark';
export type UserAppearancePreferences = {
	themePreference: ThemePreference;
	visualEffectsEnabled: boolean;
};

type UserThemeRow = {
	theme_preference: string | null;
	visual_effects_enabled: unknown;
};

export function safeThemePreference(value: unknown): ThemePreference {
	return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

export function safeVisualEffectsEnabled(value: unknown): boolean {
	return value === 0 || value === false ? false : true;
}

async function upsertThemeProfile(user: AdminUser): Promise<void> {
	await executePersonalQuery(
		`INSERT INTO user_profiles (uid, email, name, photo_url, selected_board, selected_subject)
		 VALUES (?, ?, ?, ?, 'AQA', 'Biology')
		 ON CONFLICT(uid) DO UPDATE SET
		   email = excluded.email,
		   name = excluded.name,
		   photo_url = excluded.photo_url,
		   updated_at = CURRENT_TIMESTAMP,
		   last_seen_at = CURRENT_TIMESTAMP`,
		[user.uid, user.email, user.name, user.photoUrl]
	);
}

export async function getUserThemePreference(user: AdminUser): Promise<ThemePreference> {
	return (await getUserAppearancePreferences(user)).themePreference;
}

export async function getUserAppearancePreferences(
	user: AdminUser
): Promise<UserAppearancePreferences> {
	const row = await queryPersonalFirst<UserThemeRow>(
		`SELECT theme_preference, visual_effects_enabled
		 FROM user_profiles
		 WHERE uid = ?`,
		[user.uid]
	);

	if (row) {
		return {
			themePreference: safeThemePreference(row.theme_preference),
			visualEffectsEnabled: safeVisualEffectsEnabled(row.visual_effects_enabled)
		};
	}

	await upsertThemeProfile(user);
	return {
		themePreference: 'auto',
		visualEffectsEnabled: true
	};
}

export async function updateUserThemePreference({
	user,
	themePreference
}: {
	user: AdminUser;
	themePreference: ThemePreference;
}): Promise<ThemePreference> {
	const safePreference = safeThemePreference(themePreference);
	await upsertThemeProfile(user);
	await executePersonalQuery(
		`UPDATE user_profiles
		 SET theme_preference = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE uid = ?`,
		[safePreference, user.uid]
	);
	return safePreference;
}

export async function updateUserVisualEffectsPreference({
	user,
	visualEffectsEnabled
}: {
	user: AdminUser;
	visualEffectsEnabled: boolean;
}): Promise<boolean> {
	const safePreference = safeVisualEffectsEnabled(visualEffectsEnabled);
	await upsertThemeProfile(user);
	await executePersonalQuery(
		`UPDATE user_profiles
		 SET visual_effects_enabled = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE uid = ?`,
		[safePreference ? 1 : 0, user.uid]
	);
	return safePreference;
}
