#!/usr/bin/env node

import { d1Query, loadD1Env } from './lib/d1-rest.mjs';

const rootDir = process.cwd();
loadD1Env(rootDir);

const requestedChallengeRoute = process.argv
	.find((argument) => argument.startsWith('--challenge-route='))
	?.split('=', 2)[1];

if (requestedChallengeRoute && !isChallengeRoute(requestedChallengeRoute)) {
	throw new Error('--challenge-route must be a safe challenge detail path.');
}

const checks = [];

async function measuredQuery({ id, binding, sql, params, budget = 1, required = true }) {
	const startedAt = performance.now();
	const result = await d1Query(sql, params, { rootDir, binding });
	const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
	const rowsRead = Number(result.meta?.rows_read);
	if (!Number.isSafeInteger(rowsRead) || rowsRead < 0) {
		throw new Error(`${id} did not return a valid D1 rows_read metric.`);
	}
	if (required && result.results.length !== 1) {
		throw new Error(`${id} expected exactly one result row; received ${result.results.length}.`);
	}
	const check = {
		id,
		binding,
		rowsRead,
		budget,
		resultRows: result.results.length,
		elapsedMs,
		passed: rowsRead <= budget
	};
	checks.push(check);
	return { ...result, check };
}

const publicHome = await measuredQuery({
	id: 'public-home-payload',
	binding: 'QUESTION_DB',
	sql: `SELECT payload_json
	        FROM public_route_payloads
	       WHERE id = ?
	       LIMIT 1`,
	params: ['home:public-summary']
});

const challengeIndex = await measuredQuery({
	id: 'active-challenge-index',
	binding: 'QUESTION_DB',
	sql: `SELECT payload_json,
	            content_sha256 AS payload_sha256,
	            release_id,
	            release_sha256
	       FROM challenge_active_route_payloads
	      WHERE route_path = ?
	      LIMIT 1`,
	params: ['/_challenge-index']
});
const challengeRoute =
	requestedChallengeRoute ?? representativeChallengeRoute(challengeIndex.results[0]?.payload_json);

const challengeHub = await measuredQuery({
	id: 'active-challenge-hub',
	binding: 'QUESTION_DB',
	sql: `SELECT payload_json,
	            content_sha256 AS payload_sha256,
	            release_id,
	            release_sha256
	       FROM challenge_active_route_payloads
	      WHERE route_path = ?
	      LIMIT 1`,
	params: ['/challenges']
});

const challengeSubject = challengeRoute.split('/')[2];
const challengeSubjectPage = await measuredQuery({
	id: `active-challenge-subject-${challengeSubject}`,
	binding: 'QUESTION_DB',
	sql: `SELECT payload_json,
	            content_sha256 AS payload_sha256,
	            release_id,
	            release_sha256
	       FROM challenge_active_route_payloads
	      WHERE route_path = ?
	      LIMIT 1`,
	params: [`/challenges/${challengeSubject}`]
});

const challengeDetail = await measuredQuery({
	id: 'active-challenge-detail',
	binding: 'QUESTION_DB',
	sql: `SELECT payload_json,
	            content_sha256 AS payload_sha256,
	            release_id,
	            release_sha256
	       FROM challenge_active_route_payloads
	      WHERE route_path = ?
	      LIMIT 1`,
	params: [challengeRoute]
});

const leaderboards = Object.fromEntries(
	await Promise.all(
		['all', 'biology', 'chemistry', 'physics'].map(async (scope) => {
			const result = await measuredQuery({
				id: `challenge-leaderboard-${scope}`,
				binding: 'PERSONAL_DB',
				sql: `SELECT participants_json
				        FROM challenge_leaderboard_snapshots
				       WHERE scope = ?
				       LIMIT 1`,
				params: [scope]
			});
			return [scope, result];
		})
	)
);

const sampleHomeUser = await d1Query(
	`SELECT user_id
	   FROM user_home_snapshots
	  LIMIT 1`,
	[],
	{ rootDir, binding: 'PERSONAL_DB' }
);
const sampleUserId = sampleHomeUser.results[0]?.user_id;
let personalHome = null;
if (typeof sampleUserId === 'string' && sampleUserId.length > 0) {
	personalHome = await measuredQuery({
		id: 'personal-home-snapshot',
		binding: 'PERSONAL_DB',
		sql: `SELECT schema_version, payload_json, dirty, source_revision, snapshot_revision,
		            refreshed_at
		       FROM user_home_snapshots
		      WHERE user_id = ?`,
		params: [sampleUserId]
	});
}

const pageBudgets = {
	anonymousHome: pageBudget(publicHome.check.rowsRead, 1),
	anonymousChallengeHub: pageBudget(
		challengeHub.check.rowsRead + leaderboards.all.check.rowsRead,
		2
	),
	anonymousChallengeSubject: pageBudget(
		challengeSubjectPage.check.rowsRead + leaderboards[challengeSubject].check.rowsRead,
		2
	),
	anonymousChallenge: pageBudget(
		challengeDetail.check.rowsRead + leaderboards[challengeSubject].check.rowsRead,
		2
	)
};
if (personalHome) {
	pageBudgets.signedInHome = pageBudget(
		personalHome.check.rowsRead + challengeIndex.check.rowsRead,
		2
	);
	pageBudgets.signedInChallengeHub = pageBudget(
		personalHome.check.rowsRead + challengeHub.check.rowsRead + leaderboards.all.check.rowsRead,
		3
	);
	pageBudgets.signedInChallengeSubject = pageBudget(
		personalHome.check.rowsRead +
			challengeSubjectPage.check.rowsRead +
			leaderboards[challengeSubject].check.rowsRead,
		3
	);
	pageBudgets.signedInChallenge = pageBudget(
		personalHome.check.rowsRead +
			challengeDetail.check.rowsRead +
			leaderboards[challengeSubject].check.rowsRead,
		3
	);
}

const failedChecks = checks.filter((check) => !check.passed);
const failedPages = Object.entries(pageBudgets).filter(([, page]) => !page.passed);
const report = {
	status: failedChecks.length === 0 && failedPages.length === 0 ? 'passed' : 'failed',
	challengeRoute,
	checks,
	pageBudgets,
	personalSnapshotSample: personalHome ? 'available' : 'unavailable',
	note: 'Page totals cover content reads on the SSR critical path; analytics writes are separate.'
};
console.log(JSON.stringify(report, null, 2));

if (report.status !== 'passed') process.exitCode = 1;

function pageBudget(rowsRead, budget) {
	return { rowsRead, budget, passed: rowsRead <= budget };
}

function representativeChallengeRoute(rawPayload) {
	let payload;
	try {
		payload = JSON.parse(rawPayload);
	} catch {
		throw new Error('The active challenge index payload is not valid JSON.');
	}
	const firstChallenge = payload?.challenges?.[0];
	const route = `/challenges/${firstChallenge?.subject ?? ''}/${firstChallenge?.slug ?? ''}`;
	if (!isChallengeRoute(route)) {
		throw new Error('The active challenge index has no safe representative detail route.');
	}
	return route;
}

function isChallengeRoute(value) {
	return /^\/challenges\/(?:biology|chemistry|physics)\/[a-z0-9][a-z0-9-]*$/u.test(value);
}
