import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	executePersonalQuery: vi.fn(),
	queryPersonalFirst: vi.fn(),
	getSignedInLearningHome: vi.fn(),
	getSubjectLearningPublicCatalog: vi.fn(),
	getUserAppearancePreferences: vi.fn(),
	getUserChallengeProgress: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	executePersonalQuery: mocks.executePersonalQuery,
	queryPersonalFirst: mocks.queryPersonalFirst
}));

vi.mock('$lib/server/subjectLearning', () => ({
	getSignedInLearningHome: mocks.getSignedInLearningHome,
	getSubjectLearningPublicCatalog: mocks.getSubjectLearningPublicCatalog
}));

vi.mock('$lib/server/userTheme', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/server/userTheme')>();
	return {
		...original,
		getUserAppearancePreferences: mocks.getUserAppearancePreferences
	};
});

vi.mock('$lib/server/challengeProgress', () => ({
	getUserChallengeProgress: mocks.getUserChallengeProgress
}));

import type { ChallengeProgress, ChallengeProgressEntry } from '$lib/challenges/progress';
import { USER_HOME_SNAPSHOT_VERSION } from '$lib/learning/homeSnapshotTypes';
import type { SignedInLearningHome, SignedInSubjectView } from '$lib/learning/viewTypes';
import type { AdminUser } from '$lib/server/auth/session';
import {
	compactSignedInLearningHome,
	fallbackUserHomeSnapshot,
	getUserHomeSnapshot,
	parseUserHomeSnapshot,
	refreshUserHomeSnapshot,
	updateUserHomeSnapshotChallengeProjection
} from './homeSnapshot';

const user: AdminUser = {
	uid: 'learner-1',
	email: 'learner@example.test',
	name: 'Ada Lovelace',
	photoUrl: null
};

const emptyProgress: ChallengeProgress = { version: 2, challenges: {} };
const publicCatalog = { version: 1, offerings: [] };

const completedEntry: ChallengeProgressEntry = {
	startedAt: '2026-07-19T10:00:00.000Z',
	updatedAt: '2026-07-19T10:02:00.000Z',
	completedAt: '2026-07-19T10:02:00.000Z',
	plays: 1,
	lastStage: 'complete',
	bestScore: 425,
	bestTimeMs: 25_000,
	lastScore: 425,
	lastTimeMs: 25_000
};

const dashboard: SignedInLearningHome = {
	studentName: 'Ada',
	subjects: [],
	weeklySummary: {
		attemptCount: 2,
		recallCount: 3,
		closedGapCount: 1
	}
};

const biologySubject: SignedInSubjectView = {
	subject: 'Biology',
	slug: 'biology',
	href: '/subjects/biology',
	board: 'AQA',
	qualification: 'GCSE',
	course: 'Combined Science',
	tier: 'Higher',
	courseLabel: 'AQA GCSE Biology',
	scope: {
		status: 'all',
		label: 'All topics',
		unitSingular: 'topic',
		unitPlural: 'topics',
		href: '/subjects/biology/content',
		includedTopicIds: [],
		includedCount: 0,
		totalCount: 1
	},
	progress: {
		coverageCount: 0,
		coverageTotal: 1,
		coverageLabel: 'Nothing checked yet',
		secureCount: 0,
		dueCount: 0,
		examAnswerCount: 0,
		evidenceLabel: 'No evidence yet',
		checkedAnswerPerformance: {
			label: 'Checked answers',
			detail: 'Nothing checked yet.',
			value: null
		}
	},
	nextAction: {
		id: 'recall:biology',
		kind: 'recall',
		eyebrow: 'Recommended next',
		title: 'Cell biology recall',
		detail: 'Build a secure base before answering another question.',
		reason: 'This supports your next answer.',
		durationMinutes: 5,
		href: '/recall/biology/quick',
		available: true
	},
	alternatives: [],
	topics: [
		{
			id: 'cells',
			code: '4.1',
			title: 'Cell biology',
			paper: 'Paper 1',
			included: true,
			state: 'not_checked',
			stateLabel: 'Not checked',
			evidenceCount: 0,
			dueCount: 0
		}
	],
	specification: {
		code: '8464',
		url: null
	}
};

function snapshotRow({
	dirty = 1,
	sourceRevision = 1,
	snapshotRevision = 0,
	refreshedAt = new Date().toISOString(),
	snapshot = fallbackUserHomeSnapshot(user)
}: {
	dirty?: number;
	sourceRevision?: number;
	snapshotRevision?: number;
	refreshedAt?: string | null;
	snapshot?: unknown;
} = {}) {
	return {
		schema_version: USER_HOME_SNAPSHOT_VERSION,
		payload_json: JSON.stringify(snapshot),
		dirty,
		source_revision: sourceRevision,
		snapshot_revision: snapshotRevision,
		refreshed_at: refreshedAt
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.executePersonalQuery.mockResolvedValue(undefined);
	mocks.getUserAppearancePreferences.mockResolvedValue({
		themePreference: 'dark',
		visualEffectsEnabled: false
	});
	mocks.getSignedInLearningHome.mockResolvedValue(dashboard);
	mocks.getSubjectLearningPublicCatalog.mockResolvedValue(publicCatalog);
	mocks.getUserChallengeProgress.mockResolvedValue(emptyProgress);
});

describe('user home snapshot reads', () => {
	it('uses exactly one point read and never falls back to the old builders', async () => {
		mocks.queryPersonalFirst.mockResolvedValue(null);

		const result = await getUserHomeSnapshot(user);

		expect(result.status).toBe('fallback');
		expect(result.shouldRefresh).toBe(true);
		expect(result.snapshot.dashboard.studentName).toBe('Ada');
		expect(result.snapshot.challengeRecommendation).not.toBeNull();
		expect(mocks.queryPersonalFirst).toHaveBeenCalledTimes(1);
		expect(mocks.queryPersonalFirst.mock.calls[0][0]).toContain('WHERE user_id = ?');
		expect(mocks.queryPersonalFirst.mock.calls[0][1]).toEqual([user.uid]);
		expect(mocks.getSignedInLearningHome).not.toHaveBeenCalled();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
		expect(mocks.getUserAppearancePreferences).not.toHaveBeenCalled();
	});

	it('returns a fresh validated payload without any additional read', async () => {
		const snapshot = fallbackUserHomeSnapshot(user, {
			themePreference: 'dark',
			visualEffectsEnabled: false
		});
		mocks.queryPersonalFirst.mockResolvedValue({
			schema_version: USER_HOME_SNAPSHOT_VERSION,
			payload_json: JSON.stringify(snapshot),
			dirty: 0,
			source_revision: 7,
			snapshot_revision: 7,
			refreshed_at: new Date().toISOString()
		});

		await expect(getUserHomeSnapshot(user)).resolves.toEqual({
			status: 'fresh',
			snapshot,
			shouldRefresh: false
		});
		expect(mocks.queryPersonalFirst).toHaveBeenCalledTimes(1);
	});

	it('rejects version 2 rows so cached links are rebuilt for the canonical navigation', async () => {
		const currentSnapshot = fallbackUserHomeSnapshot(user);
		mocks.queryPersonalFirst.mockResolvedValue({
			schema_version: 2,
			payload_json: JSON.stringify({ ...currentSnapshot, version: 2 }),
			dirty: 0,
			source_revision: 7,
			snapshot_revision: 7,
			refreshed_at: new Date().toISOString()
		});

		const result = await getUserHomeSnapshot(user);

		expect(result.status).toBe('fallback');
		expect(result.shouldRefresh).toBe(true);
		expect(result.snapshot.version).toBe(USER_HOME_SNAPSHOT_VERSION);
	});

	it('round-trips a production-shaped snapshot with a non-empty subject view', () => {
		const home: SignedInLearningHome = {
			...dashboard,
			subjects: [biologySubject]
		};
		const snapshot = {
			...fallbackUserHomeSnapshot(user),
			dashboard: compactSignedInLearningHome(home),
			subjectViews: home.subjects
		};

		expect(parseUserHomeSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
	});

	it('keeps a valid stale payload visible and rejects corrupt projections safely', async () => {
		const snapshot = fallbackUserHomeSnapshot(user);
		mocks.queryPersonalFirst.mockResolvedValueOnce({
			schema_version: USER_HOME_SNAPSHOT_VERSION,
			payload_json: JSON.stringify(snapshot),
			dirty: 1,
			source_revision: 8,
			snapshot_revision: 7,
			refreshed_at: new Date().toISOString()
		});
		await expect(getUserHomeSnapshot(user)).resolves.toMatchObject({
			status: 'stale',
			snapshot,
			shouldRefresh: true
		});

		mocks.queryPersonalFirst.mockResolvedValueOnce({
			schema_version: USER_HOME_SNAPSHOT_VERSION,
			payload_json: JSON.stringify({
				...snapshot,
				challengeCompletedCount: 999
			}),
			dirty: 0,
			source_revision: 8,
			snapshot_revision: 8,
			refreshed_at: new Date().toISOString()
		});
		const corrupt = await getUserHomeSnapshot(user);
		expect(corrupt.status).toBe('fallback');
		expect(corrupt.shouldRefresh).toBe(true);
		expect(parseUserHomeSnapshot({ ...snapshot, version: 99 })).toBeNull();
	});

	it('refreshes time-dependent home state at least daily without adding another read', async () => {
		const snapshot = fallbackUserHomeSnapshot(user);
		mocks.queryPersonalFirst.mockResolvedValue({
			schema_version: USER_HOME_SNAPSHOT_VERSION,
			payload_json: JSON.stringify(snapshot),
			dirty: 0,
			source_revision: 3,
			snapshot_revision: 3,
			refreshed_at: '2026-01-01 00:00:00'
		});

		await expect(getUserHomeSnapshot(user)).resolves.toMatchObject({
			status: 'stale',
			snapshot,
			shouldRefresh: true
		});
		expect(mocks.queryPersonalFirst).toHaveBeenCalledTimes(1);
	});
});

describe('user home snapshot refresh', () => {
	it('builds outside the read path with recommendation persistence disabled and publishes by CAS', async () => {
		mocks.queryPersonalFirst
			.mockResolvedValueOnce(snapshotRow({ sourceRevision: 12, snapshotRevision: 11 }))
			.mockResolvedValueOnce({ source_revision: 12 })
			.mockResolvedValueOnce({ source_revision: 12 });

		const result = await refreshUserHomeSnapshot(user);

		expect(result.status).toBe('refreshed');
		expect(mocks.getSignedInLearningHome).toHaveBeenCalledWith(user, {
			persistRecommendations: false,
			publicCatalog
		});
		expect(mocks.getSubjectLearningPublicCatalog).toHaveBeenCalledOnce();
		expect(mocks.getUserAppearancePreferences).toHaveBeenCalledTimes(2);
		expect(mocks.queryPersonalFirst.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.getUserAppearancePreferences.mock.invocationCallOrder[0]
		);
		expect(mocks.getUserAppearancePreferences.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.queryPersonalFirst.mock.invocationCallOrder[1]
		);
		expect(mocks.queryPersonalFirst.mock.invocationCallOrder[1]).toBeLessThan(
			mocks.getUserAppearancePreferences.mock.invocationCallOrder[1]
		);
		expect(mocks.getUserChallengeProgress).toHaveBeenCalledWith(user.uid);
		const claimCall = mocks.queryPersonalFirst.mock.calls[1];
		expect(claimCall[0]).toContain('AND payload_json = ?');
		expect(claimCall[1]).toContain(12);
		const publishCall = mocks.queryPersonalFirst.mock.calls[2];
		expect(publishCall[0]).toContain('AND source_revision = ?');
		expect(publishCall[1].at(-1)).toBe(12);
		expect(mocks.executePersonalQuery.mock.calls[0][0]).toContain(
			'ON CONFLICT(user_id) DO NOTHING'
		);
	});

	it('does not publish across a changed source revision', async () => {
		mocks.queryPersonalFirst
			.mockResolvedValueOnce(snapshotRow({ sourceRevision: 4, snapshotRevision: 3 }))
			.mockResolvedValueOnce({ source_revision: 4 })
			.mockResolvedValueOnce(null);

		await expect(refreshUserHomeSnapshot(user)).resolves.toEqual({ status: 'superseded' });
		expect(mocks.executePersonalQuery).toHaveBeenCalledTimes(2);
		expect(mocks.executePersonalQuery.mock.calls[1][0]).toContain('refresh_claim = NULL');
	});

	it('returns a one-row no-op for a current snapshot without touching any builder', async () => {
		mocks.queryPersonalFirst.mockResolvedValueOnce(
			snapshotRow({
				dirty: 0,
				sourceRevision: 9,
				snapshotRevision: 9
			})
		);

		await expect(refreshUserHomeSnapshot(user)).resolves.toEqual({ status: 'current' });
		expect(mocks.queryPersonalFirst).toHaveBeenCalledTimes(1);
		expect(mocks.executePersonalQuery).not.toHaveBeenCalled();
		expect(mocks.getUserAppearancePreferences).not.toHaveBeenCalled();
		expect(mocks.getSignedInLearningHome).not.toHaveBeenCalled();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('does not rebuild when a concurrent refresh wins between the gate and claim', async () => {
		mocks.queryPersonalFirst
			.mockResolvedValueOnce(snapshotRow({ sourceRevision: 6, snapshotRevision: 5 }))
			.mockResolvedValueOnce(null);

		await expect(refreshUserHomeSnapshot(user)).resolves.toEqual({ status: 'busy' });
		expect(mocks.getSignedInLearningHome).not.toHaveBeenCalled();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('can still claim and repair a structurally corrupt current-looking row', async () => {
		mocks.queryPersonalFirst
			.mockResolvedValueOnce(
				snapshotRow({
					dirty: 0,
					sourceRevision: 10,
					snapshotRevision: 10,
					snapshot: { version: 1, broken: true }
				})
			)
			.mockResolvedValueOnce({ source_revision: 10 })
			.mockResolvedValueOnce({ source_revision: 10 });

		await expect(refreshUserHomeSnapshot(user)).resolves.toMatchObject({
			status: 'refreshed'
		});
		expect(mocks.getSignedInLearningHome).toHaveBeenCalledOnce();
	});
});

describe('immediate challenge projection', () => {
	it('patches canonical progress, recommendation and totals under a revision CAS', async () => {
		const progress: ChallengeProgress = {
			version: 2,
			challenges: {
				'biology-data-conclusions': completedEntry
			}
		};
		mocks.queryPersonalFirst
			.mockResolvedValueOnce({ source_revision: 20 })
			.mockResolvedValueOnce({ source_revision: 21 });

		await updateUserHomeSnapshotChallengeProjection(user.uid, progress);

		expect(mocks.queryPersonalFirst).toHaveBeenCalledTimes(2);
		const update = mocks.queryPersonalFirst.mock.calls[1];
		expect(update[0]).toContain("'$.challengeProgress'");
		expect(update[0]).toContain('snapshot_revision = source_revision');
		expect(update[0]).toContain('FROM user_challenge_progress AS canonical');
		expect(update[0]).not.toContain('dirty = 0');
		expect(update[0]).not.toContain('source_revision = source_revision + 1');
		expect(update[1]).toEqual(expect.arrayContaining([425, 1, user.uid, 1, 20]));
	});

	it('marks the snapshot stale when projection publication throws', async () => {
		const progress: ChallengeProgress = {
			version: 2,
			challenges: {
				'biology-data-conclusions': completedEntry
			}
		};
		mocks.queryPersonalFirst
			.mockResolvedValueOnce({ source_revision: 20 })
			.mockRejectedValueOnce(new Error('projection write failed'));

		await expect(updateUserHomeSnapshotChallengeProjection(user.uid, progress)).rejects.toThrow(
			'projection write failed'
		);

		expect(mocks.executePersonalQuery).toHaveBeenCalledOnce();
		expect(mocks.executePersonalQuery.mock.calls[0][0]).toContain('SET dirty = 1');
		expect(mocks.executePersonalQuery.mock.calls[0][0]).toContain(
			'source_revision = source_revision + 1'
		);
		expect(mocks.executePersonalQuery.mock.calls[0][1]).toEqual([user.uid]);
	});

	it('marks the snapshot stale after repeated canonical or revision CAS losses', async () => {
		const progress: ChallengeProgress = {
			version: 2,
			challenges: {
				'biology-data-conclusions': completedEntry
			}
		};
		mocks.queryPersonalFirst
			.mockResolvedValueOnce({ source_revision: 20 })
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ source_revision: 21 })
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ source_revision: 22 })
			.mockResolvedValueOnce(null);
		mocks.getUserChallengeProgress.mockResolvedValue(progress);

		await updateUserHomeSnapshotChallengeProjection(user.uid, progress);

		expect(mocks.getUserChallengeProgress).toHaveBeenCalledTimes(2);
		expect(mocks.executePersonalQuery).toHaveBeenCalledOnce();
		expect(mocks.executePersonalQuery.mock.calls[0][0]).toContain('SET dirty = 1');
		expect(mocks.executePersonalQuery.mock.calls[0][1]).toEqual([user.uid]);
	});
});
