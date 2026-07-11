import { env as privateEnv } from '$env/dynamic/private';
import { z } from 'zod';

const ENV_KEYS = ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_API_KEY', 'AUTH_COOKIE_SECRET'] as const;

const serviceAccountSchema = z.object({
	project_id: z.string().min(1),
	client_email: z.string().email(),
	private_key: z.string().min(1)
});

const runtimeEnvSchema = z.object({
	GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(1),
	GOOGLE_API_KEY: z.string().min(1),
	AUTH_COOKIE_SECRET: z.string().min(32)
});

export type AuthRuntimeEnv = {
	googleApiKey: string;
	authCookieSecret: string;
	projectId: string;
};

function readPlatformEnv(platformEnv?: unknown): Record<string, string> {
	if (!platformEnv || typeof platformEnv !== 'object') return {};
	const values: Record<string, string> = {};
	for (const key of ENV_KEYS) {
		const value = (platformEnv as Record<string, unknown>)[key];
		if (typeof value === 'string') values[key] = value;
	}
	return values;
}

export function getAuthRuntimeEnv(platformEnv?: unknown): AuthRuntimeEnv {
	const raw = runtimeEnvSchema.parse({ ...privateEnv, ...readPlatformEnv(platformEnv) });
	const serviceAccount = serviceAccountSchema.parse(JSON.parse(raw.GOOGLE_SERVICE_ACCOUNT_JSON));
	return {
		googleApiKey: raw.GOOGLE_API_KEY,
		authCookieSecret: raw.AUTH_COOKIE_SECRET,
		projectId: serviceAccount.project_id
	};
}
