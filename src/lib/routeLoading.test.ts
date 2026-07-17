import { describe, expect, it } from 'vitest';
import { routeLoadingContentTypeForRoute, routeLoadingMessageFor } from './routeLoading';

describe('route loading copy', () => {
	it('defaults to generic loading copy', () => {
		expect(routeLoadingMessageFor()).toBe('Loading...');
		expect(routeLoadingContentTypeForRoute('/auth/relogin')).toBe('default');
	});

	it('maps public question-bank routes to contextual copy', () => {
		expect(routeLoadingMessageFor(routeLoadingContentTypeForRoute('/'))).toBe(
			'Loading question bank...'
		);
		expect(routeLoadingMessageFor(routeLoadingContentTypeForRoute('/questions/[questionId]'))).toBe(
			'Loading question...'
		);
		expect(
			routeLoadingMessageFor(routeLoadingContentTypeForRoute('/questions/[questionId]/chain'))
		).toBe('Loading answer chain...');
		expect(
			routeLoadingMessageFor(routeLoadingContentTypeForRoute('/constellations/[chainId]'))
		).toBe('Loading constellation...');
		expect(
			routeLoadingMessageFor(routeLoadingContentTypeForRoute('/questions/[questionId]/practice'))
		).toBe('Loading practice...');
		expect(
			routeLoadingMessageFor(
				routeLoadingContentTypeForRoute('/questions/[questionId]/practice/step-by-step/[stepId]')
			)
		).toBe('Loading practice...');
	});

	it('maps non-question routes away from question copy', () => {
		expect(routeLoadingMessageFor(routeLoadingContentTypeForRoute('/past-papers/gcse'))).toBe(
			'Loading past papers...'
		);
		expect(routeLoadingMessageFor(routeLoadingContentTypeForRoute('/english'))).toBe(
			'Loading English questions...'
		);
		expect(routeLoadingMessageFor(routeLoadingContentTypeForRoute('/recall'))).toBe(
			'Loading recall practice...'
		);
		expect(
			routeLoadingMessageFor(routeLoadingContentTypeForRoute('/challenges/[subject]/[slug]'))
		).toBe('Loading challenge...');
		expect(routeLoadingContentTypeForRoute(null, '/challenges/biology/cell-differences')).toBe(
			'challenge'
		);
	});
});
