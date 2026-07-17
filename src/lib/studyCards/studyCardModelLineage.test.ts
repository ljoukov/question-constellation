import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	hashStudyCardArtifact,
	validateStudyCardBundle
} from '../../../scripts/lib/study-card-artifact.mjs';
import {
	materializeStudyCardModelLineage,
	validateStudyCardModelLineage
} from '../../../scripts/lib/study-card-model-lineage.mjs';
import { studyCardArtifactFixture } from './studyCardTestFixtures';

const temporaryRoots: string[] = [];

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('study-card model lineage', () => {
	it('retains exact content-addressed provenance after ignored event streams disappear', () => {
		const prepared = prepareRelease();
		const lineage = materializeStudyCardModelLineage(prepared);

		expect(lineage).toMatchObject({
			releaseId: prepared.bundle.release.id,
			artifactHash: hashStudyCardArtifact(prepared.bundle),
			generatorRunIds: [prepared.bundle.release.generator.runId],
			reviewerRunIds: [prepared.bundle.release.reviewer.runId],
			runs: 2
		});
		const evidence = readJson(path.join(prepared.releaseDir, 'model-lineage-evidence.json'));
		expect(evidence.schemaVersion).toBe('study-card-model-lineage-v2');
		expect(evidence.artifact).toMatchObject({
			acceptedCardContent: [
				{
					cardId: prepared.bundle.cards[0].id,
					semanticSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
				}
			],
			acceptedCardContentSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
		});
		expect(evidence.runs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					role: 'generator',
					eventStream: expect.objectContaining({
						sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
						sanitizedEventCount: 2
					}),
					prompt: expect.objectContaining({ sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
					modelOutput: expect.objectContaining({
						sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
					})
				}),
				expect.objectContaining({ role: 'reviewer' })
			])
		);
		expect(evidence.linkage).toMatchObject({
			contentProjection: 'study-card-learner-content-v1',
			generatorOutputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
			reviewerInputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
			reviewerOutputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
			generatedAcceptedCardContentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
			reviewedAcceptedCardContentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
			acceptedArtifactSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
		});

		rmSync(path.join(prepared.releaseDir, 'generation-events.jsonl'));
		rmSync(path.join(prepared.releaseDir, 'review-events.jsonl'));
		expect(validateStudyCardModelLineage(prepared)).toMatchObject({ runs: 2 });
	});

	it('fails closed on prompt, summary, model-output, role, or artifact drift', () => {
		const prepared = prepareRelease();
		materializeStudyCardModelLineage(prepared);

		writeFileSync(path.join(prepared.releaseDir, 'review-prompt.txt'), 'tampered\n');
		expect(() => validateStudyCardModelLineage(prepared)).toThrow(/prompt SHA-256 drifted/);

		writeJson(path.join(prepared.releaseDir, 'review-prompt.txt'), { restored: false });
		const fixture = prepareRelease();
		materializeStudyCardModelLineage(fixture);
		const artifactPath = path.join(fixture.releaseDir, 'accepted-study-cards.json');
		writeFileSync(artifactPath, `${readFileSync(artifactPath, 'utf8')}\n`);
		expect(() => validateStudyCardModelLineage(fixture)).toThrow(/artifact identity\/hash/);
	});

	it('rejects accepted learner content changed after generation and review under the same card id', () => {
		const prepared = prepareRelease();
		const artifactPath = path.join(prepared.releaseDir, 'accepted-study-cards.json');
		const tamperedInput = readJson(artifactPath);
		tamperedInput.cards[0].front = 'Which altered prompt was never generated or reviewed?';
		const tampered = validateStudyCardBundle(tamperedInput);
		writeJson(artifactPath, tamperedInput);
		writeJson(path.join(prepared.releaseDir, 'generation-run.json'), {
			status: 'accepted',
			artifactPath: tampered.release.artifactPath,
			artifactHash: hashStudyCardArtifact(tampered),
			sourceManifestHash: tampered.release.sourceManifestHash
		});

		expect(() => materializeStudyCardModelLineage(prepared)).toThrow(
			/learner content.*generator output/i
		);
	});
});

function prepareRelease() {
	const rootDir = mkdtempSync(path.join(os.tmpdir(), 'study-card-lineage-'));
	temporaryRoots.push(rootDir);
	const input = studyCardArtifactFixture();
	const bundle = validateStudyCardBundle(input);
	const releaseDir = path.join(rootDir, 'release');
	mkdirSync(releaseDir, { recursive: true });
	writeJson(path.join(releaseDir, 'accepted-study-cards.json'), input);
	writeJson(path.join(releaseDir, 'generation-run.json'), {
		status: 'accepted',
		artifactPath: bundle.release.artifactPath,
		artifactHash: hashStudyCardArtifact(bundle),
		sourceManifestHash: bundle.release.sourceManifestHash
	});
	writeFileSync(path.join(releaseDir, 'generation-prompt.txt'), 'Generate one exact card.\n');
	writeJson(path.join(releaseDir, 'generation-model-output.json'), {
		cards: [input.cards[0]]
	});
	writeFileSync(
		path.join(releaseDir, 'review-prompt.txt'),
		`Review one exact card.\n\nCandidates:\n${JSON.stringify({ cards: [input.cards[0]] }, null, 2)}\n`
	);
	writeJson(path.join(releaseDir, 'review-model-output.json'), {
		reviews: [{ cardId: bundle.cards[0].id, accepted: true, issues: [] }]
	});
	writeJson(path.join(releaseDir, 'generation-codex-run-summary.json'), {
		status: 'passed',
		threadId: bundle.release.generator.runId,
		model: 'gpt-5.6-sol',
		thinkingLevel: 'max',
		startedAt: bundle.release.startedAt,
		finishedAt: '2026-07-16T10:05:00.000Z'
	});
	writeJson(path.join(releaseDir, 'review-codex-run-summary.json'), {
		status: 'passed',
		threadId: bundle.release.reviewer.runId,
		model: 'gpt-5.6-sol',
		thinkingLevel: 'max',
		startedAt: '2026-07-16T10:06:00.000Z',
		finishedAt: bundle.release.finishedAt
	});
	const events = `${JSON.stringify({ type: 'thread.started' })}\n${JSON.stringify({ type: 'turn.completed' })}\n`;
	writeFileSync(path.join(releaseDir, 'generation-events.jsonl'), events);
	writeFileSync(path.join(releaseDir, 'review-events.jsonl'), events);
	return { rootDir, releaseDir, bundle };
}

function writeJson(filePath: string, value: unknown) {
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath: string) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}
