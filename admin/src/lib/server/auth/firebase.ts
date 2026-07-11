import { getAuthRuntimeEnv, type AuthRuntimeEnv } from './env';
import { responseErrorAsString } from './http';
import * as jose from 'jose';
import { z } from 'zod';

const createAuthUriResponseSchema = z.object({
	authUri: z.string().url(),
	sessionId: z.string().min(1)
});

const signInWithIdpResponseSchema = z.object({
	localId: z.string().min(1),
	idToken: z.string().min(1),
	expiresIn: z.preprocess(
		(value) => Number.parseInt(z.string().parse(value), 10),
		z.number().gt(0)
	),
	refreshToken: z.string().min(1),
	displayName: z.string().optional(),
	photoUrl: z.string().optional(),
	email: z.string().email().optional()
});

const refreshTokenResponseSchema = z.object({
	expires_in: z.preprocess(
		(value) => Number.parseInt(z.string().parse(value), 10),
		z.number().gt(0)
	),
	refresh_token: z.string().min(1),
	id_token: z.string().min(1),
	user_id: z.string().min(1)
});

const firebaseIdTokenPayloadSchema = z.object({
	iss: z.string(),
	aud: z.string(),
	auth_time: z.number().int(),
	user_id: z.string().min(1),
	sub: z.string().min(1),
	iat: z.number().int(),
	exp: z.number().int(),
	email: z.string().email().optional(),
	name: z.string().optional(),
	picture: z.string().url().optional()
});

export type FirebaseIdTokenPayload = z.infer<typeof firebaseIdTokenPayloadSchema>;

const jwks = jose.createRemoteJWKSet(
	new URL(
		'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
	)
);

export async function createGoogleAuthUri(args: { continueUri: URL; platformEnv?: unknown }) {
	const authEnv = getAuthRuntimeEnv(args.platformEnv);
	const response = await fetch(
		'https://www.googleapis.com/identitytoolkit/v3/relyingparty/createAuthUri',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-goog-api-key': authEnv.googleApiKey },
			body: JSON.stringify({
				continueUri: args.continueUri.toString(),
				customParameter: { prompt: 'select_account' },
				oauthScope: '{"google.com":"profile email"}',
				providerId: 'google.com'
			})
		}
	);
	if (!response.ok)
		throw new Error(`createAuthUri failed: ${await responseErrorAsString(response)}`);
	return createAuthUriResponseSchema.parse(await response.json());
}

export async function signInWithGoogleRedirect(args: {
	requestUri: URL;
	sessionId: string;
	platformEnv?: unknown;
}) {
	const authEnv = getAuthRuntimeEnv(args.platformEnv);
	const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'X-goog-api-key': authEnv.googleApiKey },
		body: JSON.stringify({
			requestUri: args.requestUri.toString(),
			returnIdpCredential: true,
			returnSecureToken: true,
			sessionId: args.sessionId
		})
	});
	if (!response.ok)
		throw new Error(`signInWithIdp failed: ${await responseErrorAsString(response)}`);
	return signInWithIdpResponseSchema.parse(await response.json());
}

export async function refreshFirebaseIdToken(args: {
	refreshToken: string;
	platformEnv?: unknown;
}) {
	const authEnv = getAuthRuntimeEnv(args.platformEnv);
	const response = await fetch('https://securetoken.googleapis.com/v1/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'X-goog-api-key': authEnv.googleApiKey
		},
		body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: args.refreshToken })
	});
	if (!response.ok)
		throw new Error(`refresh token failed: ${await responseErrorAsString(response)}`);
	return refreshTokenResponseSchema.parse(await response.json());
}

export async function verifyFirebaseIdToken(
	idToken: string,
	authEnv: Pick<AuthRuntimeEnv, 'projectId'>
): Promise<FirebaseIdTokenPayload> {
	const { payload } = await jose.jwtVerify(idToken, jwks, {
		algorithms: ['RS256'],
		issuer: `https://securetoken.google.com/${authEnv.projectId}`,
		audience: authEnv.projectId,
		clockTolerance: 50
	});
	const token = firebaseIdTokenPayloadSchema.parse(payload);
	const now = Math.floor(Date.now() / 1000);
	if (token.exp < now) throw new Error('ID token has expired');
	if (token.iat > now) throw new Error('ID token issued-at time is in the future');
	if (token.auth_time > now) throw new Error('Auth time is in the future');
	if (token.sub !== token.user_id) throw new Error('Token subject does not match user_id');
	return token;
}
