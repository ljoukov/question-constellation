export async function runBoundedScienceChallengeAuthoringAttempts({
	maxAttempts,
	startAttempt = 1,
	initialPrompt,
	executeAttempt,
	evaluateAttempt,
	buildRetryPrompt,
	recordAttempt = async () => {},
	recordRetryPrompt = async () => {}
}) {
	if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
		throw new Error('maxAttempts must be a positive integer.');
	}
	if (!Number.isInteger(startAttempt) || startAttempt < 1 || startAttempt > maxAttempts) {
		throw new Error('startAttempt must be a positive integer no greater than maxAttempts.');
	}
	if (typeof initialPrompt !== 'string' || !initialPrompt.trim()) {
		throw new Error('initialPrompt must be a non-empty string.');
	}
	for (const [name, callback] of [
		['executeAttempt', executeAttempt],
		['evaluateAttempt', evaluateAttempt],
		['buildRetryPrompt', buildRetryPrompt],
		['recordAttempt', recordAttempt],
		['recordRetryPrompt', recordRetryPrompt]
	]) {
		if (typeof callback !== 'function') throw new Error(`${name} must be a function.`);
	}

	let prompt = initialPrompt;
	let lastOutcome = null;
	for (let attempt = startAttempt; attempt <= maxAttempts; attempt += 1) {
		let run = null;
		let transportIssue = null;
		try {
			run = await executeAttempt({ attempt, prompt });
		} catch (error) {
			transportIssue = `Authoring transport failed: ${errorMessage(error)}`;
		}

		const evaluation = await evaluateAttempt({
			attempt,
			prompt,
			run,
			transportIssue
		});
		if (!evaluation || typeof evaluation !== 'object' || Array.isArray(evaluation)) {
			throw new Error('evaluateAttempt must return an object.');
		}
		const issues = Array.isArray(evaluation.issues) ? [...evaluation.issues] : [];
		if (transportIssue && !issues.includes(transportIssue)) issues.unshift(transportIssue);
		const status =
			transportIssue === null && evaluation.status === 'passed' && issues.length === 0
				? 'passed'
				: 'failed';
		const outcome = {
			...evaluation,
			status,
			issues,
			attempt,
			prompt,
			run,
			transportIssue
		};
		await recordAttempt(outcome);
		if (status === 'passed') return outcome;

		lastOutcome = outcome;
		if (attempt < maxAttempts) {
			const nextPrompt = await buildRetryPrompt(outcome);
			if (typeof nextPrompt !== 'string' || !nextPrompt.trim()) {
				throw new Error('buildRetryPrompt must return a non-empty string.');
			}
			prompt = nextPrompt;
			await recordRetryPrompt({
				attempt: attempt + 1,
				prompt,
				previousOutcome: outcome
			});
		}
	}
	return lastOutcome;
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
