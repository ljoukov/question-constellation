import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const challengeGameSource = readFileSync(
	new URL('./ChallengeGame.svelte', import.meta.url),
	'utf8'
);

describe('challenge explanation support', () => {
	it('offers a teaching explanation before the learner chooses', () => {
		expect(challengeGameSource).toContain("'Explain this'");
		expect(challengeGameSource).toContain('loadShowdownExplanation');
		expect(challengeGameSource).toContain("'/api/challenges/[subject]/[slug]/explain'");
		expect(challengeGameSource).toContain('generatedExplanationParagraphs');
		expect(challengeGameSource).not.toContain('challenge.commandWordLesson');
		expect(challengeGameSource).not.toContain('approachExplanation');
	});

	it('keeps the challenge usable while the model explanation loads or fails', () => {
		expect(challengeGameSource).toContain('Building the idea around this question');
		expect(challengeGameSource).toContain('The explanation could not load.');
		expect(challengeGameSource).toContain('Try again');
	});

	it('explains why one answer scores higher after the comparison', () => {
		expect(challengeGameSource).toContain(
			'<p><MathText text={challenge.showdownExplanation} /></p>'
		);
	});

	it('does not complete a repair when support is requested', () => {
		const supportFunction = challengeGameSource.slice(
			challengeGameSource.indexOf('function explainRepairSupport()'),
			challengeGameSource.indexOf('function chooseTransfer(')
		);

		expect(supportFunction).toContain("openExplanation('repair', 'repair-support')");
		expect(supportFunction).not.toContain('chooseRepair(');
		expect(challengeGameSource).not.toContain('Show the correct fix');
		expect(challengeGameSource).not.toContain('Show one step');
	});
});
