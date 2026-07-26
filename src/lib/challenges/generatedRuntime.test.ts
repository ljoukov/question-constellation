import { describe, expect, it } from 'vitest';
import { challengeCatalog } from './catalog';
import { loadGeneratedScienceChallengeRuntimes } from './generatedRuntime';

function fixture() {
	const definition = {
		...structuredClone(challengeCatalog[0]),
		id: 'biology-generated-runtime-test',
		slug: 'generated-runtime-test'
	};
	const visual = {
		id: definition.id,
		segments: ['Observe', 'Connect', 'Apply'],
		decisiveIndex: 1,
		decisiveLabel: 'Connect the evidence before applying it.',
		cardArt: {
			src: '/images/challenges/science-test-v1/opening-light.webp',
			darkSrc: '/images/challenges/science-test-v1/opening-dark.webp',
			alt: 'A reviewed opening science illustration.',
			width: 960,
			height: 540
		},
		transferArt: {
			src: '/images/challenges/science-test-v1/transfer-light.webp',
			darkSrc: '/images/challenges/science-test-v1/transfer-dark.webp',
			alt: 'A reviewed transfer science illustration.',
			width: 960,
			height: 540
		}
	};
	return {
		schemaVersion: 'generated-science-challenge-runtime/v1',
		releaseId: 'science-test-v1',
		definitions: [definition],
		identities: [{ id: definition.id, slug: definition.slug, subject: definition.subject }],
		curriculum: [
			{
				id: definition.id,
				subject: definition.subject,
				curriculumComponentId: 'biology-cell-biology-test',
				specificationId: 'aqa-gcse-biology-8461-v1.0',
				specificationSha256: 'a'.repeat(64),
				specRef: '4.1.1.1',
				topicLabel: 'Eukaryotes and prokaryotes',
				sourceTextSha256: 'b'.repeat(64),
				pageStart: 15,
				pageEnd: 15
			}
		],
		visuals: [visual]
	};
}

function acceptedMarker(runtime = fixture()) {
	return {
		schemaVersion: 'science-challenge-release/v1',
		release: {
			id: runtime.releaseId,
			status: 'accepted'
		},
		challenges: runtime.definitions.map((definition) => ({
			definition: structuredClone(definition)
		}))
	};
}

describe('generated science challenge runtime loader', () => {
	it('loads definitions, curriculum and reviewed visuals from runtime v1', () => {
		const runtime = fixture();
		const loaded = loadGeneratedScienceChallengeRuntimes(
			{
				'../../../data/challenges/releases/science-test-v1/runtime.json': runtime
			},
			{
				'../../../data/challenges/releases/science-test-v1/accepted-challenges.json':
					acceptedMarker(runtime)
			}
		);

		expect(loaded.releaseIds).toEqual(['science-test-v1']);
		expect(loaded.definitions).toHaveLength(1);
		expect(loaded.curriculum[0].curriculumComponentId).toBe('biology-cell-biology-test');
		expect(loaded.visuals['biology-generated-runtime-test'].cardArt?.width).toBe(960);
	});

	it('fails closed when identity, visual, or path provenance differs', () => {
		const wrongIdentity = fixture();
		wrongIdentity.identities[0].slug = 'different-slug';
		expect(() =>
			loadGeneratedScienceChallengeRuntimes(
				{
					'../../../data/challenges/releases/science-test-v1/runtime.json': wrongIdentity
				},
				{
					'../../../data/challenges/releases/science-test-v1/accepted-challenges.json':
						acceptedMarker(wrongIdentity)
				}
			)
		).toThrow(/identity differs/);

		const missingDarkArt = fixture();
		delete (missingDarkArt.visuals[0].cardArt as { darkSrc?: string }).darkSrc;
		expect(() =>
			loadGeneratedScienceChallengeRuntimes(
				{
					'../../../data/challenges/releases/science-test-v1/runtime.json': missingDarkArt
				},
				{
					'../../../data/challenges/releases/science-test-v1/accepted-challenges.json':
						acceptedMarker(missingDarkArt)
				}
			)
		).toThrow(/visual is malformed/);

		const runtimeV2 = {
			...fixture(),
			schemaVersion: 'generated-science-challenge-runtime/v2'
		};
		expect(() =>
			loadGeneratedScienceChallengeRuntimes(
				{
					'../../../data/challenges/releases/science-test-v1/runtime.json': runtimeV2
				},
				{
					'../../../data/challenges/releases/science-test-v1/accepted-challenges.json':
						acceptedMarker()
				}
			)
		).toThrow(/header is invalid/);

		const embeddedRecall = {
			...fixture(),
			shortRecallPrompts: []
		};
		expect(() =>
			loadGeneratedScienceChallengeRuntimes(
				{
					'../../../data/challenges/releases/science-test-v1/runtime.json': embeddedRecall
				},
				{
					'../../../data/challenges/releases/science-test-v1/accepted-challenges.json':
						acceptedMarker()
				}
			)
		).toThrow(/must not embed short-recall/);

		expect(() =>
			loadGeneratedScienceChallengeRuntimes(
				{
					'../../../data/challenges/releases/different-release/runtime.json': fixture()
				},
				{
					'../../../data/challenges/releases/different-release/accepted-challenges.json':
						acceptedMarker()
				}
			)
		).toThrow(/release id differs from its path/);
	});

	it('requires one accepted sibling marker for every runtime and rejects orphan markers', () => {
		const runtime = fixture();
		expect(() =>
			loadGeneratedScienceChallengeRuntimes({
				'../../../data/challenges/releases/science-test-v1/runtime.json': runtime
			})
		).toThrow(/runtime is orphaned from its accepted release marker/);

		expect(() =>
			loadGeneratedScienceChallengeRuntimes(
				{},
				{
					'../../../data/challenges/releases/science-test-v1/accepted-challenges.json':
						acceptedMarker(runtime)
				}
			)
		).toThrow(/accepted marker is orphaned from its runtime/);

		expect(() =>
			loadGeneratedScienceChallengeRuntimes(
				{
					'../../../data/challenges/releases/science-test-v1/runtime.json': runtime
				},
				{
					'../../../data/challenges/releases/science-test-v1/accepted-challenges.json':
						acceptedMarker(runtime),
					'..\\..\\..\\data\\challenges\\releases\\science-test-v1\\accepted-challenges.json':
						acceptedMarker(runtime)
				}
			)
		).toThrow(/exactly one accepted release marker/);
	});

	it('rejects candidate markers and accepted markers with mismatched release identity or definitions', () => {
		const runtime = fixture();
		const candidateMarker = acceptedMarker(runtime);
		candidateMarker.release.status = 'candidate';
		expect(() =>
			loadGeneratedScienceChallengeRuntimes(
				{
					'../../../data/challenges/releases/science-test-v1/runtime.json': runtime
				},
				{
					'../../../data/challenges/releases/science-test-v1/accepted-challenges.json':
						candidateMarker
				}
			)
		).toThrow(/release marker is not accepted/);

		const wrongRelease = acceptedMarker(runtime);
		wrongRelease.release.id = 'science-test-v2';
		expect(() =>
			loadGeneratedScienceChallengeRuntimes(
				{
					'../../../data/challenges/releases/science-test-v1/runtime.json': runtime
				},
				{
					'../../../data/challenges/releases/science-test-v1/accepted-challenges.json': wrongRelease
				}
			)
		).toThrow(/accepted marker release id differs from its runtime/);

		const wrongDefinition = acceptedMarker(runtime);
		wrongDefinition.challenges[0].definition.title = 'A definition not in the accepted release';
		expect(() =>
			loadGeneratedScienceChallengeRuntimes(
				{
					'../../../data/challenges/releases/science-test-v1/runtime.json': runtime
				},
				{
					'../../../data/challenges/releases/science-test-v1/accepted-challenges.json':
						wrongDefinition
				}
			)
		).toThrow(/definition membership differs from its accepted release/);
	});

	it('rejects challenge identities duplicated across generated releases', () => {
		const first = fixture();
		const second = { ...fixture(), releaseId: 'science-test-v2' };
		expect(() =>
			loadGeneratedScienceChallengeRuntimes(
				{
					'../../../data/challenges/releases/science-test-v1/runtime.json': first,
					'../../../data/challenges/releases/science-test-v2/runtime.json': second
				},
				{
					'../../../data/challenges/releases/science-test-v1/accepted-challenges.json':
						acceptedMarker(first),
					'../../../data/challenges/releases/science-test-v2/accepted-challenges.json':
						acceptedMarker(second)
				}
			)
		).toThrow(/identity is duplicated/);
	});
});
