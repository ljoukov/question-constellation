export const RECALL_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export type RecallSessionScope = {
	subject: string;
	topic: string;
	kind: string;
	mode: string;
	stackSize: number;
	search: string;
	returnTo: string;
};

export type StoredRecallSession = {
	version: 2;
	scope: RecallSessionScope;
	cardContentKeys: string[];
	cardIndex: number;
	cardPositionInSession: number;
	reviewedInSession: number;
	rememberedInSession: number;
	returningSoonerInSession: number;
	revealed: boolean;
	selectedChoice: string | null;
	mcqFeedback: 'correct' | 'incorrect' | null;
	sessionId: string;
	updatedAt: number;
};

const storagePrefix = 'question-constellation.recall-session.v2';

export function recallSessionStorageKey(identity: string): string {
	return `${storagePrefix}:${encodeURIComponent(identity || 'anonymous')}`;
}

export function readRecallSession(
	raw: string | null,
	expectedScope: RecallSessionScope,
	validCardContentKeys: ReadonlySet<string>,
	now = Date.now()
): StoredRecallSession | null {
	if (!raw) return null;

	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(value) || value.version !== 2 || !isRecord(value.scope)) return null;
	if (!scopeMatches(value.scope, expectedScope)) return null;
	if (!isFiniteNumber(value.updatedAt) || now - value.updatedAt > RECALL_SESSION_MAX_AGE_MS) {
		return null;
	}
	if (!Array.isArray(value.cardContentKeys) || value.cardContentKeys.length === 0) return null;
	if (
		!value.cardContentKeys.every(
			(key) => typeof key === 'string' && validCardContentKeys.has(key)
		)
	) {
		return null;
	}
	if (new Set(value.cardContentKeys).size !== value.cardContentKeys.length) return null;
	if (!isIndex(value.cardIndex, value.cardContentKeys.length)) return null;
	if (!isIndex(value.cardPositionInSession, value.cardContentKeys.length)) return null;
	if (!isCount(value.reviewedInSession, value.cardPositionInSession)) return null;
	if (!isCount(value.rememberedInSession, value.reviewedInSession)) return null;
	if (!isCount(value.returningSoonerInSession, value.reviewedInSession)) return null;
	if (value.rememberedInSession + value.returningSoonerInSession !== value.reviewedInSession) {
		return null;
	}
	if (typeof value.revealed !== 'boolean') return null;
	if (value.selectedChoice !== null && typeof value.selectedChoice !== 'string') return null;
	if (
		value.mcqFeedback !== null &&
		value.mcqFeedback !== 'correct' &&
		value.mcqFeedback !== 'incorrect'
	) {
		return null;
	}
	if (value.mcqFeedback && !value.selectedChoice) return null;
	if (typeof value.sessionId !== 'string' || !value.sessionId) return null;

	return {
		version: 2,
		scope: expectedScope,
		cardContentKeys: value.cardContentKeys,
		cardIndex: value.cardIndex,
		cardPositionInSession: value.cardPositionInSession,
		reviewedInSession: value.reviewedInSession,
		rememberedInSession: value.rememberedInSession,
		returningSoonerInSession: value.returningSoonerInSession,
		// An MCQ choice is already checked even if the page was refreshed during the flip animation.
		revealed: value.revealed || value.selectedChoice !== null,
		selectedChoice: value.selectedChoice,
		mcqFeedback: value.mcqFeedback,
		sessionId: value.sessionId,
		updatedAt: value.updatedAt
	};
}

function scopeMatches(value: Record<string, unknown>, expected: RecallSessionScope): boolean {
	return (
		value.subject === expected.subject &&
		value.topic === expected.topic &&
		value.kind === expected.kind &&
		value.mode === expected.mode &&
		value.stackSize === expected.stackSize &&
		value.search === expected.search &&
		value.returnTo === expected.returnTo
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isIndex(value: unknown, upperBound: number): value is number {
	return Number.isInteger(value) && (value as number) >= 0 && (value as number) < upperBound;
}

function isCount(value: unknown, upperBound: number): value is number {
	return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= upperBound;
}
