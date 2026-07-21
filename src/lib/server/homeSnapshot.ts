import { publicChallengePreviewDefinition } from '$lib/challenges/authoredData';
import { challengeCatalog } from '$lib/challenges/catalog';
import {
	challengeProgressTotals,
	emptyChallengeProgress,
	parseChallengeProgress,
	type ChallengeProgress
} from '$lib/challenges/progress';
import { recommendedUnfinishedChallenge } from '$lib/challenges/recommendations';
import {
	USER_HOME_SNAPSHOT_VERSION,
	type UserHomeChallengeRecommendation,
	type UserHomeDashboard,
	type UserHomeSnapshot,
	type UserHomeSnapshotReadResult,
	type UserHomeSnapshotRefreshResult,
	type UserHomeSubject
} from '$lib/learning/homeSnapshotTypes';
import type {
	CurriculumTopicProgressView,
	LearningActionView,
	SignedInLearningHome,
	SignedInSubjectView
} from '$lib/learning/viewTypes';
import type { AdminUser } from '$lib/server/auth/session';
import { executePersonalQuery, queryPersonalFirst } from '$lib/server/db';
import {
	getSignedInLearningHome,
	getSubjectLearningPublicCatalog
} from '$lib/server/subjectLearning';
import {
	getUserAppearancePreferences,
	safeThemePreference,
	type UserAppearancePreferences
} from '$lib/server/userTheme';

const REFRESH_CLAIM_STALE_AFTER_MINUTES = 2;
const CHALLENGE_PROJECTION_CAS_ATTEMPTS = 3;
const HOME_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const challengeProjectionIds = challengeCatalog.map((challenge) => challenge.id);
const challengeProjectionPlaceholders = challengeProjectionIds.map(() => '?').join(', ');

type HomeSnapshotRow = {
	schema_version: number;
	payload_json: string;
	dirty: number;
	source_revision: number;
	snapshot_revision: number;
	refreshed_at: string | null;
};

type RefreshClaimRow = {
	source_revision: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeText(value: unknown, maxLength = 500): string | null {
	return typeof value === 'string' && value.length <= maxLength ? value : null;
}

function safeCount(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10_000_000
		? value
		: null;
}

function firstName(value: string | null | undefined): string {
	return (value ?? '').trim().split(/\s+/)[0] ?? '';
}

function databaseTimestampMs(value: string | null): number {
	if (!value) return Number.NaN;
	const sqliteUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
		? `${value.replace(' ', 'T')}Z`
		: value;
	return Date.parse(sqliteUtc);
}

function compactSubject(subject: SignedInLearningHome['subjects'][number]): UserHomeSubject {
	return {
		subject: subject.subject,
		href: subject.href,
		courseLabel: subject.courseLabel,
		scope: {
			status: subject.scope.status,
			unitPlural: subject.scope.unitPlural,
			includedCount: subject.scope.includedCount,
			totalCount: subject.scope.totalCount
		},
		progress: {
			coverageCount: subject.progress.coverageCount,
			coverageLabel: subject.progress.coverageLabel,
			secureCount: subject.progress.secureCount,
			dueCount: subject.progress.dueCount,
			examAnswerCount: subject.progress.examAnswerCount,
			checkedAnswerPerformance: {
				label: subject.progress.checkedAnswerPerformance.label,
				value: subject.progress.checkedAnswerPerformance.value
			}
		},
		nextAction: {
			kind: subject.nextAction.kind,
			title: subject.nextAction.title,
			durationMinutes: subject.nextAction.durationMinutes,
			href: subject.nextAction.href
		}
	};
}

export function compactSignedInLearningHome(home: SignedInLearningHome): UserHomeDashboard {
	return {
		studentName: home.studentName,
		subjects: home.subjects.map(compactSubject),
		weeklySummary: { ...home.weeklySummary }
	};
}

function challengeRecommendation(
	progress: ChallengeProgress
): UserHomeChallengeRecommendation | null {
	const challenge = recommendedUnfinishedChallenge(challengeCatalog, progress);
	if (!challenge) return null;
	const preview = publicChallengePreviewDefinition(challenge);
	return {
		id: preview.id,
		slug: preview.slug,
		subject: preview.subject,
		title: preview.title,
		hook: preview.hook
	};
}

function withChallengeProjection(
	progress: ChallengeProgress
): Pick<
	UserHomeSnapshot,
	| 'challengeProgress'
	| 'challengeRecommendation'
	| 'challengeCompletedCount'
	| 'challengeTotalBestScore'
> {
	const totals = challengeProgressTotals(progress);
	return {
		challengeProgress: progress,
		challengeRecommendation: challengeRecommendation(progress),
		challengeCompletedCount: totals.completedCount,
		challengeTotalBestScore: totals.totalBestScore
	};
}

export function fallbackUserHomeSnapshot(
	user: AdminUser,
	appearance: UserAppearancePreferences = {
		themePreference: 'auto',
		visualEffectsEnabled: true
	}
): UserHomeSnapshot {
	return {
		version: USER_HOME_SNAPSHOT_VERSION,
		dashboard: {
			studentName: firstName(user.name),
			subjects: [],
			weeklySummary: {
				attemptCount: 0,
				recallCount: 0,
				closedGapCount: 0
			}
		},
		subjectViews: [],
		appearance,
		...withChallengeProjection(emptyChallengeProgress())
	};
}

function parseDurationMinutes(value: unknown): number | null | undefined {
	return value === null ||
		(typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 24 * 60)
		? value
		: undefined;
}

function parseActionKind(value: unknown): LearningActionView['kind'] | null {
	return value === 'scope' ||
		value === 'resume' ||
		value === 'recall' ||
		value === 'close_gap' ||
		value === 'apply_chain' ||
		value === 'subject'
		? value
		: null;
}

function parseHomeAction(value: unknown): UserHomeSubject['nextAction'] | null {
	if (!isRecord(value)) return null;
	const kind = parseActionKind(value.kind);
	const title = safeText(value.title);
	const href = safeText(value.href, 2_000);
	const durationMinutes = parseDurationMinutes(value.durationMinutes);
	return kind && title !== null && href !== null && durationMinutes !== undefined
		? { kind, title, durationMinutes, href }
		: null;
}

function parseLearningAction(value: unknown): LearningActionView | null {
	if (!isRecord(value)) return null;
	const id = safeText(value.id, 500);
	const kind = parseActionKind(value.kind);
	const eyebrow = safeText(value.eyebrow, 500);
	const title = safeText(value.title, 1_000);
	const detail = safeText(value.detail, 2_000);
	const durationMinutes = parseDurationMinutes(value.durationMinutes);
	const href = safeText(value.href, 2_000);
	const available = typeof value.available === 'boolean' ? value.available : null;
	return id !== null &&
		kind &&
		eyebrow !== null &&
		title !== null &&
		detail !== null &&
		durationMinutes !== undefined &&
		href !== null &&
		available !== null
		? { id, kind, eyebrow, title, detail, durationMinutes, href, available }
		: null;
}

function parseHomeSubject(value: unknown): UserHomeSubject | null {
	if (!isRecord(value) || !isRecord(value.scope) || !isRecord(value.progress)) return null;
	const checked = value.progress.checkedAnswerPerformance;
	if (!isRecord(checked)) return null;
	const subject = safeText(value.subject, 120);
	const href = safeText(value.href, 2_000);
	const courseLabel = safeText(value.courseLabel, 300);
	const unitPlural = safeText(value.scope.unitPlural, 120);
	const scopeStatus =
		value.scope.status === 'not_set' ||
		value.scope.status === 'all' ||
		value.scope.status === 'selected' ||
		value.scope.status === 'not_available'
			? value.scope.status
			: null;
	const includedCount = safeCount(value.scope.includedCount);
	const totalCount = safeCount(value.scope.totalCount);
	const coverageCount = safeCount(value.progress.coverageCount);
	const coverageLabel = safeText(value.progress.coverageLabel, 300);
	const secureCount = safeCount(value.progress.secureCount);
	const dueCount = safeCount(value.progress.dueCount);
	const examAnswerCount = safeCount(value.progress.examAnswerCount);
	const performanceLabel = safeText(checked.label, 300);
	const performanceValue =
		checked.value === null
			? null
			: typeof checked.value === 'string' && checked.value.length <= 120
				? checked.value
				: undefined;
	const nextAction = parseHomeAction(value.nextAction);
	if (
		subject === null ||
		href === null ||
		courseLabel === null ||
		!scopeStatus ||
		unitPlural === null ||
		includedCount === null ||
		totalCount === null ||
		coverageCount === null ||
		coverageLabel === null ||
		secureCount === null ||
		dueCount === null ||
		examAnswerCount === null ||
		performanceLabel === null ||
		performanceValue === undefined ||
		!nextAction
	) {
		return null;
	}
	return {
		subject,
		href,
		courseLabel,
		scope: {
			status: scopeStatus,
			unitPlural,
			includedCount,
			totalCount
		},
		progress: {
			coverageCount,
			coverageLabel,
			secureCount,
			dueCount,
			examAnswerCount,
			checkedAnswerPerformance: {
				label: performanceLabel,
				value: performanceValue
			}
		},
		nextAction
	};
}

function parseDashboard(value: unknown): UserHomeDashboard | null {
	if (!isRecord(value) || !Array.isArray(value.subjects) || !isRecord(value.weeklySummary)) {
		return null;
	}
	const studentName = safeText(value.studentName, 200);
	const attemptCount = safeCount(value.weeklySummary.attemptCount);
	const recallCount = safeCount(value.weeklySummary.recallCount);
	const closedGapCount = safeCount(value.weeklySummary.closedGapCount);
	const subjects = value.subjects.map(parseHomeSubject);
	if (
		studentName === null ||
		attemptCount === null ||
		recallCount === null ||
		closedGapCount === null ||
		subjects.some((subject) => !subject)
	) {
		return null;
	}
	return {
		studentName,
		subjects: subjects as UserHomeSubject[],
		weeklySummary: { attemptCount, recallCount, closedGapCount }
	};
}

function parseNullableText(value: unknown, maxLength: number): string | null | undefined {
	return value === null ? null : (safeText(value, maxLength) ?? undefined);
}

function parseTopicProgress(value: unknown): CurriculumTopicProgressView | null {
	if (!isRecord(value)) return null;
	const id = safeText(value.id, 500);
	const code = safeText(value.code, 200);
	const title = safeText(value.title, 1_000);
	const paper = safeText(value.paper, 500);
	const included = typeof value.included === 'boolean' ? value.included : null;
	const state =
		value.state === 'not_checked' ||
		value.state === 'developing' ||
		value.state === 'secure' ||
		value.state === 'due' ||
		value.state === 'conflicting'
			? value.state
			: null;
	const stateLabel = safeText(value.stateLabel, 500);
	const evidenceCount = safeCount(value.evidenceCount);
	const dueCount = safeCount(value.dueCount);
	return id !== null &&
		code !== null &&
		title !== null &&
		paper !== null &&
		included !== null &&
		state &&
		stateLabel !== null &&
		evidenceCount !== null &&
		dueCount !== null
		? { id, code, title, paper, included, state, stateLabel, evidenceCount, dueCount }
		: null;
}

function parseSubjectView(value: unknown): SignedInSubjectView | null {
	if (
		!isRecord(value) ||
		!isRecord(value.scope) ||
		!isRecord(value.progress) ||
		!isRecord(value.progress.checkedAnswerPerformance) ||
		!isRecord(value.specification) ||
		!Array.isArray(value.alternatives) ||
		!Array.isArray(value.topics) ||
		value.alternatives.length > 32 ||
		value.topics.length > 1_000
	) {
		return null;
	}
	const subject = safeText(value.subject, 120);
	const slug = safeText(value.slug, 200);
	const href = safeText(value.href, 2_000);
	const board = safeText(value.board, 120);
	const qualification = safeText(value.qualification, 120);
	const course = safeText(value.course, 300);
	const tier = safeText(value.tier, 120);
	const courseLabel = safeText(value.courseLabel, 500);
	const scopeStatus =
		value.scope.status === 'not_set' ||
		value.scope.status === 'all' ||
		value.scope.status === 'selected' ||
		value.scope.status === 'not_available'
			? value.scope.status
			: null;
	const scopeLabel = safeText(value.scope.label, 1_000);
	const unitSingular = safeText(value.scope.unitSingular, 120);
	const unitPlural = safeText(value.scope.unitPlural, 120);
	const scopeHref = parseNullableText(value.scope.href, 2_000);
	const includedTopicIds = Array.isArray(value.scope.includedTopicIds)
		? value.scope.includedTopicIds.map((id) => safeText(id, 500))
		: null;
	const includedCount = safeCount(value.scope.includedCount);
	const totalCount = safeCount(value.scope.totalCount);
	const coverageCount = safeCount(value.progress.coverageCount);
	const coverageTotal = safeCount(value.progress.coverageTotal);
	const coverageLabel = safeText(value.progress.coverageLabel, 1_000);
	const secureCount = safeCount(value.progress.secureCount);
	const dueCount = safeCount(value.progress.dueCount);
	const examAnswerCount = safeCount(value.progress.examAnswerCount);
	const evidenceLabel = safeText(value.progress.evidenceLabel, 1_000);
	const checked = value.progress.checkedAnswerPerformance;
	const performanceLabel = safeText(checked.label, 500);
	const performanceDetail = safeText(checked.detail, 2_000);
	const performanceValue = parseNullableText(checked.value, 200);
	const nextAction = parseLearningAction(value.nextAction);
	const alternatives = value.alternatives.map(parseLearningAction);
	const topics = value.topics.map(parseTopicProgress);
	const specificationCode = parseNullableText(value.specification.code, 200);
	const specificationUrl = parseNullableText(value.specification.url, 2_000);
	if (
		subject === null ||
		slug === null ||
		href === null ||
		board === null ||
		qualification === null ||
		course === null ||
		tier === null ||
		courseLabel === null ||
		!scopeStatus ||
		scopeLabel === null ||
		unitSingular === null ||
		unitPlural === null ||
		scopeHref === undefined ||
		!includedTopicIds ||
		includedTopicIds.some((id) => id === null) ||
		new Set(includedTopicIds).size !== includedTopicIds.length ||
		includedCount === null ||
		totalCount === null ||
		includedCount > totalCount ||
		coverageCount === null ||
		coverageTotal === null ||
		coverageLabel === null ||
		secureCount === null ||
		dueCount === null ||
		examAnswerCount === null ||
		evidenceLabel === null ||
		performanceLabel === null ||
		performanceDetail === null ||
		performanceValue === undefined ||
		!nextAction ||
		alternatives.some((action) => !action) ||
		topics.some((topic) => !topic) ||
		specificationCode === undefined ||
		specificationUrl === undefined
	) {
		return null;
	}
	return {
		subject,
		slug,
		href,
		board,
		qualification,
		course,
		tier,
		courseLabel,
		scope: {
			status: scopeStatus,
			label: scopeLabel,
			unitSingular,
			unitPlural,
			href: scopeHref,
			includedTopicIds: includedTopicIds as string[],
			includedCount,
			totalCount
		},
		progress: {
			coverageCount,
			coverageTotal,
			coverageLabel,
			secureCount,
			dueCount,
			examAnswerCount,
			evidenceLabel,
			checkedAnswerPerformance: {
				label: performanceLabel,
				detail: performanceDetail,
				value: performanceValue
			}
		},
		nextAction,
		alternatives: alternatives as LearningActionView[],
		topics: topics as CurriculumTopicProgressView[],
		specification: { code: specificationCode, url: specificationUrl }
	};
}

function parseChallengeRecommendation(
	value: unknown
): UserHomeChallengeRecommendation | null | undefined {
	if (value === null) return null;
	if (!isRecord(value)) return undefined;
	const id = safeText(value.id, 120);
	const slug = safeText(value.slug, 120);
	const title = safeText(value.title);
	const hook = safeText(value.hook, 1_000);
	const subject =
		value.subject === 'biology' || value.subject === 'chemistry' || value.subject === 'physics'
			? value.subject
			: null;
	return id !== null && slug !== null && title !== null && hook !== null && subject
		? { id, slug, subject, title, hook }
		: undefined;
}

export function parseUserHomeSnapshot(value: unknown): UserHomeSnapshot | null {
	if (
		!isRecord(value) ||
		value.version !== USER_HOME_SNAPSHOT_VERSION ||
		!isRecord(value.appearance) ||
		!isRecord(value.challengeProgress) ||
		!Array.isArray(value.subjectViews) ||
		value.subjectViews.length > 32
	) {
		return null;
	}
	const dashboard = parseDashboard(value.dashboard);
	const subjectViews = value.subjectViews.map(parseSubjectView);
	const themePreference =
		value.appearance.themePreference === safeThemePreference(value.appearance.themePreference)
			? safeThemePreference(value.appearance.themePreference)
			: null;
	const visualEffectsEnabled =
		typeof value.appearance.visualEffectsEnabled === 'boolean'
			? value.appearance.visualEffectsEnabled
			: null;
	const rawChallengeKeys = isRecord(value.challengeProgress.challenges)
		? Object.keys(value.challengeProgress.challenges)
		: null;
	const progress = parseChallengeProgress(JSON.stringify(value.challengeProgress));
	const recommendation = parseChallengeRecommendation(value.challengeRecommendation);
	const totals = challengeProgressTotals(progress);
	if (
		!dashboard ||
		subjectViews.some((subject) => !subject) ||
		!themePreference ||
		visualEffectsEnabled === null ||
		value.challengeProgress.version !== 2 ||
		!rawChallengeKeys ||
		rawChallengeKeys.length !== Object.keys(progress.challenges).length ||
		JSON.stringify(value.challengeProgress) !== JSON.stringify(progress) ||
		recommendation === undefined ||
		value.challengeCompletedCount !== totals.completedCount ||
		value.challengeTotalBestScore !== totals.totalBestScore
	) {
		return null;
	}

	const expectedRecommendation = challengeRecommendation(progress);
	if (JSON.stringify(recommendation) !== JSON.stringify(expectedRecommendation)) return null;
	const parsedSubjectViews = subjectViews as SignedInSubjectView[];
	if (
		JSON.stringify(dashboard.subjects) !==
		JSON.stringify(parsedSubjectViews.map((subject) => compactSubject(subject)))
	) {
		return null;
	}

	return {
		version: USER_HOME_SNAPSHOT_VERSION,
		dashboard,
		subjectViews: parsedSubjectViews,
		appearance: { themePreference, visualEffectsEnabled },
		...withChallengeProjection(progress)
	};
}

function parseSnapshotJson(raw: string): UserHomeSnapshot | null {
	try {
		return parseUserHomeSnapshot(JSON.parse(raw) as unknown);
	} catch {
		return null;
	}
}

function snapshotFromRow(row: HomeSnapshotRow): UserHomeSnapshot | null {
	return row.schema_version === USER_HOME_SNAPSHOT_VERSION
		? parseSnapshotJson(row.payload_json)
		: null;
}

function snapshotRowIsStale(row: HomeSnapshotRow): boolean {
	const refreshedAtMs = databaseTimestampMs(row.refreshed_at);
	return (
		row.dirty !== 0 ||
		row.source_revision !== row.snapshot_revision ||
		!Number.isFinite(refreshedAtMs) ||
		Date.now() - refreshedAtMs >= HOME_SNAPSHOT_MAX_AGE_MS
	);
}

async function readHomeSnapshotRow(userId: string): Promise<HomeSnapshotRow | null> {
	return await queryPersonalFirst<HomeSnapshotRow>(
		`SELECT schema_version, payload_json, dirty, source_revision, snapshot_revision,
		        refreshed_at
		   FROM user_home_snapshots
		  WHERE user_id = ?`,
		[userId]
	);
}

/**
 * The signed-in home critical path is deliberately one primary-key point read.
 * Missing, stale-schema, or corrupt rows return a bundled fallback and ask the
 * caller to schedule a refresh; they never invoke the old learner-data fanout.
 */
export async function getUserHomeSnapshot(user: AdminUser): Promise<UserHomeSnapshotReadResult> {
	let row: HomeSnapshotRow | null;
	try {
		row = await readHomeSnapshotRow(user.uid);
	} catch {
		return {
			status: 'fallback',
			snapshot: fallbackUserHomeSnapshot(user),
			shouldRefresh: true
		};
	}

	if (!row) {
		return {
			status: 'fallback',
			snapshot: fallbackUserHomeSnapshot(user),
			shouldRefresh: true
		};
	}
	const snapshot = snapshotFromRow(row);
	if (!snapshot) {
		return {
			status: 'fallback',
			snapshot: fallbackUserHomeSnapshot(user),
			shouldRefresh: true
		};
	}
	const stale = snapshotRowIsStale(row);
	return {
		status: stale ? 'stale' : 'fresh',
		snapshot,
		shouldRefresh: stale
	};
}

function builtSnapshot(
	home: SignedInLearningHome,
	appearance: UserAppearancePreferences,
	progress: ChallengeProgress
): UserHomeSnapshot {
	return {
		version: USER_HOME_SNAPSHOT_VERSION,
		dashboard: compactSignedInLearningHome(home),
		subjectViews: home.subjects,
		appearance,
		...withChallengeProjection(progress)
	};
}

async function releaseRefreshClaim(userId: string, claim: string): Promise<void> {
	await executePersonalQuery(
		`UPDATE user_home_snapshots
		    SET refresh_claim = NULL,
		        refresh_claimed_at = NULL,
		        updated_at = CURRENT_TIMESTAMP
		  WHERE user_id = ? AND refresh_claim = ?`,
		[userId, claim]
	);
}

/**
 * Refresh work is intentionally separate from getUserHomeSnapshot. The claim
 * prevents duplicate builders, and source_revision makes publication a CAS:
 * any learner write during the build keeps the old snapshot dirty.
 */
export async function refreshUserHomeSnapshot(
	user: AdminUser
): Promise<UserHomeSnapshotRefreshResult> {
	const claim = crypto.randomUUID();
	try {
		// An authenticated POST must not be able to force the expensive legacy
		// builder when the point-readable row is already current.
		const observed = await readHomeSnapshotRow(user.uid);
		if (observed && snapshotFromRow(observed) && !snapshotRowIsStale(observed)) {
			return { status: 'current' };
		}

		// This also creates a first-time profile before the source revision is
		// claimed, avoiding a guaranteed CAS loss for a brand-new account.
		const initialAppearance = await getUserAppearancePreferences(user);
		const fallback = fallbackUserHomeSnapshot(user, initialAppearance);
		await executePersonalQuery(
			`INSERT INTO user_home_snapshots (
			   user_id, schema_version, payload_json, dirty,
			   source_revision, snapshot_revision
			 ) VALUES (?, ?, ?, 1, 0, 0)
			 ON CONFLICT(user_id) DO NOTHING`,
			[user.uid, USER_HOME_SNAPSHOT_VERSION, JSON.stringify(fallback)]
		);
		const observedClaimFence = observed
			? `AND schema_version = ?
			   AND payload_json = ?
			   AND dirty = ?
			   AND source_revision = ?
			   AND snapshot_revision = ?
			   AND refreshed_at IS ?`
			: 'AND dirty = 1';
		const observedClaimParams = observed
			? [
					observed.schema_version,
					observed.payload_json,
					observed.dirty,
					observed.source_revision,
					observed.snapshot_revision,
					observed.refreshed_at
				]
			: [];
		const claimed = await queryPersonalFirst<RefreshClaimRow>(
			`UPDATE user_home_snapshots
			    SET refresh_claim = ?,
			        refresh_claimed_at = CURRENT_TIMESTAMP,
			        updated_at = CURRENT_TIMESTAMP
			  WHERE user_id = ?
			    ${observedClaimFence}
			    AND (
			      refresh_claim IS NULL
			      OR refresh_claimed_at < datetime(
			        'now',
			        '-' || ? || ' minutes'
			      )
			    )
			  RETURNING source_revision`,
			[claim, user.uid, ...observedClaimParams, REFRESH_CLAIM_STALE_AFTER_MINUTES]
		);
		if (!claimed) return { status: 'busy' };

		const { getUserChallengeProgress } = await import('$lib/server/challengeProgress');
		const publicCatalogPromise = getSubjectLearningPublicCatalog();
		const [appearance, home, progress] = await Promise.all([
			getUserAppearancePreferences(user),
			publicCatalogPromise.then((publicCatalog) =>
				getSignedInLearningHome(user, {
					persistRecommendations: false,
					publicCatalog
				})
			),
			getUserChallengeProgress(user.uid)
		]);
		const snapshot = builtSnapshot(home, appearance, progress);
		const published = await queryPersonalFirst<{ source_revision: number }>(
			`UPDATE user_home_snapshots
			    SET schema_version = ?,
			        payload_json = ?,
			        dirty = 0,
			        snapshot_revision = source_revision,
			        refresh_claim = NULL,
			        refresh_claimed_at = NULL,
			        refreshed_at = CURRENT_TIMESTAMP,
			        updated_at = CURRENT_TIMESTAMP
			  WHERE user_id = ?
			    AND refresh_claim = ?
			    AND source_revision = ?
			  RETURNING source_revision`,
			[
				USER_HOME_SNAPSHOT_VERSION,
				JSON.stringify(snapshot),
				user.uid,
				claim,
				claimed.source_revision
			]
		);
		if (!published) {
			await releaseRefreshClaim(user.uid, claim);
			return { status: 'superseded' };
		}
		return { status: 'refreshed', snapshot };
	} catch (error) {
		console.warn('[home-snapshot] refresh failed', {
			error: error instanceof Error ? error.message : String(error)
		});
		try {
			await releaseRefreshClaim(user.uid, claim);
		} catch {
			// A failed best-effort release expires naturally after two minutes.
		}
		return { status: 'failed' };
	}
}

export async function invalidateUserHomeSnapshotForRepair(userId: string): Promise<void> {
	try {
		await executePersonalQuery(
			`UPDATE user_home_snapshots
			    SET dirty = 1,
			        source_revision = source_revision + 1,
			        updated_at = CURRENT_TIMESTAMP
			  WHERE user_id = ?`,
			[userId]
		);
	} catch {
		// This is a cache repair signal. The canonical challenge write remains
		// successful even when the snapshot table itself is unavailable.
	}
}

/**
 * Challenge import/completion is already canonicalised by its own merge. Patch
 * all home challenge fields under both the snapshot revision CAS and an exact
 * canonical-progress fence. Progress-table triggers advance source_revision;
 * successful publication catches snapshot_revision up without clearing dirty
 * state owned by any other learner-data source.
 */
export async function updateUserHomeSnapshotChallengeProjection(
	userId: string,
	initialProgress: ChallengeProgress
): Promise<void> {
	let progress = initialProgress;
	try {
		for (let attempt = 0; attempt < CHALLENGE_PROJECTION_CAS_ATTEMPTS; attempt += 1) {
			const row = await queryPersonalFirst<{ source_revision: number }>(
				`SELECT source_revision
				   FROM user_home_snapshots
				  WHERE user_id = ?
				    AND schema_version = ?`,
				[userId, USER_HOME_SNAPSHOT_VERSION]
			);
			if (!row) return;
			const projection = withChallengeProjection(progress);
			const serializedProgress = JSON.stringify(projection.challengeProgress);
			const updated = await queryPersonalFirst<{ source_revision: number }>(
				`UPDATE user_home_snapshots
			    SET payload_json = json_set(
			          payload_json,
			          '$.challengeProgress', json(?),
			          '$.challengeRecommendation', json(?),
			          '$.challengeCompletedCount', ?,
			          '$.challengeTotalBestScore', ?
			        ),
			        snapshot_revision = source_revision,
			        updated_at = CURRENT_TIMESTAMP
			  WHERE user_id = ?
			    AND schema_version = ?
			    AND source_revision = ?
			    AND NOT EXISTS (
			      SELECT 1
			        FROM user_challenge_progress AS canonical
			       WHERE canonical.user_id = ?
			         AND canonical.challenge_id IN (${challengeProjectionPlaceholders})
			         AND NOT EXISTS (
			           SELECT 1
			             FROM json_each(json_extract(?, '$.challenges')) AS projected
			            WHERE projected.key = canonical.challenge_id
			              AND json_extract(projected.value, '$.startedAt')
			                    IS canonical.started_at
			              AND json_extract(projected.value, '$.updatedAt')
			                    IS canonical.updated_at
			              AND json_extract(projected.value, '$.completedAt')
			                    IS canonical.completed_at
			              AND json_extract(projected.value, '$.plays')
			                    IS canonical.plays
			              AND json_extract(projected.value, '$.lastStage')
			                    IS canonical.last_stage
			              AND json_extract(projected.value, '$.bestScore')
			                    IS canonical.best_score
			              AND json_extract(projected.value, '$.bestTimeMs')
			                    IS canonical.best_time_ms
			              AND json_extract(projected.value, '$.lastScore')
			                    IS canonical.last_score
			              AND json_extract(projected.value, '$.lastTimeMs')
			                    IS canonical.last_time_ms
			         )
			    )
			    AND NOT EXISTS (
			      SELECT 1
			        FROM json_each(json_extract(?, '$.challenges')) AS projected
			        LEFT JOIN user_challenge_progress AS canonical
			          ON canonical.user_id = ?
			         AND canonical.challenge_id = projected.key
			       WHERE canonical.challenge_id IS NULL
			    )
			  RETURNING source_revision`,
				[
					serializedProgress,
					JSON.stringify(projection.challengeRecommendation),
					projection.challengeCompletedCount,
					projection.challengeTotalBestScore,
					userId,
					USER_HOME_SNAPSHOT_VERSION,
					row.source_revision,
					userId,
					...challengeProjectionIds,
					serializedProgress,
					serializedProgress,
					userId
				]
			);
			if (updated) return;

			if (attempt + 1 < CHALLENGE_PROJECTION_CAS_ATTEMPTS) {
				const { getUserChallengeProgress } = await import('$lib/server/challengeProgress');
				progress = await getUserChallengeProgress(userId);
			}
		}
	} catch (error) {
		await invalidateUserHomeSnapshotForRepair(userId);
		throw error;
	}

	await invalidateUserHomeSnapshotForRepair(userId);
}
