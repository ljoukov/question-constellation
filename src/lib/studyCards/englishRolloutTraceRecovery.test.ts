import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
	hashStudyCardArtifact,
	validateStudyCardBundle
} from '../../../scripts/lib/study-card-artifact.mjs';
import { validateStudyCardModelLineage } from '../../../scripts/lib/study-card-model-lineage.mjs';

const literatureDir = 'data/study-cards/releases/ocr-j352-literature-standard-v1';
const historicalLanguageDir = 'data/study-cards/releases/ocr-english-language-j351-standard-v1';
const recoveredLanguageDir = `${historicalLanguageDir}-rollout-recovered-v1`;

function readJson(path: string) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

describe('English rollout trace recovery', () => {
	it('preserves the exact Literature release with commit-safe hashes for all six traces', () => {
		const artifact = validateStudyCardBundle(
			readJson(`${literatureDir}/accepted-study-cards.json`)
		);
		const evidence = readJson(`${literatureDir}/trace-recovery-evidence.json`);

		expect(hashStudyCardArtifact(artifact)).toBe(
			'f315f85ca91f288668a3ff54404bc4d52646cd9a7afb647b95df9c08e0fbdb84'
		);
		expect(artifact.cards).toHaveLength(67);
		expect(artifact.coverage).toHaveLength(19);
		expect(evidence).toMatchObject({
			status: 'content_addressed_trace_recovered',
			artifactIdentityVerified: true,
			acceptedCards: 67,
			baseAcceptedCards: 66,
			baseRejectedCards: 1,
			rejectedRepairAttempts: 1,
			acceptedRepairAttempts: 1,
			modelCallsDuringRecovery: 0,
			sourceManifestHash: '018339914752ba82509107df2bc8c16f645846f172ad3154207dff12841d5915'
		});
		expect(evidence.acceptedArtifactSha256).toBe(
			sha256(readFileSync(`${literatureDir}/accepted-study-cards.json`))
		);
		expect(Object.keys(evidence.sessions)).toHaveLength(6);
		for (const [name, session] of Object.entries(evidence.sessions) as Array<
			[
				string,
				{
					eventStreamSha256: string;
					sanitizedEventCount: number;
					promptSha256: string;
					modelOutputSha256: string;
					summarySha256: string;
				}
			]
		>) {
			expect(session.eventStreamSha256).toMatch(/^[a-f0-9]{64}$/);
			expect(session.sanitizedEventCount).toBeGreaterThan(0);
			expect(session.promptSha256).toBe(
				sha256(readFileSync(`${literatureDir}/${name}-prompt.txt`))
			);
			expect(session.modelOutputSha256).toBe(
				sha256(readFileSync(`${literatureDir}/${name}-model-output.json`))
			);
			expect(session.summarySha256).toBe(
				sha256(readFileSync(`${literatureDir}/${name}-codex-run-summary.json`))
			);
		}
	});

	it('keeps the missing Language identity quarantined and publishes recovery under a new id', () => {
		const artifact = validateStudyCardBundle(
			readJson(`${recoveredLanguageDir}/accepted-study-cards.json`)
		);
		const evidence = readJson(`${recoveredLanguageDir}/recovery-evidence.json`);

		expect(existsSync(historicalLanguageDir)).toBe(false);
		expect(artifact.release.id).toBe('ocr-english-language-j351-standard-v1-rollout-recovered-v1');
		expect(hashStudyCardArtifact(artifact)).toBe(
			'f469c3e2286c242bcc1535312eea79762e3d7cee7002dde4e34ad8493c2a15fc'
		);
		expect(artifact.cards).toHaveLength(8);
		expect(artifact.coverage).toHaveLength(2);
		expect(evidence).toMatchObject({
			status: 'reviewed_content_recovered_under_new_identity',
			historicalArtifactHash: '04daae417aabeb65fd487d2f5fea95dc2173c7ee35455278a8909d645db2c420',
			reconstructedHistoricalIdArtifactHash:
				'fd6922d75398a64c87102921db15eddc28189bdc0ca54506cf42349d7e6ed242',
			hashMismatchConfirmed: true,
			modelCallsDuringRecovery: 0
		});
		expect(evidence.acceptedArtifactSha256).toBe(
			sha256(readFileSync(`${recoveredLanguageDir}/accepted-study-cards.json`))
		);
		for (const stage of ['generation', 'review']) {
			const run = evidence.runs[stage];
			expect(run.eventStreamSha256).toMatch(/^[a-f0-9]{64}$/);
			expect(run.sanitizedEventCount).toBeGreaterThan(0);
			expect(run.promptSha256).toBe(
				sha256(readFileSync(`${recoveredLanguageDir}/${stage}-prompt.txt`))
			);
			expect(run.modelOutputSha256).toBe(
				sha256(readFileSync(`${recoveredLanguageDir}/${stage}-model-output.json`))
			);
			expect(run.summarySha256).toBe(
				sha256(readFileSync(`${recoveredLanguageDir}/${stage}-codex-run-summary.json`))
			);
		}
	});

	it('ignores raw rollout and nested SDK event streams throughout release directories', () => {
		for (const relativePath of [
			`${literatureDir}/base-generation-rollout-source.jsonl`,
			`${recoveredLanguageDir}/review-rollout-source.jsonl`,
			'data/study-cards/releases/future-release/review-events.jsonl',
			'data/study-cards/releases/future-release/nested/review/events.jsonl'
		]) {
			expect(execFileSync('git', ['check-ignore', relativePath], { encoding: 'utf8' }).trim()).toBe(
				relativePath
			);
		}
	});

	it('retains content-addressed Computer Science and Geography recovery traces', () => {
		for (const releaseId of [
			'aqa-computer-science-2027-standard-v1',
			'aqa-geography-8035-standard-v1'
		]) {
			const releaseDir = `data/study-cards/releases/${releaseId}`;
			const evidence = readJson(`${releaseDir}/rollout-trace-evidence.json`);
			expect(evidence).toMatchObject({
				status: 'passed',
				releaseId,
				acceptedArtifactSha256: sha256(readFileSync(`${releaseDir}/accepted-study-cards.json`))
			});
			for (const stage of ['generation', 'review']) {
				const run = evidence.runs[stage];
				expect(run.eventStreamSha256).toMatch(/^[a-f0-9]{64}$/);
				expect(run.sanitizedEventCount).toBeGreaterThan(0);
				expect(run.promptSha256).toBe(sha256(readFileSync(`${releaseDir}/${stage}-prompt.txt`)));
				expect(run.modelOutputSha256).toBe(
					sha256(readFileSync(`${releaseDir}/${stage}-model-output.json`))
				);
				expect(run.summarySha256).toBe(
					sha256(readFileSync(`${releaseDir}/${stage}-codex-run-summary.json`))
				);
			}
		}
	});

	it('validates all reconstructed release lineages without requiring raw JSONL', () => {
		for (const releaseId of [
			'aqa-computer-science-2027-standard-v1',
			'aqa-geography-8035-standard-v1',
			'ocr-english-language-j351-standard-v1-rollout-recovered-v1',
			'ocr-j352-literature-standard-v1'
		]) {
			expect(
				validateStudyCardModelLineage({
					releaseDir: `data/study-cards/releases/${releaseId}`,
					rootDir: process.cwd()
				})
			).toMatchObject({ releaseId });
		}
	});
});

function sha256(value: string | Buffer) {
	return createHash('sha256').update(value).digest('hex');
}
