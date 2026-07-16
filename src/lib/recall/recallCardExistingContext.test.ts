import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	assertAdditiveRecallCandidates,
	loadExistingRecallCardContext
} from '../../../scripts/lib/recall-card-existing-context.mjs';

const temporaryRoots: string[] = [];

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureRoot() {
	const root = mkdtempSync(path.join(tmpdir(), 'recall-existing-context-'));
	temporaryRoots.push(root);
	writeArtifact(root, 'reviewed-run-v8', [
		{
			id: 'bio-existing-artifact-card',
			conceptKey: 'existing-concept',
			subject: 'Biology',
			front: 'What is the existing fact?',
			back: 'The existing answer.',
			targets: [
				{
					offeringId: 'combined-biology-higher',
					topicComponentId: 'cell-biology'
				}
			]
		},
		{
			id: 'chem-other-subject-card',
			conceptKey: 'other-subject-concept',
			subject: 'Chemistry',
			front: 'What is an atom?',
			back: 'The smallest part of an element.',
			targets: [
				{
					offeringId: 'combined-chemistry-higher',
					topicComponentId: 'atomic-structure'
				}
			]
		}
	]);
	return root;
}

function writeArtifact(root: string, runId: string, cards: Array<Record<string, unknown>>) {
	const artifactDirectory = path.join(root, 'data/recall/generated', runId);
	mkdirSync(artifactDirectory, { recursive: true });
	writeFileSync(
		path.join(artifactDirectory, 'accepted-cards.json'),
		`${JSON.stringify({ run: { id: runId }, cards }, null, 2)}\n`
	);
}

describe('additive recall-card identity context', () => {
	it('indexes static ids, durable ids, subject concepts and exact target cards', () => {
		const context = loadExistingRecallCardContext({
			rootDir: fixtureRoot(),
			subject: 'Biology',
			topicComponentId: 'cell-biology',
			offeringIds: ['combined-biology-higher']
		});

		expect(context.mode).toBe('additive');
		expect(context.reservedIds).toContain('bio-nucleus-function');
		expect(context.reservedIds).toContain('bio-existing-artifact-card');
		expect(context.reservedIds).toContain('chem-other-subject-card');
		expect(context.reservedConceptKeys).toEqual(['existing-concept']);
		expect(context.existingTargetCards).toEqual([
			expect.objectContaining({ id: 'bio-existing-artifact-card' })
		]);
	});

	it('fails before review on reused ids, concepts or exact target content', () => {
		const context = loadExistingRecallCardContext({
			rootDir: fixtureRoot(),
			subject: 'Biology',
			topicComponentId: 'cell-biology',
			offeringIds: ['combined-biology-higher']
		});
		const candidate = (overrides: Record<string, unknown>) => ({
			cards: [
				{
					id: 'bio-new-card',
					conceptKey: 'new-concept',
					front: 'What is a genuinely new fact?',
					back: 'A genuinely new answer.',
					...overrides
				}
			]
		});

		expect(() =>
			assertAdditiveRecallCandidates(candidate({ id: 'bio-existing-artifact-card' }), context)
		).toThrow('reuses a reserved card id');
		expect(() =>
			assertAdditiveRecallCandidates(candidate({ conceptKey: 'existing-concept' }), context)
		).toThrow('reuses reserved concept key');
		expect(() =>
			assertAdditiveRecallCandidates(
				candidate({
					front: 'WHAT is the existing fact',
					back: 'The existing answer!'
				}),
				context
			)
		).toThrow('duplicates an existing target card');
		expect(() => assertAdditiveRecallCandidates(candidate({}), context)).not.toThrow();
	});

	it('fails closed when a discovered accepted artifact is corrupt or structurally incomplete', () => {
		const corruptRoot = fixtureRoot();
		const corruptDirectory = path.join(corruptRoot, 'data/recall/generated/corrupt-run');
		mkdirSync(corruptDirectory, { recursive: true });
		writeFileSync(path.join(corruptDirectory, 'accepted-cards.json'), '{not-json');
		expect(() =>
			loadExistingRecallCardContext({
				rootDir: corruptRoot,
				subject: 'Biology',
				topicComponentId: 'cell-biology',
				offeringIds: ['combined-biology-higher']
			})
		).toThrow(/corrupt-run\/accepted-cards\.json is not valid JSON/);

		const malformedRoot = fixtureRoot();
		writeArtifact(malformedRoot, 'malformed-run', [
			{
				id: 'bio-incomplete',
				conceptKey: 'incomplete',
				subject: 'Biology',
				front: 'Missing an answer?',
				back: '',
				targets: []
			}
		]);
		expect(() =>
			loadExistingRecallCardContext({
				rootDir: malformedRoot,
				subject: 'Biology',
				topicComponentId: 'cell-biology',
				offeringIds: ['combined-biology-higher']
			})
		).toThrow(/malformed-run\/accepted-cards\.json cards\[0\]\.back is required/);
	});

	it('rejects divergent stable id and subject-local concept mappings across artifacts', () => {
		const idRoot = fixtureRoot();
		writeArtifact(idRoot, 'id-drift-run', [
			{
				id: 'bio-existing-artifact-card',
				conceptKey: 'changed-concept',
				subject: 'Biology',
				front: 'A changed task?',
				back: 'A changed answer.',
				targets: [
					{
						offeringId: 'combined-biology-higher',
						topicComponentId: 'cell-biology'
					}
				]
			}
		]);
		expect(() =>
			loadExistingRecallCardContext({
				rootDir: idRoot,
				subject: 'Biology',
				topicComponentId: 'cell-biology',
				offeringIds: ['combined-biology-higher']
			})
		).toThrow(/card id bio-existing-artifact-card maps to divergent identities/);

		const conceptRoot = fixtureRoot();
		writeArtifact(conceptRoot, 'concept-drift-run', [
			{
				id: 'bio-renamed-existing-card',
				conceptKey: 'existing-concept',
				subject: 'Biology',
				front: 'A renamed task?',
				back: 'A renamed answer.',
				targets: [
					{
						offeringId: 'combined-biology-higher',
						topicComponentId: 'cell-biology'
					}
				]
			}
		]);
		expect(() =>
			loadExistingRecallCardContext({
				rootDir: conceptRoot,
				subject: 'Biology',
				topicComponentId: 'cell-biology',
				offeringIds: ['combined-biology-higher']
			})
		).toThrow(/concept Biology:existing-concept maps to divergent card ids/);
	});

	it('rejects normalized duplicate content within one generated batch', () => {
		const context = loadExistingRecallCardContext({
			rootDir: fixtureRoot(),
			subject: 'Biology',
			topicComponentId: 'cell-biology',
			offeringIds: ['combined-biology-higher']
		});
		expect(() =>
			assertAdditiveRecallCandidates(
				{
					cards: [
						{
							id: 'bio-first-new-card',
							conceptKey: 'first-new-concept',
							front: 'What is the new fact?',
							back: 'The new answer.'
						},
						{
							id: 'bio-second-new-card',
							conceptKey: 'second-new-concept',
							front: 'WHAT is the new fact',
							back: 'The new answer!'
						}
					]
				},
				context
			)
		).toThrow(/duplicates candidate content from bio-first-new-card/);
	});

	it('adds static Separate Science cards to the exact target snapshot', () => {
		const context = loadExistingRecallCardContext({
			rootDir: fixtureRoot(),
			subject: 'Biology',
			topicComponentId: 'aqa-gcse-biology-8461-v1.0:4-1',
			offeringIds: ['aqa-gcse-biology-8461-v1.0:higher']
		});
		expect(context.existingTargetCards).toContainEqual(
			expect.objectContaining({
				id: 'bio-diffusion-definition',
				artifactPath: 'src/lib/recall/aqaScienceRecall.ts'
			})
		);
		expect(() =>
			assertAdditiveRecallCandidates(
				{
					cards: [
						{
							id: 'bio-diffusion-copy',
							conceptKey: 'diffusion-copy',
							front: 'WHAT is diffusion',
							back: 'The net movement of particles from a region of higher concentration to a region of lower concentration!'
						}
					]
				},
				context
			)
		).toThrow(/duplicates an existing target card/);
	});
});
