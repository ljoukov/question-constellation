import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	canonicalJsonSha256,
	GENERATED_SCIENCE_SHORT_RECALL_CONTENT_VERSION,
	loadGeneratedScienceShortRecallBundles
} from './generatedShortRecall';
import { biologyExpansion } from './expansions/biology';
import { chemistryExpansion } from './expansions/chemistry';
import { physicsExpansion } from './expansions/physics';

describe('generated science short recall release loading', () => {
	it('preserves the authored-only state when no release exists', () => {
		expect(loadGeneratedScienceShortRecallBundles({}, {}, {})).toEqual({
			releaseIds: [],
			challengeIds: [],
			prompts: [],
			countsBySubject: { biology: 0, chemistry: 0, physics: 0 },
			acceptedReleaseEvidence: null
		});
	});

	it('loads the accepted 179-prompt release and derives its subject counts', () => {
		const fixture = generatedReleaseFixture({ biology: 34, chemistry: 71, physics: 74 });
		const loaded = loadGeneratedScienceShortRecallBundles(
			fixture.promptModules,
			fixture.runtimeModules,
			fixture.markerModules
		);

		expect(loaded.releaseIds).toEqual([fixture.releaseId]);
		expect(loaded.challengeIds).toEqual(
			fixture.runtime.definitions.map((definition) => definition.id)
		);
		expect(loaded.prompts).toHaveLength(179);
		expect(loaded.countsBySubject).toEqual({
			biology: 34,
			chemistry: 71,
			physics: 74
		});
		expect(loaded.acceptedReleaseEvidence).toEqual({
			releaseId: fixture.releaseId,
			challengeIds: loaded.challengeIds,
			runtimePath: fixture.runtimePath,
			acceptedReleasePath: fixture.markerPath,
			promptBundlePath: fixture.promptPath,
			runtimeSha256: fixture.marker.release.runtimeSha256,
			shortRecallBundleSha256: fixture.marker.release.shortRecallBundleSha256,
			shortRecallCandidateSetSha256: fixture.marker.release.shortRecallCandidateSetSha256
		});
	});

	it('derives arbitrary complete release sizes rather than assuming 179', () => {
		const fixture = generatedReleaseFixture({ biology: 2, chemistry: 1, physics: 3 });
		const loaded = loadGeneratedScienceShortRecallBundles(
			fixture.promptModules,
			fixture.runtimeModules,
			fixture.markerModules
		);
		expect(loaded.prompts).toHaveLength(6);
		expect(loaded.countsBySubject).toEqual({
			biology: 2,
			chemistry: 1,
			physics: 3
		});
	});

	it('fails closed when any accepted release sibling is absent', () => {
		const fixture = generatedReleaseFixture({ biology: 1, chemistry: 1, physics: 1 });
		expect(() =>
			loadGeneratedScienceShortRecallBundles(fixture.promptModules, fixture.runtimeModules, {})
		).toThrow(/orphaned.*accepted-challenges\.json/);
		expect(() =>
			loadGeneratedScienceShortRecallBundles({}, fixture.runtimeModules, fixture.markerModules)
		).toThrow(/orphaned.*short-recall-prompts\.json/);
		expect(() =>
			loadGeneratedScienceShortRecallBundles(fixture.promptModules, {}, fixture.markerModules)
		).toThrow(/orphaned.*runtime\.json/);
	});

	it('rejects rehashed partial, extra or reordered prompt membership', () => {
		const fixture = generatedReleaseFixture({ biology: 2, chemistry: 2, physics: 2 });
		for (const mutate of [
			(prompts: typeof fixture.prompts) => prompts.slice(0, -1),
			(prompts: typeof fixture.prompts) => [
				...prompts,
				{
					...prompts[0]!,
					challengeId: 'generated-science-extra',
					stem: 'An extra generated statement needs the ___.'
				}
			],
			(prompts: typeof fixture.prompts) => {
				const reordered = structuredClone(prompts);
				[reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
				return reordered;
			}
		]) {
			const prompts = mutate(structuredClone(fixture.prompts));
			const marker = structuredClone(fixture.marker);
			marker.release.shortRecallBundleSha256 = canonicalJsonSha256(prompts);
			expect(() =>
				loadGeneratedScienceShortRecallBundles(
					{ [fixture.promptPath]: prompts },
					fixture.runtimeModules,
					{ [fixture.markerPath]: marker }
				)
			).toThrow(/order differ/);
		}
	});

	it('rejects stale paths, tampered hashes and changed accepted definitions', () => {
		const fixture = generatedReleaseFixture({ biology: 2, chemistry: 2, physics: 2 });
		const staleRuntime = structuredClone(fixture.runtime);
		staleRuntime.releaseId = 'older-release';
		expect(() =>
			loadGeneratedScienceShortRecallBundles(
				fixture.promptModules,
				{ [fixture.runtimePath]: staleRuntime },
				fixture.markerModules
			)
		).toThrow(/release id differs from its path/);

		const tamperedPrompts = structuredClone(fixture.prompts);
		tamperedPrompts[0]!.stem = 'Tampered evidence supports the ___.';
		expect(() =>
			loadGeneratedScienceShortRecallBundles(
				{ [fixture.promptPath]: tamperedPrompts },
				fixture.runtimeModules,
				fixture.markerModules
			)
		).toThrow(/differs from its accepted release hash/);

		const changedMarker = structuredClone(fixture.marker);
		changedMarker.challenges[0]!.definition.title = 'A changed accepted definition';
		changedMarker.release.shortRecallCandidateSetSha256 = canonicalJsonSha256(
			changedMarker.challenges
		);
		expect(() =>
			loadGeneratedScienceShortRecallBundles(fixture.promptModules, fixture.runtimeModules, {
				[fixture.markerPath]: changedMarker
			})
		).toThrow(/definition membership differs/);
	});

	it('matches the release pipeline canonical JSON SHA-256 contract', () => {
		const value = {
			z: `£${'long release payload '.repeat(80)}`,
			a: [{ beta: 2, alpha: true }]
		};
		const canonical = JSON.stringify({
			a: [{ alpha: true, beta: 2 }],
			z: value.z
		});
		expect(canonicalJsonSha256(value)).toBe(createHash('sha256').update(canonical).digest('hex'));
	});
});

function generatedReleaseFixture(counts: { biology: number; chemistry: number; physics: number }) {
	const releaseId = 'science-test-release';
	const subjects = (
		[
			['biology', counts.biology],
			['chemistry', counts.chemistry],
			['physics', counts.physics]
		] as const
	).flatMap(([subject, count]) => Array.from({ length: count }, () => subject));
	const templates = {
		biology: biologyExpansion[0]!,
		chemistry: chemistryExpansion[0]!,
		physics: physicsExpansion[0]!
	};
	const definitions = subjects.map((subject, index) => ({
		...structuredClone(templates[subject]),
		id: `generated-science-${String(index + 1).padStart(3, '0')}`,
		slug: `generated-science-${String(index + 1).padStart(3, '0')}`
	}));
	const runtime = {
		schemaVersion: 'generated-science-challenge-runtime/v1',
		releaseId,
		definitions,
		identities: definitions.map((definition) => ({
			id: definition.id,
			slug: definition.slug,
			subject: definition.subject
		})),
		curriculum: definitions.map((definition, index) => ({
			id: definition.id,
			subject: definition.subject,
			curriculumComponentId: `${definition.subject}-component-${index + 1}`,
			specificationId: `aqa-gcse-${definition.subject}-test`,
			specificationSha256: 'a'.repeat(64),
			specRef: `4.${index + 1}`,
			topicLabel: `${definition.subject} topic ${index + 1}`,
			sourceTextSha256: 'b'.repeat(64),
			pageStart: 1,
			pageEnd: 1
		})),
		visuals: definitions.map((definition) => ({
			id: definition.id,
			segments: ['Observe', 'Connect', 'Apply'],
			decisiveIndex: 1,
			decisiveLabel: 'Connect the evidence before applying it.',
			cardArt: {
				src: `/images/challenges/${definition.id}-opening-light.webp`,
				darkSrc: `/images/challenges/${definition.id}-opening-dark.webp`,
				alt: 'A reviewed opening science illustration.',
				width: 960,
				height: 540
			},
			transferArt: {
				src: `/images/challenges/${definition.id}-transfer-light.webp`,
				darkSrc: `/images/challenges/${definition.id}-transfer-dark.webp`,
				alt: 'A reviewed transfer science illustration.',
				width: 960,
				height: 540
			}
		}))
	};
	const prompts = definitions.map((definition, index) => ({
		challengeId: definition.id,
		stem: `Generated science statement ${index + 1} needs the ___.`,
		canonicalAnswer: `term${index + 1}`,
		acceptedAliases: [],
		preferredHiddenStepIndex: 1,
		contentVersion: GENERATED_SCIENCE_SHORT_RECALL_CONTENT_VERSION
	}));
	const challenges = definitions.map((definition) => ({ definition }));
	const marker = {
		schemaVersion: 'science-challenge-release/v1',
		release: {
			id: releaseId,
			status: 'accepted',
			runtimeSha256: canonicalJsonSha256(runtime),
			shortRecallBundleSha256: canonicalJsonSha256(prompts),
			shortRecallCandidateSetSha256: canonicalJsonSha256(challenges)
		},
		challenges
	};
	const base = `/repo/data/challenges/releases/${releaseId}`;
	const runtimePath = `${base}/runtime.json`;
	const promptPath = `${base}/short-recall-prompts.json`;
	const markerPath = `${base}/accepted-challenges.json`;
	return {
		releaseId,
		runtime,
		prompts,
		marker,
		runtimePath,
		promptPath,
		markerPath,
		runtimeModules: { [runtimePath]: runtime },
		promptModules: { [promptPath]: prompts },
		markerModules: { [markerPath]: marker }
	};
}
