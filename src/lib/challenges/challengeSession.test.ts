import { describe, expect, it } from 'vitest';
import {
	CHALLENGE_ROUNDS_PER_ORBIT,
	CHALLENGE_SESSION_MAX_AGE_MS,
	CHALLENGE_SESSION_STORAGE_KEY,
	challengeSessionTotals,
	chooseAutomaticInterludeMechanic,
	emptyChallengeSession,
	parseChallengeSession,
	readChallengeSession,
	recordChallengeInterlude,
	recordChallengeInterludeCompletion,
	recordChallengeRound,
	writeChallengeSession,
	type ChallengeInterludeMechanic,
	type ChallengeSessionState
} from './challengeSession';

const firstCompletedAt = '2026-07-22T10:00:00.000Z';

function memoryStorage(seed?: string) {
	const values = new Map<string, string>();
	if (seed !== undefined) values.set(CHALLENGE_SESSION_STORAGE_KEY, seed);
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value)
	};
}

function recordRound(
	session: ChallengeSessionState,
	challengeId: string,
	score: number,
	completedAt: string
): ChallengeSessionState {
	return recordChallengeRound({ session, challengeId, score, completedAt });
}

function recordInterlude(
	session: ChallengeSessionState,
	challengeId: string,
	mechanic: ChallengeInterludeMechanic,
	score: number,
	interludeCompletedAt: string
): ChallengeSessionState {
	return recordChallengeInterlude({
		session,
		challengeId,
		mechanic,
		score,
		interludeCompletedAt
	});
}

describe('challenge session orbit state', () => {
	it('starts with an empty first orbit', () => {
		expect(challengeSessionTotals(emptyChallengeSession())).toEqual({
			challengeCount: 0,
			interludeCount: 0,
			totalScore: 0,
			currentOrbitNumber: 1,
			currentOrbitPosition: 0,
			orbitComplete: false
		});
		expect(CHALLENGE_ROUNDS_PER_ORBIT).toBe(3);
	});

	it('records canonical challenge and interlude scores as ISO-timestamped v1 JSON', () => {
		const round = recordRound(
			emptyChallengeSession(),
			'biology-data-conclusions',
			450,
			firstCompletedAt
		);
		const session = recordInterlude(
			round,
			'biology-data-conclusions',
			'chain-echo',
			50,
			'2026-07-22T10:01:00.000Z'
		);

		expect(session).toEqual({
			version: 1,
			startedAt: firstCompletedAt,
			updatedAt: '2026-07-22T10:01:00.000Z',
			rounds: [
				{
					challengeId: 'biology-data-conclusions',
					score: 450,
					completedAt: firstCompletedAt,
					interludeMechanic: 'chain-echo',
					interludeScore: 50,
					interludeCompletedAt: '2026-07-22T10:01:00.000Z'
				}
			]
		});

		const storage = memoryStorage();
		writeChallengeSession(session, storage);
		expect(readChallengeSession(storage, new Date('2026-07-22T10:02:00.000Z'))).toEqual(session);
		expect(JSON.parse(storage.values.get(CHALLENGE_SESSION_STORAGE_KEY) ?? '{}')).toEqual(session);
	});

	it('does not inflate the round count or score when a challenge completion is replayed', () => {
		const first = recordRound(
			emptyChallengeSession(),
			'chemistry-alloy-hardness',
			450,
			firstCompletedAt
		);
		const lowerReplay = recordRound(
			first,
			'chemistry-alloy-hardness',
			425,
			'2026-07-22T10:01:00.000Z'
		);
		const improvedReplay = recordRound(
			lowerReplay,
			'chemistry-alloy-hardness',
			475,
			'2026-07-22T10:02:00.000Z'
		);

		expect(improvedReplay.rounds).toHaveLength(1);
		expect(improvedReplay.rounds[0]).toMatchObject({
			challengeId: 'chemistry-alloy-hardness',
			score: 475,
			completedAt: firstCompletedAt
		});
		expect(challengeSessionTotals(improvedReplay)).toMatchObject({
			challengeCount: 1,
			totalScore: 475
		});
	});

	it('restarts when replaying an older challenge while a different round is pending', () => {
		let session = recordRound(emptyChallengeSession(), 'challenge-1', 450, firstCompletedAt);
		session = recordInterlude(session, 'challenge-1', 'chain-echo', 50, '2026-07-22T10:01:00.000Z');
		session = recordRound(session, 'challenge-2', 475, '2026-07-22T10:02:00.000Z');
		session = recordRound(session, 'challenge-1', 500, '2026-07-22T10:03:00.000Z');

		expect(session.rounds).toEqual([
			{
				challengeId: 'challenge-1',
				score: 500,
				completedAt: '2026-07-22T10:03:00.000Z'
			}
		]);
	});

	it('starts a fresh orbit if the learner moves on before completing a memory beat', () => {
		let session = recordRound(emptyChallengeSession(), 'challenge-1', 400, firstCompletedAt);
		session = recordRound(session, 'challenge-2', 500, '2026-07-22T10:01:00.000Z');
		expect(session.rounds).toEqual([
			{
				challengeId: 'challenge-2',
				score: 500,
				completedAt: '2026-07-22T10:01:00.000Z'
			}
		]);

		session = emptyChallengeSession();
		session = recordRound(session, 'challenge-1', 400, '2026-07-22T10:02:00.000Z');
		session = recordInterlude(
			session,
			'challenge-1',
			'faded-examiner',
			50,
			'2026-07-22T10:03:00.000Z'
		);
		session = recordRound(session, 'challenge-2', 450, '2026-07-22T10:04:00.000Z');
		session = recordInterlude(session, 'challenge-2', 'chain-echo', 50, '2026-07-22T10:05:00.000Z');
		session = recordRound(session, 'challenge-3', 500, '2026-07-22T10:06:00.000Z');

		expect(challengeSessionTotals(session)).toEqual({
			challengeCount: 3,
			interludeCount: 2,
			totalScore: 1_450,
			currentOrbitNumber: 1,
			currentOrbitPosition: 3,
			orbitComplete: false
		});

		session = recordInterlude(
			session,
			'challenge-3',
			'evidence-sweep',
			50,
			'2026-07-22T10:07:00.000Z'
		);
		expect(challengeSessionTotals(session)).toEqual({
			challengeCount: 3,
			interludeCount: 3,
			totalScore: 1_500,
			currentOrbitNumber: 1,
			currentOrbitPosition: 3,
			orbitComplete: true
		});

		session = recordRound(session, 'challenge-4', 425, '2026-07-22T10:08:00.000Z');
		expect(challengeSessionTotals(session)).toMatchObject({
			challengeCount: 4,
			currentOrbitNumber: 2,
			currentOrbitPosition: 1,
			orbitComplete: false
		});
	});

	it('makes duplicate interlude events idempotent while retaining a higher score', () => {
		const round = recordRound(emptyChallengeSession(), 'physics-half-range', 475, firstCompletedAt);
		const first = recordInterlude(
			round,
			'physics-half-range',
			'chain-echo',
			50,
			'2026-07-22T10:01:00.000Z'
		);
		const replay = recordInterlude(
			first,
			'physics-half-range',
			'evidence-sweep',
			50,
			'2026-07-22T10:02:00.000Z'
		);

		expect(replay.rounds[0]).toMatchObject({
			interludeMechanic: 'chain-echo',
			interludeScore: 50,
			interludeCompletedAt: '2026-07-22T10:01:00.000Z'
		});
		expect(challengeSessionTotals(replay)).toMatchObject({
			interludeCount: 1,
			totalScore: 525
		});
	});

	it('expires the active session two hours after its latest activity', () => {
		const active = recordRound(
			emptyChallengeSession(),
			'biology-cell-differences',
			425,
			firstCompletedAt
		);
		const raw = JSON.stringify(active);
		const updatedAtMs = Date.parse(active.updatedAt ?? '');

		expect(parseChallengeSession(raw, updatedAtMs + CHALLENGE_SESSION_MAX_AGE_MS)).toEqual(active);
		expect(parseChallengeSession(raw, updatedAtMs + CHALLENGE_SESSION_MAX_AGE_MS + 1)).toEqual(
			emptyChallengeSession()
		);

		const fresh = recordRound(active, 'biology-cell-differences', 500, '2026-07-22T12:00:00.001Z');
		expect(fresh.rounds).toHaveLength(1);
		expect(fresh.rounds[0]).toMatchObject({ score: 500, completedAt: '2026-07-22T12:00:00.001Z' });
	});

	it('reseeds an accurate round when a memory beat finishes after session expiry', () => {
		const expiredRound = recordRound(
			emptyChallengeSession(),
			'biology-cell-differences',
			425,
			firstCompletedAt
		);
		const completedAt = '2026-07-22T12:00:00.001Z';
		const session = recordChallengeInterludeCompletion({
			session: expiredRound,
			challengeId: 'biology-cell-differences',
			challengeScore: 425,
			mechanic: 'faded-examiner',
			score: 50,
			interludeCompletedAt: completedAt
		});

		expect(session).toEqual({
			version: 1,
			startedAt: completedAt,
			updatedAt: completedAt,
			rounds: [
				{
					challengeId: 'biology-cell-differences',
					score: 425,
					completedAt,
					interludeMechanic: 'faded-examiner',
					interludeScore: 50,
					interludeCompletedAt: completedAt
				}
			]
		});
		expect(challengeSessionTotals(session)).toMatchObject({
			challengeCount: 1,
			interludeCount: 1,
			totalScore: 475,
			currentOrbitPosition: 1
		});
	});

	it('falls back to empty for corrupt, incompatible, or invalid stored state', () => {
		const valid = recordRound(
			emptyChallengeSession(),
			'biology-data-conclusions',
			450,
			firstCompletedAt
		);
		const invalidStates = [
			'{',
			JSON.stringify({ ...valid, version: 2 }),
			JSON.stringify({ ...valid, rounds: [{ ...valid.rounds[0], score: 451 }] }),
			JSON.stringify({
				...valid,
				rounds: [{ ...valid.rounds[0], interludeMechanic: 'chain-echo' }]
			}),
			JSON.stringify({
				...valid,
				rounds: [valid.rounds[0], { ...valid.rounds[0] }]
			}),
			JSON.stringify({ ...valid, updatedAt: '22 July 2026' })
		];

		for (const raw of invalidStates) {
			expect(parseChallengeSession(raw, Date.parse(firstCompletedAt))).toEqual(
				emptyChallengeSession()
			);
		}
	});

	it('handles unavailable storage without throwing and never writes an invalid state', () => {
		const unavailableStorage = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		};
		expect(readChallengeSession(unavailableStorage)).toEqual(emptyChallengeSession());
		expect(() => writeChallengeSession(emptyChallengeSession(), unavailableStorage)).not.toThrow();

		const storage = memoryStorage();
		writeChallengeSession(
			{
				version: 1,
				startedAt: firstCompletedAt,
				updatedAt: firstCompletedAt,
				rounds: [
					{
						challengeId: 'invalid-score',
						score: 451 as 450,
						completedAt: firstCompletedAt
					}
				]
			},
			storage
		);
		expect(JSON.parse(storage.values.get(CHALLENGE_SESSION_STORAGE_KEY) ?? '{}')).toEqual(
			emptyChallengeSession()
		);
	});

	it('assigns two calm-light-sharp palettes while struggle receives the orbit calm beat', () => {
		const firstRound = recordRound(emptyChallengeSession(), 'challenge-1', 475, firstCompletedAt);
		const firstComplete = recordInterlude(
			firstRound,
			'challenge-1',
			'faded-examiner',
			50,
			'2026-07-22T10:01:00.000Z'
		);
		const secondRound = recordRound(firstComplete, 'challenge-2', 475, '2026-07-22T10:02:00.000Z');
		const secondComplete = recordInterlude(
			secondRound,
			'challenge-2',
			'chain-echo',
			50,
			'2026-07-22T10:03:00.000Z'
		);
		const thirdRound = recordRound(secondComplete, 'challenge-3', 500, '2026-07-22T10:04:00.000Z');

		expect(chooseAutomaticInterludeMechanic(400, thirdRound)).toBe('faded-examiner');
		expect(chooseAutomaticInterludeMechanic(425, thirdRound.rounds)).toBe('faded-examiner');
		expect(chooseAutomaticInterludeMechanic(450, firstRound)).toBe('faded-examiner');
		expect(chooseAutomaticInterludeMechanic(475, secondRound)).toBe('chain-echo');
		expect(chooseAutomaticInterludeMechanic(500, thirdRound)).toBe('reason-match');

		const thirdComplete = recordInterlude(
			thirdRound,
			'challenge-3',
			'reason-match',
			50,
			'2026-07-22T10:05:00.000Z'
		);
		const fourthRound = recordRound(thirdComplete, 'challenge-4', 475, '2026-07-22T10:06:00.000Z');
		const fourthComplete = recordInterlude(
			fourthRound,
			'challenge-4',
			'weakness-lens',
			50,
			'2026-07-22T10:07:00.000Z'
		);
		const fifthRound = recordRound(fourthComplete, 'challenge-5', 475, '2026-07-22T10:08:00.000Z');
		const fifthComplete = recordInterlude(
			fifthRound,
			'challenge-5',
			'link-order',
			50,
			'2026-07-22T10:09:00.000Z'
		);
		const sixthRound = recordRound(fifthComplete, 'challenge-6', 500, '2026-07-22T10:10:00.000Z');

		expect(chooseAutomaticInterludeMechanic(400, fourthRound)).toBe('weakness-lens');
		expect(chooseAutomaticInterludeMechanic(475, fourthRound)).toBe('weakness-lens');
		expect(chooseAutomaticInterludeMechanic(475, fifthRound)).toBe('link-order');
		expect(chooseAutomaticInterludeMechanic(500, sixthRound)).toBe('evidence-sweep');
	});
});
