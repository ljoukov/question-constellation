const RETRYABLE_REVIEW_TRANSPORT_PATTERNS = Object.freeze([
	['stream-disconnected', /stream disconnected before completion/i],
	['request-aborted', /\b(?:operation|request|turn) was aborted\b/i],
	['timeout', /\b(?:timed? ?out|timeout|ETIMEDOUT)\b/i],
	['connection-reset', /\bECONNRESET\b/i],
	['connection-refused', /\bECONNREFUSED\b/i],
	['connection-aborted', /\bECONNABORTED\b/i],
	['network-unreachable', /\b(?:ENETUNREACH|ENETDOWN|EHOSTUNREACH)\b/i],
	['dns-temporary-failure', /\b(?:EAI_AGAIN|ENOTFOUND)\b/i],
	['fetch-failed', /\bfetch failed\b/i],
	['socket-failure', /\b(?:socket|connection) (?:closed|failed|lost)\b/i],
	['rate-limited', /\b(?:429|rate limit(?:ed)?)\b/i],
	['service-unavailable', /\b(?:500|502|503|504|service unavailable|bad gateway)\b/i]
]);

export const DEFAULT_ART_REVIEW_MAX_ATTEMPTS = 4;
export const DEFAULT_ART_REVIEW_RETRY_BASE_DELAY_MS = 2_000;
export const DEFAULT_ART_REVIEW_RETRY_MAX_DELAY_MS = 8_000;

export function classifyRetryableArtReviewTransportFailure(error) {
	const message = errorMessage(error);
	for (const [kind, pattern] of RETRYABLE_REVIEW_TRANSPORT_PATTERNS) {
		if (pattern.test(message)) return { kind, message };
	}
	return null;
}

export function artReviewRetryDelayMs(
	failedAttempt,
	{
		baseDelayMs = DEFAULT_ART_REVIEW_RETRY_BASE_DELAY_MS,
		maxDelayMs = DEFAULT_ART_REVIEW_RETRY_MAX_DELAY_MS
	} = {}
) {
	if (!Number.isInteger(failedAttempt) || failedAttempt < 1) {
		throw new Error('failedAttempt must be a positive integer.');
	}
	for (const [value, label] of [
		[baseDelayMs, 'baseDelayMs'],
		[maxDelayMs, 'maxDelayMs']
	]) {
		if (!Number.isInteger(value) || value < 0) {
			throw new Error(`${label} must be a non-negative integer.`);
		}
	}
	if (maxDelayMs < baseDelayMs) {
		throw new Error('maxDelayMs must be greater than or equal to baseDelayMs.');
	}
	return Math.min(maxDelayMs, baseDelayMs * 2 ** (failedAttempt - 1));
}

export function artReviewAttemptName(attempt) {
	if (!Number.isInteger(attempt) || attempt < 1) {
		throw new Error('attempt must be a positive integer.');
	}
	return `attempt-${String(attempt).padStart(4, '0')}`;
}

export function nextArtReviewAttemptNumber(existingNames) {
	if (!Array.isArray(existingNames)) throw new Error('existingNames must be an array.');
	let highest = 0;
	for (const name of existingNames) {
		const match = /^attempt-(\d{4,})$/.exec(String(name));
		if (!match) continue;
		highest = Math.max(highest, Number(match[1]));
	}
	return highest + 1;
}

export async function waitForArtReviewRetry(delayMs) {
	if (!Number.isInteger(delayMs) || delayMs < 0) {
		throw new Error('delayMs must be a non-negative integer.');
	}
	if (delayMs === 0) return;
	await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
