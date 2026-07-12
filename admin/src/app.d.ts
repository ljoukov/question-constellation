declare global {
	interface AnalyticsD1PreparedStatement {
		bind(...values: Array<string | number | null>): AnalyticsD1PreparedStatement;
		all<T extends Record<string, unknown>>(): Promise<{ results?: T[] }>;
		run(): Promise<unknown>;
	}

	interface AnalyticsD1DatabaseSession {
		prepare(sql: string): AnalyticsD1PreparedStatement;
	}

	interface AnalyticsD1Database {
		withSession(mode: 'first-primary' | 'first-unconstrained'): AnalyticsD1DatabaseSession;
	}

	interface AnalyticsSummaryWorkflowBinding {
		create(options: {
			id?: string;
			params: { summaryId: string; environment: string; days: number };
		}): Promise<{ id: string }>;
	}

	namespace App {
		interface Platform {
			env: {
				ANALYTICS_DB?: AnalyticsD1Database;
				ANALYTICS_SUMMARY_WORKFLOW?: AnalyticsSummaryWorkflowBinding;
				QUESTION_R2?: R2Bucket;
				GOOGLE_SERVICE_ACCOUNT_JSON?: string;
				GOOGLE_API_KEY?: string;
				AUTH_COOKIE_SECRET?: string;
				CHATGPT_CODEX_PROXY_URL?: string;
				CHATGPT_CODEX_PROXY_API_KEY?: string;
				CHATGPT_RESPONSES_WEBSOCKET_MODE?: string;
				[key: string]: unknown;
			};
			ctx?: ExecutionContext;
			cf?: IncomingRequestCfProperties;
		}

		interface Locals {
			analyticsDb: AnalyticsD1DatabaseSession | null;
			adminIdentity: string | null;
			adminUser: import('$lib/server/auth/session').AdminUser | null;
		}
	}
}

export {};
