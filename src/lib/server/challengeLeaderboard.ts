import type {
	ChallengeLeaderboardEntry,
	ChallengeLeaderboardSnapshot
} from '$lib/challenges/leaderboard';
import type { ChallengeProgress } from '$lib/challenges/progress';
import type { ChallengeSubject } from '$lib/challenges/types';
import { executePersonalQuery, queryPersonalFirst } from '$lib/server/db';

const aliasAdjectives = [
	'Amber',
	'Bright',
	'Calm',
	'Copper',
	'Curious',
	'Deep',
	'Electric',
	'Green',
	'Hidden',
	'Keen',
	'Lucid',
	'Mint',
	'North',
	'Open',
	'Quiet',
	'Rapid',
	'Ready',
	'Silver',
	'Solar',
	'Steady',
	'Swift',
	'True',
	'Vivid'
] as const;

const aliasNouns = [
	'Comet',
	'Falcon',
	'Fox',
	'Kite',
	'Lantern',
	'Lynx',
	'Meteor',
	'Nova',
	'Orbit',
	'Owl',
	'Pilot',
	'Pioneer',
	'Pulse',
	'Raven',
	'Rocket',
	'Signal',
	'Spark',
	'Star',
	'Vector',
	'Venture',
	'Voyager'
] as const;

export type ChallengeLeaderboardScope = 'all' | ChallengeSubject;

type LeaderboardSnapshotRow = {
	participants_json: string;
};

type StoredLeaderboardParticipant = {
	score: number;
	completed: number;
};

type RankedLeaderboardParticipant = StoredLeaderboardParticipant & {
	identityKey: string;
	rank: number;
};

export async function challengeLeaderboardAlias(userId: string): Promise<string> {
	return await challengeLeaderboardAliasForIdentityKey(challengeLeaderboardIdentityKey(userId));
}

export function challengeLeaderboardIdentityKey(userId: string): string {
	return Array.from(new TextEncoder().encode(userId.trim()), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('');
}

async function challengeLeaderboardAliasForIdentityKey(identityKey: string): Promise<string> {
	const payload = new TextEncoder().encode(
		`question-constellation:challenge-board:v2:${identityKey}`
	);
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', payload));
	const adjective = aliasAdjectives[(digest[0] ?? 0) % aliasAdjectives.length];
	const noun = aliasNouns[(digest[1] ?? 0) % aliasNouns.length];
	return `${adjective} ${noun}`;
}

export async function getChallengeLeaderboard({
	scope,
	currentUserId = null,
	limit = 5
}: {
	scope: ChallengeLeaderboardScope;
	currentUserId?: string | null;
	limit?: number;
}): Promise<ChallengeLeaderboardSnapshot> {
	const safeLimit = Math.min(10, Math.max(3, Math.floor(limit)));
	if (!isChallengeLeaderboardScope(scope)) {
		return { entries: [], currentUserEntry: null, participantCount: 0 };
	}

	const row = await queryPersonalFirst<LeaderboardSnapshotRow>(
		`SELECT participants_json
		   FROM challenge_leaderboard_snapshots
		  WHERE scope = ?
		  LIMIT 1`,
		[scope]
	);
	const ranked = rankedParticipants(row?.participants_json);
	const currentIdentityKey = currentUserId ? challengeLeaderboardIdentityKey(currentUserId) : '';
	const visible = await Promise.all(
		ranked
			.slice(0, safeLimit)
			.map((participant) => toPublicLeaderboardEntry(participant, currentIdentityKey))
	);
	const currentOutside =
		currentIdentityKey && ranked.length > safeLimit
			? ranked.find((participant) => participant.identityKey === currentIdentityKey)
			: null;

	return {
		entries: visible,
		currentUserEntry:
			currentOutside && currentOutside.rank > safeLimit
				? await toPublicLeaderboardEntry(currentOutside, currentIdentityKey)
				: null,
		participantCount: ranked.length
	};
}

export async function updateChallengeLeaderboardProjection(
	userId: string,
	progress: ChallengeProgress
): Promise<void> {
	const identityKey = challengeLeaderboardIdentityKey(userId);
	if (!identityKey) return;

	const scopes: ChallengeLeaderboardScope[] = ['all', 'biology', 'chemistry', 'physics'];
	const totals = Object.fromEntries(
		scopes.map((scope) => [scope, { score: 0, completed: 0 }])
	) as Record<ChallengeLeaderboardScope, StoredLeaderboardParticipant>;
	for (const [challengeId, entry] of Object.entries(progress.challenges)) {
		if (entry.bestScore === null) continue;
		totals.all.score += entry.bestScore;
		totals.all.completed += 1;
		const subject = challengeSubjectFromId(challengeId);
		if (!subject) continue;
		totals[subject].score += entry.bestScore;
		totals[subject].completed += 1;
	}

	const jsonPath = `$."${identityKey}"`;
	const cases: string[] = [];
	const params: Array<string | number> = [];
	for (const scope of scopes) {
		cases.push(
			`WHEN '${scope}' THEN
			   CASE
			     WHEN ? = 0 THEN json_remove(participants_json, ?)
			     ELSE json_set(participants_json, ?, json(?))
			   END`
		);
		params.push(totals[scope].completed, jsonPath, jsonPath, JSON.stringify(totals[scope]));
	}
	await executePersonalQuery(
		`UPDATE challenge_leaderboard_snapshots
		    SET participants_json = CASE scope
		          ${cases.join('\n')}
		          ELSE participants_json
		        END,
		        updated_at = CURRENT_TIMESTAMP
		  WHERE scope IN ('all', 'biology', 'chemistry', 'physics')`,
		params
	);
}

async function toPublicLeaderboardEntry(
	entry: RankedLeaderboardParticipant,
	currentIdentityKey: string
): Promise<ChallengeLeaderboardEntry> {
	return {
		rank: entry.rank,
		alias: await challengeLeaderboardAliasForIdentityKey(entry.identityKey),
		score: entry.score,
		completed: entry.completed,
		isCurrentUser: Boolean(currentIdentityKey && entry.identityKey === currentIdentityKey)
	};
}

function rankedParticipants(raw: string | null | undefined): RankedLeaderboardParticipant[] {
	if (!raw) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch {
		return [];
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

	return Object.entries(parsed)
		.flatMap(([identityKey, value]) => {
			if (
				!/^(?:[0-9a-f]{2}){1,256}$/u.test(identityKey) ||
				!value ||
				typeof value !== 'object' ||
				Array.isArray(value)
			) {
				return [];
			}
			const score = boundedNonNegativeInteger(
				(value as Partial<StoredLeaderboardParticipant>).score
			);
			const completed = boundedPositiveInteger(
				(value as Partial<StoredLeaderboardParticipant>).completed
			);
			return score === null || completed === null ? [] : [{ identityKey, score, completed }];
		})
		.sort(
			(a, b) =>
				b.score - a.score || b.completed - a.completed || a.identityKey.localeCompare(b.identityKey)
		)
		.map((participant, index) => ({ ...participant, rank: index + 1 }));
}

function challengeSubjectFromId(challengeId: string): ChallengeSubject | null {
	if (challengeId.startsWith('biology-')) return 'biology';
	if (challengeId.startsWith('chemistry-')) return 'chemistry';
	if (challengeId.startsWith('physics-')) return 'physics';
	return null;
}

function isChallengeLeaderboardScope(value: string): value is ChallengeLeaderboardScope {
	return value === 'all' || value === 'biology' || value === 'chemistry' || value === 'physics';
}

function boundedPositiveInteger(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1_000_000
		? value
		: null;
}

function boundedNonNegativeInteger(value: unknown): number | null {
	return typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= 0 &&
		value <= 1_000_000_000
		? value
		: null;
}
