export function createActivityId(prefix: string): string {
	const safePrefix = prefix.replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'activity';
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return `${safePrefix}_${crypto.randomUUID()}`;
	}
	return `${safePrefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function responseDurationMs(startedAt: number, endedAt = Date.now()): number | null {
	if (!Number.isFinite(startedAt) || startedAt <= 0 || !Number.isFinite(endedAt)) return null;
	const elapsed = Math.round(endedAt - startedAt);
	return elapsed >= 0 && elapsed <= 6 * 60 * 60 * 1000 ? elapsed : null;
}
