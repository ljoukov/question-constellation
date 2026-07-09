import type { AdminUser } from '$lib/server/auth/session';
import { executePersonalQuery, queryPersonalFirst } from './db';

export type ThemePreference = 'auto' | 'light' | 'dark';

type UserThemeRow = {
	theme_preference: string | null;
};

export function safeThemePreference(value: unknown): ThemePreference {
	return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
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
	const row = await queryPersonalFirst<UserThemeRow>(
		`SELECT theme_preference
		 FROM user_profiles
		 WHERE uid = ?`,
		[user.uid]
	);

	if (row) return safeThemePreference(row.theme_preference);

	await upsertThemeProfile(user);
	return 'auto';
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
