// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: {
				QUESTION_DB?: D1Database;
				QUESTION_R2?: R2Bucket;
				[key: string]: unknown;
			};
			ctx?: ExecutionContext;
			caches?: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
