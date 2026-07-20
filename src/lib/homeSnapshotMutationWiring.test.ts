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
	it('latches confirmed science and English SSE writes before stale UI requests are ignored', () => {
		const science = between(
			source('../routes/questions/[questionId]/practice/+page.svelte'),
			'function handleSseMessage',
			'async function readSseStream'
		);
		const english = between(
			source('./components/EnglishGuidedPractice.svelte'),
			'function handleSseMessage',
			'async function readSseStream'
		);

		for (const handler of [science, english]) {
			expect(handler.indexOf("if (message.event === 'done') markHomeSnapshotDirty()")).toBeLessThan(
				handler.indexOf('if (!gradeRequestIsCurrent(request))')
			);
		}
	});

	it('latches confirmed gap and profile writes before superseded UI responses return', () => {
		const gap = between(
			source('../routes/gaps/[gapId]/+page.svelte'),
			'async function submitFinal',
			'function finalRequestIsCurrent'
		);
		const profile = between(
			source('../routes/profile/+page.svelte'),
			'return async ({ result }) => {',
			'$effect(() =>'
		);

		expect(
			gap.indexOf('if (response.ok || response.status >= 500) markHomeSnapshotDirty()')
		).toBeLessThan(gap.indexOf('if (!finalRequestIsCurrent(request))'));
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
