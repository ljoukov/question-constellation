import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	CHALLENGE_CATALOG_CHANGESET_SCHEMA,
	CHALLENGE_CATALOG_DRAFT_SCHEMA,
	createChallengeCatalogBundle,
	deriveChallengeCatalogBundle,
	sha256,
	validateChallengeCatalogBundle
} from './challenge-catalog-bundle.mjs';

test('creates a complete denormalized release directly from one final-state draft', () => {
	const fixture = makeFixture();
	try {
		const bundle = createChallengeCatalogBundle({ rootDir: fixture.root, draft: fixture.draft });
		const validation = validateChallengeCatalogBundle(bundle, {
			rootDir: fixture.root,
			verifyFiles: true
		});

		assert.equal(validation.challengeCount, 1);
		assert.equal(validation.assetCount, 3);
		assert.equal(validation.routePayloadCount, 6);
		assert.deepEqual(validation.subjectCounts, {
			biology: 1,
			chemistry: 0,
			physics: 0
		});
		assert.deepEqual(
			bundle.routes.map((route) => route.path),
			[
				'/_challenge-index',
				'/challenges',
				'/challenges/biology',
				'/challenges/chemistry',
				'/challenges/physics',
				'/challenges/biology/synthetic-link'
			]
		);
		assert.match(bundle.challenges[0].visual.cardArt.src, /synthetic-release-one/u);
		assert.equal(bundle.challenges[0].artAuthority.spec.generationGuards.length, 0);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('derives complete record replacements while reusing exact local image bytes', () => {
	const fixture = makeFixture();
	try {
		const sourceBundle = createChallengeCatalogBundle({
			rootDir: fixture.root,
			draft: fixture.draft
		});
		const replacement = structuredClone(sourceBundle.challenges[0]);
		replacement.definition.completionTitle =
			'You completed the exact synthetic evidence link.';
		const changes = {
			schemaVersion: CHALLENGE_CATALOG_CHANGESET_SCHEMA,
			sourceReleaseId: sourceBundle.release.id,
			sourceContentSha256: sourceBundle.contentSha256,
			recordUpserts: [replacement]
		};
		const derived = deriveChallengeCatalogBundle({
			rootDir: fixture.root,
			sourceBundle,
			releaseId: 'synthetic-release-two',
			changeSet: changes,
			changeFileSha256: 'f'.repeat(64)
		});
		const detail = derived.routes.find(
			(route) => route.path === '/challenges/biology/synthetic-link'
		);

		assert.equal(
			detail.payload.challenge.completionTitle,
			'You completed the exact synthetic evidence link.'
		);
		assert.equal(sourceBundle.challenges[0].definition.completionTitle, undefined);
		assert.equal(derived.assets[0].localPath, sourceBundle.assets[0].localPath);
		assert.equal(derived.assets[0].sha256, sourceBundle.assets[0].sha256);
		assert.notEqual(derived.assets[0].publicPath, sourceBundle.assets[0].publicPath);
		assert.ok(derived.routes.every((route) => route.payload.releaseId === derived.release.id));
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('rejects partial record patch fields instead of converting them', () => {
	const fixture = makeFixture();
	try {
		const sourceBundle = createChallengeCatalogBundle({
			rootDir: fixture.root,
			draft: fixture.draft
		});
		assert.throws(
			() =>
				deriveChallengeCatalogBundle({
					rootDir: fixture.root,
					sourceBundle,
					releaseId: 'synthetic-release-two',
					changeSet: {
						schemaVersion: CHALLENGE_CATALOG_CHANGESET_SCHEMA,
						sourceReleaseId: sourceBundle.release.id,
						sourceContentSha256: sourceBundle.contentSha256,
						recordMerges: [
							{
								challengeId: 'biology-synthetic-link',
								recordMerge: { definition: { title: 'Partial patch' } }
							}
						]
					},
					changeFileSha256: 'f'.repeat(64)
				}),
			/unsupported fields: recordMerges/u
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('adds a new challenge and its R2 pair through the same final-state change set', () => {
	const fixture = makeFixture();
	try {
		const sourceBundle = createChallengeCatalogBundle({
			rootDir: fixture.root,
			draft: fixture.draft
		});
		const addition = makeRecord({
			id: 'chemistry-synthetic-addition',
			slug: 'synthetic-addition',
			subject: 'chemistry',
			artId: 'chemistry-synthetic-addition-opening'
		});
		const changes = {
			schemaVersion: CHALLENGE_CATALOG_CHANGESET_SCHEMA,
			sourceReleaseId: sourceBundle.release.id,
			sourceContentSha256: sourceBundle.contentSha256,
			recordUpserts: [addition],
			assetUpserts: [
				makeAsset({
					root: fixture.root,
					id: 'chemistry-synthetic-addition-opening-dark',
					artId: 'chemistry-synthetic-addition-opening',
					challengeId: 'chemistry-synthetic-addition',
					theme: 'dark',
					bytes: [10, 11, 12]
				}),
				makeAsset({
					root: fixture.root,
					id: 'chemistry-synthetic-addition-opening-light',
					artId: 'chemistry-synthetic-addition-opening',
					challengeId: 'chemistry-synthetic-addition',
					theme: 'light',
					bytes: [13, 14, 15]
				})
			]
		};
		const derived = deriveChallengeCatalogBundle({
			rootDir: fixture.root,
			sourceBundle,
			releaseId: 'synthetic-release-three',
			changeSet: changes,
			changeFileSha256: 'e'.repeat(64)
		});
		const validation = validateChallengeCatalogBundle(derived, {
			rootDir: fixture.root,
			verifyFiles: true
		});

		assert.equal(validation.challengeCount, 2);
		assert.equal(validation.assetCount, 5);
		assert.equal(validation.routePayloadCount, 7);
		assert.equal(validation.subjectCounts.chemistry, 1);
		assert.ok(
			derived.routes.some((route) => route.path === '/challenges/chemistry/synthetic-addition')
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

function makeFixture() {
	const root = mkdtempSync(path.join(os.tmpdir(), 'challenge-catalog-bundle-'));
	const primaryArtId = 'biology-synthetic-link-opening';
	const assets = [
		makeAsset({
			root,
			id: `${primaryArtId}-dark`,
			artId: primaryArtId,
			challengeId: 'biology-synthetic-link',
			theme: 'dark',
			bytes: [1, 2, 3]
		}),
		makeAsset({
			root,
			id: `${primaryArtId}-light`,
			artId: primaryArtId,
			challengeId: 'biology-synthetic-link',
			theme: 'light',
			bytes: [4, 5, 6]
		}),
		makeAsset({
			root,
			id: 'challenge-social-card-light',
			artId: 'challenge-social-card',
			challengeId: null,
			theme: 'light',
			role: 'social',
			bytes: [7, 8, 9]
		})
	];
	const draft = {
		schemaVersion: CHALLENGE_CATALOG_DRAFT_SCHEMA,
		releaseId: 'synthetic-release-one',
		sourceEvidence: { kind: 'synthetic-test' },
		subjects: [
			{
				subject: 'biology',
				label: 'Biology',
				description: 'Synthetic Biology description.',
				heroSlug: 'synthetic-link'
			},
			{
				subject: 'chemistry',
				label: 'Chemistry',
				description: 'Synthetic Chemistry description.',
				heroSlug: ''
			},
			{
				subject: 'physics',
				label: 'Physics',
				description: 'Synthetic Physics description.',
				heroSlug: ''
			}
		],
		arcs: [
			{
				id: 'connect-cause-to-effect',
				label: 'Connect cause to effect',
				description: 'Synthetic arc description.'
			}
		],
		socialImage: {
			url: 'asset:challenge-social-card-light',
			alt: 'Synthetic challenge social card.',
			width: 1200,
			height: 630
		},
		assets,
		challenges: [
			makeRecord({
				id: 'biology-synthetic-link',
				slug: 'synthetic-link',
				subject: 'biology',
				artId: primaryArtId
			})
		]
	};
	return { root, draft };
}

function makeRecord({ id, slug, subject, artId }) {
	const definition = {
		id,
		slug,
		subject,
		subjectArtTheme: subject === 'chemistry' ? 'particles-bonding' : 'cells-practical',
		title: 'Can you complete a synthetic link?',
		topic: 'Synthetic evidence',
		hook: 'A synthetic test hook.',
		marks: 2,
		previewQuestion: 'Which statement completes the synthetic evidence link?',
		lastReviewed: '2026-01-01',
		difficulty: 'standard',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		estimatedMinutes: 4
	};
	const cardArt = {
		src: `asset:${artId}-light`,
		darkSrc: `asset:${artId}-dark`,
		alt: 'Synthetic evidence-link illustration.',
		width: 1536,
		height: 1024
	};
	return {
		definition,
		chain: {
			id: `${id}-chain`,
			title: 'Synthetic chain',
			steps: []
		},
		visual: {
			segments: ['Evidence', 'Link', 'Conclusion'],
			decisiveIndex: 1,
			decisiveLabel: 'Link',
			cardArt
		},
		curriculumCitation: {
			topicLabel: 'Synthetic curriculum evidence',
			officialUrl: 'https://example.test/curriculum'
		},
		curriculumCatalogLink: {
			topicLabel: 'Synthetic curriculum evidence',
			officialUrl: 'https://example.test/curriculum'
		},
		shortRecallPrompt: null,
		visualReview: {
			id: artId,
			accepted: true,
			disposition: 'accept',
			score: 20,
			issues: [],
			visibleTakeaway: 'Two abstract shapes illustrate a synthetic evidence link.'
		},
		artAuthority: {
			spec: {
				schemaVersion: 'science-question-art-spec/v1',
				id: artId,
				challengeId: id,
				subject,
				question: definition.previewQuestion,
				generationGuards: []
			},
			review: {
				id: artId,
				accepted: true,
				disposition: 'accept',
				score: 20,
				issues: []
			}
		}
	};
}

function makeAsset({ root, id, artId, challengeId, theme, bytes, role = 'primary' }) {
	const localPath = `tmp/assets/${id}.webp`;
	const absolutePath = path.join(root, localPath);
	mkdirSync(path.dirname(absolutePath), { recursive: true });
	const buffer = Buffer.from(bytes);
	writeFileSync(absolutePath, buffer);
	return {
		id,
		artId,
		challengeId,
		role,
		theme,
		localPath,
		size: buffer.byteLength,
		sha256: sha256(buffer),
		contentType: 'image/webp',
		cacheControl: 'public, max-age=31536000, immutable',
		reviewDisposition: 'accept'
	};
}
