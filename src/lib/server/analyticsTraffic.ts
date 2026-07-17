export const ANALYTICS_CLASSIFICATION_VERSION = 2;

export type AnalyticsTrafficClass =
	| 'human'
	| 'verified_bot'
	| 'suspected_bot'
	| 'internal_test'
	| 'unknown';

export type AnalyticsTrafficClassification = {
	trafficClass: AnalyticsTrafficClass;
	source: string;
	detail: string | null;
	version: number;
};

const AUTOMATION_USER_AGENT =
	/(?:googlebot|googleother|google-inspectiontool|adsbot-google|apis-google|mediapartners-google|bingbot|bingpreview|duckduckbot|baiduspider|yandexbot|applebot|slurp|facebookexternalhit|twitterbot|linkedinbot|petalbot|semrushbot|ahrefsbot|bytespider|gptbot|chatgpt-user|claudebot|anthropic-ai|perplexitybot|ccbot|crawler|spider|headlesschrome|chrome-lighthouse|lighthouse|pagespeed|pingdom|uptimerobot|curl\/|wget\/|python-requests|go-http-client|node-fetch)/i;

function object(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function classifyAnalyticsTraffic(input: {
	environment: string;
	userAgent?: string | null;
	cf?: unknown;
}): AnalyticsTrafficClassification {
	if (input.environment !== 'production') {
		return {
			trafficClass: 'internal_test',
			source: 'development_environment',
			detail: input.environment || 'development',
			version: ANALYTICS_CLASSIFICATION_VERSION
		};
	}

	const cf = object(input.cf);
	const verifiedBotCategory =
		typeof cf?.verifiedBotCategory === 'string' ? cf.verifiedBotCategory.trim() : '';
	if (verifiedBotCategory) {
		return {
			trafficClass: 'verified_bot',
			source: 'cloudflare_verified_bot',
			detail: verifiedBotCategory,
			version: ANALYTICS_CLASSIFICATION_VERSION
		};
	}

	const botManagement = object(cf?.botManagement);
	if (botManagement?.verifiedBot === true) {
		return {
			trafficClass: 'verified_bot',
			source: 'cloudflare_bot_management',
			detail:
				typeof botManagement.verifiedBotCategory === 'string'
					? botManagement.verifiedBotCategory
					: null,
			version: ANALYTICS_CLASSIFICATION_VERSION
		};
	}

	const botScore =
		typeof botManagement?.score === 'number' && Number.isFinite(botManagement.score)
			? botManagement.score
			: null;
	if (botScore !== null && botScore >= 1 && botScore <= 29) {
		return {
			trafficClass: 'suspected_bot',
			source: 'cloudflare_bot_score',
			detail: `score ${botScore}`,
			version: ANALYTICS_CLASSIFICATION_VERSION
		};
	}

	const userAgent = input.userAgent?.trim() || '';
	const automationMatch = userAgent.match(AUTOMATION_USER_AGENT)?.[0];
	if (automationMatch) {
		return {
			trafficClass: 'suspected_bot',
			source: 'user_agent_rule',
			detail: automationMatch,
			version: ANALYTICS_CLASSIFICATION_VERSION
		};
	}

	if (!userAgent) {
		return {
			trafficClass: 'unknown',
			source: 'missing_user_agent',
			detail: null,
			version: ANALYTICS_CLASSIFICATION_VERSION
		};
	}

	return {
		trafficClass: 'human',
		source: 'browser_traffic',
		detail: null,
		version: ANALYTICS_CLASSIFICATION_VERSION
	};
}
