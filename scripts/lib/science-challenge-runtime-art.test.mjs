import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReviewedRuntimeArtRecord } from './science-challenge-runtime-art.mjs';

test('runtime art uses the exact-pair review description instead of generic source alt text', () => {
	const spec = {
		id: 'biology-example-opening',
		altText: 'A generic illustration showing the setup described by the question.'
	};
	const deliveryById = new Map([
		['biology-example-opening-dark', { publicPath: '/dark.webp' }],
		['biology-example-opening-light', { publicPath: '/light.webp' }]
	]);
	const reviewById = new Map([
		[
			'biology-example-opening',
			{
				accepted: true,
				visibleTakeaway: '  Two equal test tubes stand in controlled, non-boiling water baths.  '
			}
		]
	]);

	assert.deepEqual(buildReviewedRuntimeArtRecord({ spec, deliveryById, reviewById }), {
		src: '/light.webp',
		darkSrc: '/dark.webp',
		alt: 'Two equal test tubes stand in controlled, non-boiling water baths.',
		width: 960,
		height: 540
	});
});

test('runtime art fails closed without an accepted literal review description', () => {
	const spec = { id: 'biology-example-opening', altText: 'Generic source text.' };
	const deliveryById = new Map([
		['biology-example-opening-dark', { publicPath: '/dark.webp' }],
		['biology-example-opening-light', { publicPath: '/light.webp' }]
	]);
	for (const review of [
		null,
		{ accepted: false, visibleTakeaway: 'A rejected scene.' },
		{ accepted: true, visibleTakeaway: '   ' }
	]) {
		const reviewById = new Map(review ? [['biology-example-opening', review]] : []);
		assert.throws(
			() => buildReviewedRuntimeArtRecord({ spec, deliveryById, reviewById }),
			/Missing accepted literal runtime art description/
		);
	}
});
