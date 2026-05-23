import { dev } from '$app/environment';
import { getRuntimeEnv } from '$lib/server/env';
import { openJson, sealJson } from '$lib/server/auth/crypto';
import { refreshFirebaseIdToken, verifyFirebaseIdToken } from '$lib/server/auth/firebase';
import type { Cookies } from '@sveltejs/kit';
import { z } from 'zod';

export const AUTH_SESSION_ID_COOKIE_NAME = 'questionConstellationAuthSession';

const AUTH_USER_COOKIE_NAME = 'questionConstellationAuth';
const DEV_AUTH_USER_COOKIE_NAME = 'questionConstellationDevAuth';
const AUTH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const DEV_AUTH_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;
const TOKEN_REFRESH_SKEW_MS = 60_000;

const adminSessionSchema = z.object({
	uid: z.string().min(1),
	email: z.string().email(),
	name: z.string().nullable(),
	photoUrl: z.string().url().nullable(),
	idToken: z.string().min(1),
	refreshToken: z.string().min(1),
	expiresAtMs: z.number().int().positive()
});

const devAdminSessionSchema = z.object({
	email: z.string().email(),
	createdAtMs: z.number().int().positive()
});

export type AdminSession = z.infer<typeof adminSessionSchema>;

export type AdminUser = Pick<AdminSession, 'uid' | 'email' | 'name' | 'photoUrl'>;

export type AdminAuthResult =
	| { status: 'ok'; session: AdminSession | null; user: AdminUser }
	| { status: 'signed_out' }
	| { status: 'forbidden'; user: AdminUser };

function toUser(session: AdminSession): AdminUser {
	return {
		uid: session.uid,
		email: session.email,
		name: session.name,
		photoUrl: session.photoUrl
	};
}

function toDevUser(email: string): AdminUser {
	return {
		uid: `dev:${email}`,
		email,
		name: 'Local learner',
		photoUrl: null
	};
}

export function setAuthSessionIdCookie(cookies: Cookies, sessionId: string): void {
	const maxAge = 20 * 60;
	cookies.set(AUTH_SESSION_ID_COOKIE_NAME, sessionId, {
		path: '/auth/',
		httpOnly: true,
		sameSite: 'lax',
		secure: dev ? false : true,
		expires: new Date(Date.now() + maxAge * 1000),
		maxAge
	});
}

export function clearAuthSessionIdCookie(cookies: Cookies): void {
	cookies.set(AUTH_SESSION_ID_COOKIE_NAME, '', {
		path: '/auth/',
		httpOnly: true,
		sameSite: 'lax',
		secure: dev ? false : true,
		expires: new Date(0)
	});
}

export async function setAdminSessionCookie(
	cookies: Cookies,
	session: AdminSession,
	secret: string
) {
	cookies.set(AUTH_USER_COOKIE_NAME, await sealJson(session, secret), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: dev ? false : true,
		expires: new Date(Date.now() + AUTH_COOKIE_MAX_AGE_SECONDS * 1000),
		maxAge: AUTH_COOKIE_MAX_AGE_SECONDS
	});
}

export async function setDevAdminSessionCookie(
	cookies: Cookies,
	email: string,
	secret: string
): Promise<void> {
	cookies.set(
		DEV_AUTH_USER_COOKIE_NAME,
		await sealJson(
			{
				email: email.trim().toLowerCase(),
				createdAtMs: Date.now()
			},
			secret
		),
		{
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: false,
			expires: new Date(Date.now() + DEV_AUTH_COOKIE_MAX_AGE_SECONDS * 1000),
			maxAge: DEV_AUTH_COOKIE_MAX_AGE_SECONDS
		}
	);
}

export function clearDevAdminSessionCookie(cookies: Cookies): void {
	cookies.set(DEV_AUTH_USER_COOKIE_NAME, '', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: false,
		expires: new Date(0)
	});
}

export function clearAdminSessionCookie(cookies: Cookies): void {
	cookies.set(AUTH_USER_COOKIE_NAME, '', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: dev ? false : true,
		expires: new Date(0)
	});
}

export function createAdminSession({
	uid,
	email,
	name,
	photoUrl,
	idToken,
	refreshToken,
	expiresInSeconds
}: {
	uid: string;
	email: string;
	name?: string | null;
	photoUrl?: string | null;
	idToken: string;
	refreshToken: string;
	expiresInSeconds: number;
}): AdminSession {
	return adminSessionSchema.parse({
		uid,
		email: email.toLowerCase(),
		name: name ?? null,
		photoUrl: photoUrl ?? null,
		idToken,
		refreshToken,
		expiresAtMs: Date.now() + Math.max(1, expiresInSeconds - 10) * 1000
	});
}

async function refreshSessionIfNeeded(
	session: AdminSession,
	platformEnv?: unknown
): Promise<{ session: AdminSession; refreshed: boolean }> {
	if (Date.now() + TOKEN_REFRESH_SKEW_MS < session.expiresAtMs) {
		return { session, refreshed: false };
	}

	const refreshed = await refreshFirebaseIdToken({
		refreshToken: session.refreshToken,
		platformEnv
	});
	const env = getRuntimeEnv(platformEnv);
	const token = await verifyFirebaseIdToken(refreshed.id_token, env);
	return {
		session: createAdminSession({
			uid: refreshed.user_id,
			email: token.email ?? session.email,
			name: token.name ?? session.name,
			photoUrl: token.picture ?? session.photoUrl,
			idToken: refreshed.id_token,
			refreshToken: refreshed.refresh_token,
			expiresInSeconds: refreshed.expires_in
		}),
		refreshed: true
	};
}

async function readDevAdminAuthFromCookies(
	cookies: Cookies,
	platformEnv?: unknown
): Promise<AdminAuthResult | null> {
	if (!dev) {
		return null;
	}

	const sealed = cookies.get(DEV_AUTH_USER_COOKIE_NAME);
	if (!sealed) {
		return null;
	}

	const env = getRuntimeEnv(platformEnv);
	try {
		const session = await openJson(sealed, env.authCookieSecret, devAdminSessionSchema);
		const user = toDevUser(session.email);
		return { status: 'ok', session: null, user };
	} catch (error) {
		console.warn('Dev admin session cookie could not be read.', error);
		clearDevAdminSessionCookie(cookies);
		return null;
	}
}

export async function readAdminAuthFromCookies(
	cookies: Cookies,
	platformEnv?: unknown
): Promise<AdminAuthResult> {
	const devAuth = await readDevAdminAuthFromCookies(cookies, platformEnv);
	if (devAuth) {
		return devAuth;
	}

	const sealed = cookies.get(AUTH_USER_COOKIE_NAME);
	if (!sealed) {
		return { status: 'signed_out' };
	}

	const env = getRuntimeEnv(platformEnv);
	try {
		const storedSession = await openJson(sealed, env.authCookieSecret, adminSessionSchema);
		const { session, refreshed } = await refreshSessionIfNeeded(storedSession, platformEnv);
		const token = await verifyFirebaseIdToken(session.idToken, env);
		const checkedSession = createAdminSession({
			uid: token.user_id,
			email: token.email ?? session.email,
			name: token.name ?? session.name,
			photoUrl: token.picture ?? session.photoUrl,
			idToken: session.idToken,
			refreshToken: session.refreshToken,
			expiresInSeconds: Math.max(1, Math.floor((session.expiresAtMs - Date.now()) / 1000))
		});

		if (refreshed) {
			await setAdminSessionCookie(cookies, session, env.authCookieSecret);
		}

		const user = toUser(checkedSession);
		return { status: 'ok', session: checkedSession, user };
	} catch (error) {
		console.warn('Admin session cookie could not be read.', error);
		clearAdminSessionCookie(cookies);
		return { status: 'signed_out' };
	}
}

export function isEmailAllowedForAdmin(email: string): boolean {
	return z.string().email().safeParse(email.trim().toLowerCase()).success;
}
