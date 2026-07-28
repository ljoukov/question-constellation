import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function between(contents: string, start: string, end: string): string {
	const startIndex = contents.indexOf(start);
	const endIndex = contents.indexOf(end, startIndex + start.length);
	expect(startIndex).toBeGreaterThan(-1);
	expect(endIndex).toBeGreaterThan(startIndex);
	return contents.slice(startIndex, endIndex);
}

describe('home snapshot mutation wiring', () => {
	it('latches confirmed answer-check writes before stale UI requests are ignored', () => {
		const answerCheck = between(
			source('../routes/questions/[questionId]/practice/+page.svelte'),
			'function handleSseMessage',
			'async function readSseStream'
		);

		expect(
			answerCheck.indexOf("if (message.event === 'done') markHomeSnapshotDirty()")
		).toBeLessThan(answerCheck.indexOf('if (!gradeRequestIsCurrent(request))'));
	});

	it('latches confirmed profile writes before superseded UI responses return', () => {
		const profile = between(
			source('../routes/profile/+page.svelte'),
			'return async ({ result }) => {',
			'$effect(() =>'
		);

		expect(
			profile.indexOf('const snapshotSaveConfirmed = handleProfileSaveSnapshotResult(result)')
		).toBeLessThan(profile.indexOf('if (activeSaveController !== controller) return'));
	});

	it('hydrates challenge consumers locally without challenge-triggered root invalidations', () => {
		const progressSync = source('./challenges/progressSync.ts');
		const home = source('./learning/SignedInHome.svelte');
		const subject = source('./learning/SubjectHub.svelte');

		expect(progressSync).not.toContain('markHomeSnapshotDirty');
		expect(home).toContain('hydrateSignedInChallengeProgress(');
		expect(subject).toContain('hydrateSignedInChallengeProgress(');
	});

	it('republishes after an ambiguous local-profile import failure', () => {
		const localSync = source('./components/LocalLearnerStateSync.svelte');
		expect(localSync).toContain('serverMayHavePartiallyCommitted = true;');
		expect(localSync).toContain(
			'if (serverMayHavePartiallyCommitted) markHomeSnapshotDirty({ immediate: true });'
		);
	});
});
