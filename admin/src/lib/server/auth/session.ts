import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';
import { z } from 'zod';
import { openJson, sealJson } from './crypto';
import { getAuthRuntimeEnv } from './env';
import { refreshFirebaseIdToken, verifyFirebaseIdToken } from './firebase';

export const AUTH_SESSION_ID_COOKIE_NAME = 'constellationAdminAuthSession';
const AUTH_USER_COOKIE_NAME = 'constellationAdminAuth';
const AUTH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
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

export type AdminSession = z.infer<typeof adminSessionSchema>;
export type AdminUser = Pick<AdminSession, 'uid' | 'email' | 'name' | 'photoUrl'>;

export function setAuthSessionIdCookie(cookies: Cookies, sessionId: string): void {
	const maxAge = 20 * 60;
	cookies.set(AUTH_SESSION_ID_COOKIE_NAME, sessionId, {
		path: '/auth/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		expires: new Date(Date.now() + maxAge * 1000),
		maxAge
	});
}

export function clearAuthSessionIdCookie(cookies: Cookies): void {
	cookies.set(AUTH_SESSION_ID_COOKIE_NAME, '', {
		path: '/auth/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
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
		secure: !dev,
		expires: new Date(Date.now() + AUTH_COOKIE_MAX_AGE_SECONDS * 1000),
		maxAge: AUTH_COOKIE_MAX_AGE_SECONDS
	});
}

export function clearAdminSessionCookie(cookies: Cookies): void {
	cookies.set(AUTH_USER_COOKIE_NAME, '', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		expires: new Date(0)
	});
}

export function createAdminSession(args: {
	uid: string;
	email: string;
	name?: string | null;
	photoUrl?: string | null;
	idToken: string;
	refreshToken: string;
	expiresInSeconds: number;
}): AdminSession {
	return adminSessionSchema.parse({
		uid: args.uid,
		email: args.email.toLowerCase(),
		name: args.name ?? null,
		photoUrl: args.photoUrl ?? null,
		idToken: args.idToken,
		refreshToken: args.refreshToken,
		expiresAtMs: Date.now() + Math.max(1, args.expiresInSeconds - 10) * 1000
	});
}

function toUser(session: AdminSession): AdminUser {
	return { uid: session.uid, email: session.email, name: session.name, photoUrl: session.photoUrl };
}

export async function readAdminAuthFromCookies(
	cookies: Cookies,
	platformEnv?: unknown
): Promise<{ status: 'ok'; user: AdminUser } | { status: 'signed_out' }> {
	const sealed = cookies.get(AUTH_USER_COOKIE_NAME);
	if (!sealed) return { status: 'signed_out' };
	const authEnv = getAuthRuntimeEnv(platformEnv);
	try {
		let session = await openJson(sealed, authEnv.authCookieSecret, adminSessionSchema);
		if (Date.now() + TOKEN_REFRESH_SKEW_MS >= session.expiresAtMs) {
			const refreshed = await refreshFirebaseIdToken({
				refreshToken: session.refreshToken,
				platformEnv
			});
			const token = await verifyFirebaseIdToken(refreshed.id_token, authEnv);
			session = createAdminSession({
				uid: refreshed.user_id,
				email: token.email ?? session.email,
				name: token.name ?? session.name,
				photoUrl: token.picture ?? session.photoUrl,
				idToken: refreshed.id_token,
				refreshToken: refreshed.refresh_token,
				expiresInSeconds: refreshed.expires_in
			});
			await setAdminSessionCookie(cookies, session, authEnv.authCookieSecret);
		}
		const token = await verifyFirebaseIdToken(session.idToken, authEnv);
		if (token.user_id !== session.uid)
			throw new Error('Session user does not match verified token');
		return { status: 'ok', user: toUser(session) };
	} catch (error) {
		console.warn('Admin Firebase session could not be read.', error);
		clearAdminSessionCookie(cookies);
		return { status: 'signed_out' };
	}
}
