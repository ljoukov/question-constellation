export const PRACTICE_PAPER_DURATIONS = [30, 45, 60] as const;

export type PracticePaperDuration = (typeof PRACTICE_PAPER_DURATIONS)[number];

export type PracticePaperCandidate = {
	id: string;
	topicId: string;
	marks: number | null;
};

type PaperShape = {
	targetMarks: number;
	minimumQuestions: number;
	maximumQuestions: number;
};

const paperShapeByDuration: Record<PracticePaperDuration, PaperShape> = {
	30: { targetMarks: 24, minimumQuestions: 6, maximumQuestions: 8 },
	45: { targetMarks: 36, minimumQuestions: 8, maximumQuestions: 10 },
	60: { targetMarks: 48, minimumQuestions: 10, maximumQuestions: 12 }
};

export function normalizePracticePaperDuration(
	value: string | number | null | undefined
): PracticePaperDuration {
	const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
	return PRACTICE_PAPER_DURATIONS.includes(parsed as PracticePaperDuration)
		? (parsed as PracticePaperDuration)
		: 60;
}

function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function seededOrder<T extends { id: string }>(items: readonly T[], seed: string): T[] {
	return [...items].sort(
		(left, right) =>
			hashString(`${seed}\u0000${left.id}`) - hashString(`${seed}\u0000${right.id}`) ||
			left.id.localeCompare(right.id)
	);
}

/**
 * Builds a stable, mixed practice paper from reviewed atomic questions. Topic
 * selection is optional: an empty selection means the learner wants a broad
 * paper across every available topic.
 */
export function buildPracticePaperSelection<T extends PracticePaperCandidate>({
	questions,
	selectedTopicIds,
	seed,
	durationMinutes
}: {
	questions: readonly T[];
	selectedTopicIds: readonly string[];
	seed: string;
	durationMinutes: PracticePaperDuration;
}): T[] {
	const requestedTopics = new Set(selectedTopicIds.filter(Boolean));
	const eligible = questions.filter(
		(question) =>
			Number.isFinite(question.marks) &&
			(question.marks ?? 0) > 0 &&
			(requestedTopics.size === 0 || requestedTopics.has(question.topicId))
	);
	if (eligible.length === 0) return [];

	const byTopic = new Map<string, T[]>();
	for (const question of eligible) {
		const topicQuestions = byTopic.get(question.topicId) ?? [];
		topicQuestions.push(question);
		byTopic.set(question.topicId, topicQuestions);
	}
	for (const [topicId, topicQuestions] of byTopic) {
		byTopic.set(topicId, seededOrder(topicQuestions, `${seed}:${topicId}`));
	}

	const topicIds = seededOrder(
		[...byTopic.keys()].map((id) => ({ id })),
		`${seed}:topics`
	).map(({ id }) => id);
	const shape = paperShapeByDuration[durationMinutes];
	const selected: T[] = [];
	let totalMarks = 0;
	let round = 0;

	while (selected.length < shape.maximumQuestions) {
		let addedThisRound = false;
		for (const topicId of topicIds) {
			const candidate = byTopic.get(topicId)?.[round];
			if (!candidate) continue;
			selected.push(candidate);
			totalMarks += candidate.marks ?? 0;
			addedThisRound = true;
			if (selected.length >= shape.maximumQuestions) break;
			if (selected.length >= shape.minimumQuestions && totalMarks >= shape.targetMarks) break;
		}
		if (!addedThisRound) break;
		if (selected.length >= shape.minimumQuestions && totalMarks >= shape.targetMarks) break;
		round += 1;
	}

	// A paper should build gently: shorter questions first, then the longer
	// explanations and evaluations. Seeded ordering breaks ties without drift.
	return selected.sort(
		(left, right) =>
			(left.marks ?? 0) - (right.marks ?? 0) ||
			hashString(`${seed}:paper:${left.id}`) - hashString(`${seed}:paper:${right.id}`)
	);
}

export function estimatedPracticePaperMinutes(totalMarks: number): number {
	if (!Number.isFinite(totalMarks) || totalMarks <= 0) return 0;
	return Math.max(15, Math.ceil((totalMarks * 1.2) / 5) * 5);
}
