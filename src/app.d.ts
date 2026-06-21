// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: {
				GOOGLE_SERVICE_ACCOUNT_JSON?: string;
				GOOGLE_API_KEY?: string;
				AUTH_COOKIE_SECRET?: string;
				QUESTION_DB?: D1Database;
				QUESTION_R2?: R2Bucket;
				[key: string]: unknown;
			};
			ctx?: ExecutionContext;
			caches?: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		interface Locals {
			user: import('$lib/server/auth/session').AdminUser | null;
		}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
