import { describe, expect, it } from 'vitest';
import { ANALYTICS_CLASSIFICATION_VERSION, classifyAnalyticsTraffic } from './analyticsTraffic';

describe('classifyAnalyticsTraffic', () => {
	it('records the current classifier version', () => {
		expect(ANALYTICS_CLASSIFICATION_VERSION).toBe(2);
	});

	it('keeps every non-production environment in the internal/test lane', () => {
		expect(
			classifyAnalyticsTraffic({
				environment: 'development',
				userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)'
			})
		).toMatchObject({
			trafficClass: 'internal_test',
			source: 'development_environment'
		});
	});

	it('uses Cloudflare verified bot categories before user-agent heuristics', () => {
		expect(
			classifyAnalyticsTraffic({
				environment: 'production',
				userAgent: 'Mozilla/5.0',
				cf: { verifiedBotCategory: 'AI Crawler' }
			})
		).toMatchObject({
			trafficClass: 'verified_bot',
			source: 'cloudflare_verified_bot',
			detail: 'AI Crawler'
		});
	});

	it('recognizes GoogleOther and headless browser automation', () => {
		expect(
			classifyAnalyticsTraffic({
				environment: 'production',
				userAgent: 'Mozilla/5.0 (compatible; GoogleOther)'
			}).trafficClass
		).toBe('suspected_bot');
		expect(
			classifyAnalyticsTraffic({
				environment: 'production',
				userAgent: 'HeadlessChrome/149.0.0.0'
			}).trafficClass
		).toBe('suspected_bot');
	});

	it('uses available Cloudflare bot scores conservatively', () => {
		expect(
			classifyAnalyticsTraffic({
				environment: 'production',
				userAgent: 'Mozilla/5.0',
				cf: { botManagement: { score: 12 } }
			}).trafficClass
		).toBe('suspected_bot');
		expect(
			classifyAnalyticsTraffic({
				environment: 'production',
				userAgent: 'Mozilla/5.0',
				cf: { botManagement: { score: 99 } }
			}).trafficClass
		).toBe('human');
	});

	it('keeps missing user agents separate from people', () => {
		expect(
			classifyAnalyticsTraffic({ environment: 'production', userAgent: null })
		).toMatchObject({
			trafficClass: 'unknown',
			source: 'missing_user_agent'
		});
	});
});
