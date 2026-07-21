type Row = Record<string, string | number | null>;

export type JourneySequence = {
	sessionId: string;
	steps: string[];
	label: string;
};

export function routeStage(pathValue: unknown): string {
	const path = String(pathValue || '/');
	if (path === '/') return 'Home';
	if (/\/questions\/[^/]+\/practice\/[^/]+(?:\/|$)/.test(path)) return 'Guided practice';
	if (/\/questions\/[^/]+\/practice(?:\/|$)/.test(path)) return 'Practice';
	if (/\/questions\/[^/]+\/answer-chain(?:\/|$)/.test(path)) return 'Answer chain';
	if (path.startsWith('/constellations/')) return 'Constellation';
	if (path === '/questions') return 'Questions';
	if (path === '/challenges' || path.startsWith('/challenges/')) return 'Challenges';
	if (path.startsWith('/subjects/')) return 'Subject';
	if (path.startsWith('/recall')) return 'Recall';
	if (path.startsWith('/past-papers')) return 'Past papers';
	if (path.startsWith('/questions/')) return 'Question';
	if (path.startsWith('/blog')) return 'Blog';
	if (path.startsWith('/profile')) return 'Profile';
	if (path.startsWith('/auth/')) return 'Sign in';
	return path;
}

export function buildSessionSequences(rows: Row[]): JourneySequence[] {
	const grouped = new Map<string, string[]>();
	for (const row of rows) {
		const sessionId = String(row.session_id || '');
		if (!sessionId) continue;
		const step = routeStage(row.path);
		const steps = grouped.get(sessionId) ?? [];
		if (steps.at(-1) !== step) steps.push(step);
		grouped.set(sessionId, steps);
	}
	return Array.from(grouped, ([sessionId, steps]) => ({
		sessionId,
		steps,
		label: steps.slice(0, 6).join(' → ') || 'No page views'
	}));
}

export function topJourneyPatterns(
	sequences: JourneySequence[],
	maximum = 6
): Array<{ pattern: string; sessions: number }> {
	const counts = new Map<string, number>();
	for (const sequence of sequences) {
		const pattern = sequence.steps.slice(0, 5).join(' → ') || 'No page views';
		counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
	}
	return Array.from(counts, ([pattern, sessions]) => ({ pattern, sessions }))
		.sort((left, right) => right.sessions - left.sessions || left.pattern.localeCompare(right.pattern))
		.slice(0, maximum);
}
