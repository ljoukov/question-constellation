import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const reviewerPath = fileURLToPath(new URL('./review-science-question-art.mjs', import.meta.url));

test('reviewer exposes a bounded same-prompt retry ceiling', () => {
	const result = spawnSync(process.execPath, [reviewerPath, '--help'], { encoding: 'utf8' });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /--max-attempts=<1-8>/);
	assert.match(result.stdout, /Same-prompt transport\/format attempts/);
	assert.match(result.stdout, /--reuse-review=<review-summary\.json>/);
});

test('review retries preserve failed evidence without putting errors into the model prompt', () => {
	const source = readFileSync(reviewerPath, 'utf8');
	assert.match(source, /classifyRetryableArtReviewTransportFailure\(error\)/);
	assert.match(source, /recordReviewAttemptFailure\(attemptDir/);
	assert.match(source, /review-transport-circuit-open/);
	assert.match(source, /const prompt = reviewPrompt\(specs, requestSha256\)/);
	assert.doesNotMatch(source, /reviewPrompt\(specs, requestSha256,\s*(?:error|failure)/);
	assert.doesNotMatch(source, /prompt\s*\+=\s*.*(?:error|failure)/i);
});

test('cross-review reuse is limited to unchanged all-accepted batches in a new evidence root', () => {
	const source = readFileSync(reviewerPath, 'utf8');
	assert.match(source, /--reuse-review requires a new absent output root/);
	assert.match(source, /canonicalHash\(priorInput\) !== canonicalHash\(reviewInput\)/);
	assert.match(source, /canonicalHash\(priorRequest\) !== canonicalHash\(reviewRequest\)/);
	assert.match(source, /reviewPrompt\(specs, canonicalHash\(reviewRequest\)\)/);
	assert.match(source, /review\.accepted !== true/);
	assert.match(source, /reusePriorAcceptedBatch/);
});

test('reviewer reserves theme regeneration for task-relevant cross-theme changes', () => {
	const source = readFileSync(reviewerPath, 'utf8');
	assert.match(source, /dark and light are independent fresh generations/);
	assert.match(source, /They may use different geometry or incidental props/);
	assert.match(source, /dark\/light rendering-medium mismatch that preserves/);
	assert.match(
		source,
		/Set themeConsistent=false only when a variant visibly changes a task-relevant/
	);
	assert.match(source, /A single loose repeated prop that looks slightly different/);
	assert.match(source, /omission of nonfunctional contextual props/);
	assert.match(source, /A brief-specific prop list is not itself a functional diagram requirement/);
	assert.match(source, /Incidental standard glassware graduations/);
	assert.match(source, /materially changes the task or scientific interpretation/);
	assert.match(source, /does not by itself turn an unmarked decorative exhibition model/);
	assert.match(source, /only approximately proportioned/);
	assert.match(source, /literal answer-neutral still life of the exact named starting materials/);
	assert.match(source, /Do not require probabilistic raster art to draw counted electron shells/);
});
