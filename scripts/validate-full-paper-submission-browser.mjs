#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- This operator harness validates generic browser and D1 evidence at runtime.

import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
	DEV_AUTH_CLEANUP_CONFIRMATION,
	DISPOSABLE_DEV_AUTH_USER_ID,
	PERSONAL_CLEANUP_TABLES,
	analyticsCleanupStatements,
	devAuthCleanupInventory,
	personalCleanupStatements
} from './cleanup-dev-auth-data.mjs';
import { d1Batch, d1Rows, loadD1Env } from './lib/d1-rest.mjs';
import { fingerprintPaperSittingContent } from '../src/lib/server/paperSittingContentFingerprint.js';
import {
	CdpClient,
	VIEWPORTS,
	captureScreenshot,
	collectLayoutEvidence,
	delay,
	evaluate,
	forceTheme,
	launchChrome,
	safeUrl,
	sanitizeText,
	settlePageAssets,
	waitForDocumentReady,
	waitUntil
} from './validate-release-browser.mjs';

const PAPER_STORAGE_PREFIX = 'question-constellation:paper-sitting:v4:';
const DEFAULT_APPROVED_SLUG = 'aqa-8464p2h-jun24';
const DEFAULT_OUTPUT = 'docs/release-evidence/full-paper-submission-validation';
const REQUIRED_PERSONAL_MIGRATION = '0008_paper_sitting_sessions.sql';
const REQUIRED_SITTING_TRIGGERS = Object.freeze([
	'user_paper_sitting_sessions_one_way_status',
	'user_paper_sitting_sessions_immutable_identity'
]);
const REQUIRED_SITTING_COLUMNS = Object.freeze([
	'id',
	'user_id',
	'nonce_hash',
	'paper_slug',
	'status',
	'started_at_ms',
	'submitted_at_ms',
	'completed_at_ms',
	'answers_json',
	'response_durations_json',
	'results_json',
	'grade_responses_json',
	'graded_question_refs_json',
	'version'
]);

const usage = `Usage:
node scripts/validate-full-paper-submission-browser.mjs [options]

Default behavior is a read-only preflight. It does not launch Chrome, start a sitting,
submit answers, call a model, clean data, or write evidence files.

Options:
  --base-url=http://127.0.0.1:5173
  --output=${DEFAULT_OUTPUT}
  --approved-slug=${DEFAULT_APPROVED_SLUG}
  --chrome-bin=/usr/bin/google-chrome
  --settle-ms=750
  --timeout-ms=30000
  --grading-timeout-ms=1800000
  --execute-approved-submission
  --confirm=${DEV_AUTH_CLEANUP_CONFIRMATION}
  --no-screenshots
  --help

Write mode is deliberately locked to DEV_AUTH_USER_ID=${DISPOSABLE_DEV_AUTH_USER_ID}, a loopback
HTTP origin, an exact second confirmation, fully applied Question/Personal migrations, and an
approved content fingerprint. It enters a real response, submits with blanks, invokes full-paper
grading, verifies persistence/reload/idempotent replay, writes sanitized evidence, and deletes all
Personal and development Analytics rows belonging to that disposable uid.`;

export function parseFullPaperSubmissionArgs(argv) {
	const options = {
		baseUrl: 'http://127.0.0.1:5173',
		output: DEFAULT_OUTPUT,
		approvedSlug: DEFAULT_APPROVED_SLUG,
		chromeBin: '/usr/bin/google-chrome',
		settleMs: 750,
		timeoutMs: 30_000,
		gradingTimeoutMs: 1_800_000,
		executeApprovedSubmission: false,
		confirm: null,
		screenshots: true,
		help: false
	};
	for (const argument of argv) {
		if (argument === '--help' || argument === '-h') options.help = true;
		else if (argument === '--no-screenshots') options.screenshots = false;
		else if (argument === '--execute-approved-submission') {
			options.executeApprovedSubmission = true;
		} else if (argument.startsWith('--base-url=')) {
			options.baseUrl = optionValue(argument).replace(/\/+$/, '');
		} else if (argument.startsWith('--output=')) options.output = optionValue(argument);
		else if (argument.startsWith('--approved-slug=')) {
			options.approvedSlug = optionValue(argument);
		} else if (argument.startsWith('--chrome-bin=')) options.chromeBin = optionValue(argument);
		else if (argument.startsWith('--settle-ms=')) {
			options.settleMs = positiveInteger(optionValue(argument), argument);
		} else if (argument.startsWith('--timeout-ms=')) {
			options.timeoutMs = positiveInteger(optionValue(argument), argument);
		} else if (argument.startsWith('--grading-timeout-ms=')) {
			options.gradingTimeoutMs = positiveInteger(optionValue(argument), argument);
		} else if (argument.startsWith('--confirm=')) options.confirm = optionValue(argument);
		else throw new Error(`Unknown option: ${argument}\n\n${usage}`);
	}
	if (options.confirm && !options.executeApprovedSubmission) {
		throw new Error('--confirm is only valid together with --execute-approved-submission.');
	}
	if (options.executeApprovedSubmission && options.confirm !== DEV_AUTH_CLEANUP_CONFIRMATION) {
		throw new Error(`Approved submission requires --confirm=${DEV_AUTH_CLEANUP_CONFIRMATION}.`);
	}
	if (!options.approvedSlug || !/^[a-zA-Z0-9_-]+$/.test(options.approvedSlug)) {
		throw new Error('--approved-slug must be a non-empty URL-safe identifier.');
	}
	new URL(options.baseUrl);
	return options;
}

export function isSafeLoopbackOrigin(rawUrl) {
	try {
		const url = new URL(rawUrl);
		return (
			url.protocol === 'http:' &&
			['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
			url.username === '' &&
			url.password === '' &&
			url.pathname === '/' &&
			url.search === '' &&
			url.hash === ''
		);
	} catch {
		return false;
	}
}

export function evidenceToken(value) {
	return value ? createHash('sha256').update(String(value)).digest('hex').slice(0, 16) : null;
}

async function main() {
	const options = parseFullPaperSubmissionArgs(process.argv.slice(2));
	if (options.help) {
		console.log(usage);
		return;
	}
	const rootDir = process.cwd();
	loadD1Env(rootDir);
	const preflight = await collectPreflight(options, rootDir);
	if (!options.executeApprovedSubmission) {
		console.log(
			JSON.stringify(
				{
					schemaVersion: 'full-paper-approved-submission-preflight-v1',
					mode: 'read-only',
					status: preflight.ready ? 'ready' : 'blocked',
					writePerformed: false,
					...preflight
				},
				null,
				2
			)
		);
		if (!preflight.ready) process.exitCode = 1;
		return;
	}
	if (!preflight.ready) {
		throw new Error(`Approved submission preflight blocked: ${preflight.issues.join('; ')}`);
	}

	const outputDir = path.resolve(rootDir, options.output);
	const screenshotDir = path.join(outputDir, 'screenshots');
	await mkdir(outputDir, { recursive: true });
	if (options.screenshots) await mkdir(screenshotDir, { recursive: true });
	const startedAt = new Date().toISOString();
	let chrome = null;
	let run = null;
	let fatalError = null;
	let beforeCleanup = null;
	let afterCleanup = null;
	let cleanupEnabled = false;

	try {
		beforeCleanup = await cleanDisposableUser();
		cleanupEnabled = true;
		chrome = await launchChrome(options);
		run = await runApprovedSubmission({
			chrome,
			options,
			outputDir,
			screenshotDir
		});
	} catch (error) {
		fatalError = redactHarnessText(error instanceof Error ? error.stack || error.message : error);
		console.error(fatalError);
	} finally {
		if (chrome) await chrome.close().catch(() => undefined);
		if (cleanupEnabled) {
			try {
				afterCleanup = await cleanDisposableUser();
			} catch (error) {
				const cleanupError = redactHarnessText(
					error instanceof Error ? error.stack || error.message : error
				);
				fatalError = fatalError
					? `${fatalError}\nPost-run cleanup failed: ${cleanupError}`
					: `Post-run cleanup failed: ${cleanupError}`;
			}
		}
	}

	const failedAssertions = run?.assertions.filter((item) => !item.passed) ?? [];
	const report = {
		schemaVersion: 'full-paper-approved-submission-real-chrome-v1',
		status: fatalError || !run || failedAssertions.length > 0 ? 'failed' : 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		baseUrl: safeUrl(options.baseUrl),
		chrome: chrome ? { binary: chrome.binary, version: chrome.version, headless: true } : null,
		configuration: {
			paperSlug: options.approvedSlug,
			path: `/experiments/questions/${options.approvedSlug}?mode=sit`,
			viewport: { name: 'laptop', ...VIEWPORTS.laptop },
			theme: 'light',
			explicitWriteOptIn: true,
			disposableUserToken: evidenceToken(DISPOSABLE_DEV_AUTH_USER_ID),
			answerPolicy:
				'One typed response and one fixed response; remaining parts intentionally blank.',
			cleanupPolicy:
				'All Personal and development Analytics rows for the fixed disposable dev-auth uid.'
		},
		preflight,
		cleanup: { beforeRun: beforeCleanup, afterRun: afterCleanup },
		fatalError,
		run
	};
	await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
	await writeFile(path.join(outputDir, 'summary.md'), markdownSummary(report));
	console.log(`Evidence: ${path.relative(rootDir, path.join(outputDir, 'report.json'))}`);
	if (report.status !== 'passed') process.exitCode = 1;
}

async function collectPreflight(options, rootDir) {
	const issues = [];
	if (!isSafeLoopbackOrigin(`${options.baseUrl}/`)) {
		issues.push('base URL is not a credential-free loopback HTTP origin');
	}
	const configuredUserMatches = process.env.DEV_AUTH_USER_ID === DISPOSABLE_DEV_AUTH_USER_ID;
	if (!configuredUserMatches) {
		issues.push('DEV_AUTH_USER_ID is not the fixed disposable acceptance uid');
	}
	const analyticsEnvironmentSafe =
		!process.env.ANALYTICS_ENVIRONMENT || process.env.ANALYTICS_ENVIRONMENT === 'development';
	if (!analyticsEnvironmentSafe) {
		issues.push('ANALYTICS_ENVIRONMENT is not development');
	}
	const modelCredentialsConfigured = Boolean(
		process.env.CHATGPT_CODEX_PROXY_URL && process.env.CHATGPT_CODEX_PROXY_API_KEY
	);
	if (!modelCredentialsConfigured) {
		issues.push('ChatGPT Codex proxy credentials are not configured for local grading');
	}

	let server = { reachable: false, configuredUserVisible: false, sittingShellVisible: false };
	let migrations = {
		questionPending: [],
		personalPending: [],
		personal0008Applied: false
	};
	let personalSchema = {
		exactCleanupInventory: false,
		requiredColumnsPresent: false,
		requiredTriggersPresent: false
	};
	let approval = {
		rowCount: 0,
		status: null,
		fingerprintMatches: false,
		reviewedAt: null
	};
	let cleanupInventory = {
		personalSchemaExact: false,
		analyticsSchemaExact: false,
		analyticsSafeToDelete: false,
		personalRowCount: null,
		analyticsRowCount: null,
		analyticsRisks: null
	};
	try {
		const [rootResponse, sittingResponse] = await Promise.all([
			fetch(new URL(`/?acceptance=${Date.now()}`, `${options.baseUrl}/`), { redirect: 'manual' }),
			fetch(
				new URL(
					`/experiments/questions/${options.approvedSlug}?mode=sit&acceptance=${Date.now()}`,
					`${options.baseUrl}/`
				),
				{ redirect: 'manual' }
			)
		]);
		const [rootHtml, sittingHtml] = await Promise.all([
			rootResponse.text(),
			sittingResponse.text()
		]);
		server = {
			reachable:
				rootResponse.status >= 200 &&
				rootResponse.status < 500 &&
				sittingResponse.status >= 200 &&
				sittingResponse.status < 400,
			configuredUserVisible:
				rootHtml.includes(DISPOSABLE_DEV_AUTH_USER_ID) &&
				sittingHtml.includes(DISPOSABLE_DEV_AUTH_USER_ID),
			sittingShellVisible:
				sittingHtml.includes('Loading saved paper') || sittingHtml.includes('Full paper sitting')
		};
		if (!server.reachable) issues.push('local app is not reachable on the requested sitting route');
		if (!server.configuredUserVisible) {
			issues.push('running local app does not serialize the fixed disposable dev-auth uid');
		}
		if (!server.sittingShellVisible) issues.push('approved sitting shell is not rendered');
	} catch (error) {
		issues.push(`local app preflight failed: ${redactHarnessText(error)}`);
	}

	try {
		const [questionFiles, personalFiles, questionRows, personalRows] = await Promise.all([
			migrationFiles(path.join(rootDir, 'migrations')),
			migrationFiles(path.join(rootDir, 'migrations', 'personal')),
			d1Rows('SELECT name FROM d1_migrations ORDER BY id', [], { binding: 'QUESTION_DB' }),
			d1Rows('SELECT name FROM d1_migrations ORDER BY id', [], { binding: 'PERSONAL_DB' })
		]);
		const questionApplied = new Set(questionRows.map((row) => row.name));
		const personalApplied = new Set(personalRows.map((row) => row.name));
		migrations = {
			questionPending: questionFiles.filter((name) => !questionApplied.has(name)),
			personalPending: personalFiles.filter((name) => !personalApplied.has(name)),
			personal0008Applied: personalApplied.has(REQUIRED_PERSONAL_MIGRATION)
		};
		if (migrations.questionPending.length > 0) issues.push('Question D1 has pending migrations');
		if (migrations.personalPending.length > 0) issues.push('Personal D1 has pending migrations');
		if (!migrations.personal0008Applied) issues.push('Personal D1 migration 0008 is not applied');
	} catch (error) {
		issues.push(`migration preflight failed: ${redactHarnessText(error)}`);
	}

	try {
		const [tableRows, columnRows, triggerRows] = await Promise.all([
			d1Rows(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'user_%' ORDER BY name",
				[],
				{ binding: 'PERSONAL_DB' }
			),
			d1Rows('PRAGMA table_info(user_paper_sitting_sessions)', [], { binding: 'PERSONAL_DB' }),
			d1Rows(
				"SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'user_paper_sitting_sessions' ORDER BY name",
				[],
				{ binding: 'PERSONAL_DB' }
			)
		]);
		const expectedTables = PERSONAL_CLEANUP_TABLES.map(([table]) => table).sort();
		const actualTables = tableRows.map((row) => row.name);
		const columns = new Set(columnRows.map((row) => row.name));
		const triggers = new Set(triggerRows.map((row) => row.name));
		personalSchema = {
			exactCleanupInventory: sameStrings(actualTables, expectedTables),
			requiredColumnsPresent: REQUIRED_SITTING_COLUMNS.every((name) => columns.has(name)),
			requiredTriggersPresent: REQUIRED_SITTING_TRIGGERS.every((name) => triggers.has(name))
		};
		if (!personalSchema.exactCleanupInventory) {
			issues.push('Personal D1 user-table inventory does not match the cleanup allow-list');
		}
		if (!personalSchema.requiredColumnsPresent) issues.push('paper sitting columns are incomplete');
		if (!personalSchema.requiredTriggersPresent)
			issues.push('paper sitting lifecycle triggers are incomplete');
	} catch (error) {
		issues.push(`Personal D1 schema preflight failed: ${redactHarnessText(error)}`);
	}

	try {
		const inventory = await devAuthCleanupInventory(DISPOSABLE_DEV_AUTH_USER_ID);
		cleanupInventory = {
			personalSchemaExact: inventory.schema.personalExact,
			analyticsSchemaExact: inventory.schema.analyticsExact,
			analyticsSafeToDelete: inventory.analytics.safeToDelete,
			personalRowCount: inventory.personal.total ?? null,
			analyticsRowCount: inventory.analytics.total ?? null,
			analyticsRisks: inventory.analytics.risks ?? null
		};
		if (!cleanupInventory.personalSchemaExact || !cleanupInventory.analyticsSchemaExact) {
			issues.push('disposable-user cleanup table inventory has drifted');
		}
		if (!cleanupInventory.analyticsSafeToDelete) {
			issues.push('disposable uid has production or environment-less Analytics rows');
		}
	} catch (error) {
		issues.push(`cleanup inventory preflight failed: ${redactHarnessText(error)}`);
	}

	try {
		const reviewRows = await d1Rows(
			`SELECT status, reviewed_at, approved_content_fingerprint
			 FROM question_paper_sitting_reviews
			 WHERE source_document_id = ?`,
			[options.approvedSlug],
			{ binding: 'QUESTION_DB' }
		);
		const liveFingerprint = await fingerprintPaperSittingContent({
			sourceDocumentId: options.approvedSlug,
			query: (sql, params) => d1Rows(sql, params, { binding: 'QUESTION_DB' })
		});
		const review = reviewRows[0] ?? null;
		approval = {
			rowCount: reviewRows.length,
			status: review?.status ?? null,
			fingerprintMatches:
				reviewRows.length === 1 &&
				review?.status === 'approved' &&
				review.approved_content_fingerprint === liveFingerprint,
			reviewedAt: review?.reviewed_at ?? null
		};
		if (!approval.fingerprintMatches) {
			issues.push('paper does not have one current approved content fingerprint');
		}
	} catch (error) {
		issues.push(`paper approval preflight failed: ${redactHarnessText(error)}`);
	}

	return {
		ready: issues.length === 0,
		issues,
		safety: {
			loopbackHttpOnly: isSafeLoopbackOrigin(`${options.baseUrl}/`),
			configuredUserMatches,
			analyticsEnvironmentSafe,
			modelCredentialsConfigured,
			executionFlagPresent: options.executeApprovedSubmission,
			confirmationMatches:
				options.executeApprovedSubmission && options.confirm === DEV_AUTH_CLEANUP_CONFIRMATION,
			disposableUserToken: evidenceToken(DISPOSABLE_DEV_AUTH_USER_ID)
		},
		server,
		migrations,
		personalSchema,
		cleanupInventory,
		approval
	};
}

async function runApprovedSubmission({ chrome, options, outputDir, screenshotDir }) {
	const target = await chrome.newTarget();
	const cdp = await CdpClient.connect(target.webSocketDebuggerUrl, options.timeoutMs);
	const network = observeNetwork(cdp);
	const assertions = [];
	const screenshots = { response: null, grading: null, complete: null, resumed: null };
	let sessionId;
	let localCleanup;
	let responseEntry;
	let submission;
	let completedLocal;
	let persisted;
	let resumedLocal;
	let resumedUi;
	let retry;
	let layout;
	let modelRunsBeforeRetry;
	let modelRunsAfterRetry;
	let result;

	try {
		await configurePage(cdp);
		const sittingUrl = new URL(
			`/experiments/questions/${options.approvedSlug}?mode=sit`,
			`${options.baseUrl}/`
		).toString();
		await navigate(cdp, sittingUrl, options);
		await waitForSelector(cdp, '.sitting-start', options.timeoutMs);
		await forceTheme(cdp, 'light');
		const startState = await evaluate(cdp, () => ({
			heading: document.querySelector('.sitting-start h1')?.textContent?.trim() ?? null,
			startButton: document.querySelector('.sitting-start button')?.textContent?.trim() ?? null
		}));
		assertions.push(
			assertion('approved-start-state', startState.startButton === 'Start paper', startState)
		);

		await evaluate(cdp, () => document.querySelector('.sitting-start button')?.click());
		await waitForSelector(cdp, '.full-paper-sitting', options.timeoutMs);
		const initial = await storedSitting(cdp);
		sessionId = initial.session?.sessionId ?? null;
		assertions.push(
			assertion(
				'disposable-user-session-started',
				initial.userId === DISPOSABLE_DEV_AUTH_USER_ID &&
					initial.session?.status === 'in_progress' &&
					Boolean(sessionId),
				{
					userToken: evidenceToken(initial.userId),
					sessionToken: evidenceToken(sessionId),
					status: initial.session?.status ?? null
				}
			)
		);
		if (!sessionId) throw new Error('The browser did not persist the server sitting identity.');

		responseEntry = await enterGenuineResponses(cdp, options.timeoutMs);
		assertions.push(
			assertion(
				'genuine-nonblank-ui-response',
				responseEntry.typedStored &&
					responseEntry.typedLength > 0 &&
					responseEntry.answerCount >= 2,
				responseEntry
			),
			assertion('typed-part-timing-recorded-before-submit', responseEntry.typedDurationMs >= 700, {
				ref: responseEntry.typedRef,
				durationMs: responseEntry.typedDurationMs
			})
		);
		if (options.screenshots) {
			await evaluate(
				cdp,
				(ref) => document.getElementById(ref)?.scrollIntoView({ block: 'center' }),
				responseEntry.typedRef
			);
			await delay(100);
			screenshots.response = await screenshot(
				cdp,
				outputDir,
				screenshotDir,
				'nonblank-response.jpg'
			);
		}

		const gradeCountBeforeSubmit = network.gradeRequests.length;
		submission = await submitDespiteBlanks(cdp, options.timeoutMs);
		await waitUntil(
			() => network.gradeRequests.length > gradeCountBeforeSubmit,
			options.timeoutMs,
			100
		);
		assertions.push(
			assertion(
				'blank-confirmation-accepted',
				submission.buttonFound &&
					submission.confirmed &&
					submission.message?.includes('still blank'),
				submission
			)
		);
		if (options.screenshots) {
			await evaluate(cdp, () => window.scrollTo(0, 0));
			screenshots.grading = await screenshot(
				cdp,
				outputDir,
				screenshotDir,
				'grading-in-progress.jpg'
			);
		}

		await waitUntil(
			async () => (await storedSitting(cdp)).session?.status === 'complete',
			options.gradingTimeoutMs,
			500
		);
		await waitForSelector(cdp, '.sitting-dashboard', options.timeoutMs);
		completedLocal = sanitizeLocalSitting((await storedSitting(cdp)).session);
		persisted = await collectPersistedSitting(sessionId);
		modelRunsBeforeRetry = await waitForModelRuns();
		layout = await collectLayoutEvidence(cdp);
		assertions.push(...persistenceAssertions({ completedLocal, persisted, responseEntry }));
		assertions.push(
			assertion(
				'actual-model-grading-observed',
				modelRunsBeforeRetry.some(
					(item) =>
						item.status === 'success' &&
						item.environment === 'development' &&
						network.gradeRequests.some((request) => {
							try {
								return new URL(request.url).pathname === item.path;
							} catch {
								return false;
							}
						})
				),
				{
					modelRuns: modelRunsBeforeRetry,
					gradeRequestCount: network.gradeRequests.length
				}
			),
			assertion('complete-layout-no-document-overflow', !layout.documentHorizontalOverflow, {
				document: layout.document
			})
		);
		if (options.screenshots) {
			await evaluate(cdp, () => window.scrollTo(0, 0));
			screenshots.complete = await screenshot(cdp, outputDir, screenshotDir, 'complete-result.jpg');
		}

		const load = cdp.waitFor('Page.loadEventFired', options.timeoutMs);
		await cdp.send('Page.reload', { ignoreCache: true });
		await load;
		await waitForDocumentReady(cdp, options.timeoutMs);
		await waitUntil(
			async () => (await storedSitting(cdp)).session?.status === 'complete',
			options.timeoutMs,
			100
		);
		resumedLocal = sanitizeLocalSitting((await storedSitting(cdp)).session);
		resumedUi = await evaluate(cdp, () => ({
			eyebrow:
				document
					.querySelector('.sitting-dashboard .eyebrow')
					?.textContent?.replace(/\s+/g, ' ')
					.trim() ?? null,
			heading:
				document.querySelector('.sitting-dashboard h1')?.textContent?.replace(/\s+/g, ' ').trim() ??
				null
		}));
		assertions.push(
			assertion(
				'reload-resume-complete',
				resumedUi.eyebrow === 'Paper result' &&
					resumedLocal.status === 'complete' &&
					resumedLocal.sessionToken === completedLocal.sessionToken &&
					resumedLocal.answersHash === completedLocal.answersHash &&
					resumedLocal.resultsHash === completedLocal.resultsHash &&
					sameJson(resumedLocal.responseDurationsMs, completedLocal.responseDurationsMs),
				{ ui: resumedUi, local: resumedLocal }
			)
		);
		if (options.screenshots) {
			await evaluate(cdp, () => window.scrollTo(0, 0));
			screenshots.resumed = await screenshot(cdp, outputDir, screenshotDir, 'reloaded-result.jpg');
		}

		const retryRef =
			modelRunsBeforeRetry
				.map((item) => item.questionRef)
				.find((ref) => resumedLocal.gradedQuestionRefs.includes(ref)) ??
			resumedLocal.gradedQuestionRefs[0];
		const beforeRetrySnapshot = await collectPersistedSitting(sessionId);
		const gradeCountBeforeRetry = network.gradeRequests.length;
		retry = await replayGradedQuestion(cdp, options.approvedSlug, retryRef);
		await waitUntil(
			() => network.gradeRequests.length === gradeCountBeforeRetry + 1,
			options.timeoutMs,
			50
		);
		modelRunsAfterRetry = await waitForModelRuns();
		const afterRetrySnapshot = await collectPersistedSitting(sessionId);
		assertions.push(
			assertion(
				'idempotent-grade-retry-http-replay',
				retry.status === 200 && retry.ref === retryRef && retry.resultCount > 0,
				retry
			),
			assertion(
				'idempotent-retry-no-duplicate-model-call',
				sameStrings(
					modelRunsAfterRetry.map((item) => item.runToken).sort(),
					modelRunsBeforeRetry.map((item) => item.runToken).sort()
				),
				{ before: modelRunsBeforeRetry, after: modelRunsAfterRetry }
			),
			assertion(
				'idempotent-retry-no-duplicate-persistence',
				beforeRetrySnapshot.session.version === afterRetrySnapshot.session.version &&
					beforeRetrySnapshot.session.resultsHash === afterRetrySnapshot.session.resultsHash &&
					sameStrings(
						beforeRetrySnapshot.attempts.map((item) => item.attemptToken).sort(),
						afterRetrySnapshot.attempts.map((item) => item.attemptToken).sort()
					) &&
					sameStrings(
						beforeRetrySnapshot.evidence.map((item) => item.evidenceToken).sort(),
						afterRetrySnapshot.evidence.map((item) => item.evidenceToken).sort()
					),
				{ before: beforeRetrySnapshot, after: afterRetrySnapshot }
			)
		);

		const networkEvidence = networkSummary(network);
		assertions.push(
			assertion(
				'grade-http-requests-succeeded',
				networkEvidence.gradeRequests.length === persisted.session.questionGroupRefs.length + 1 &&
					networkEvidence.gradeRequests.every((item) => item.status === 200),
				networkEvidence.gradeRequests
			),
			assertion('no-browser-exceptions', network.exceptions.length === 0, network.exceptions),
			assertion('no-network-failures', network.failedRequests.length === 0, network.failedRequests)
		);

		result = {
			status: assertions.every((item) => item.passed) ? 'passed' : 'failed',
			sessionToken: evidenceToken(sessionId),
			responseEntry,
			submission,
			completedLocal,
			persisted,
			modelRunsBeforeRetry,
			resumedLocal,
			resumedUi,
			retry,
			modelRunsAfterRetry,
			network: networkEvidence,
			layout,
			assertions,
			screenshots,
			localCleanup: null
		};
	} finally {
		try {
			localCleanup = await clearStoredSittings(cdp);
		} catch {
			localCleanup = { removed: null, remaining: null };
		}
		cdp.close();
		await chrome.closeTarget(target.id);
		if (assertions.length > 0) {
			assertions.push(
				assertion('browser-local-sitting-cleaned', localCleanup.remaining === 0, localCleanup)
			);
		}
	}
	if (!result) throw new Error('The approved submission run did not produce a result.');
	result.localCleanup = localCleanup;
	result.status = assertions.every((item) => item.passed) ? 'passed' : 'failed';
	return result;
}

async function enterGenuineResponses(cdp, timeoutMs) {
	const typedText =
		'The wavelength decreases because wave speed is constant and frequency increases.';
	const typed = await evaluate(cdp, () => {
		const editor = document.querySelector('.exam-part-row textarea');
		if (!(editor instanceof HTMLTextAreaElement)) return null;
		const ref = editor.closest('.exam-part-row')?.id ?? null;
		editor.scrollIntoView({ block: 'center' });
		editor.focus();
		return { ref, ariaLabel: editor.getAttribute('aria-label') };
	});
	if (!typed?.ref)
		throw new Error('No typed response control was available on the approved paper.');
	await cdp.send('Input.insertText', { text: typedText });
	await waitUntil(
		async () => (await storedSitting(cdp)).session?.answers?.[typed.ref] === typedText,
		timeoutMs,
		50
	);
	await delay(900);
	const fixed = await evaluate(cdp, () => {
		const control = document.querySelector('.exam-part-row .choice-row[role="radio"]');
		if (!(control instanceof HTMLButtonElement)) return null;
		const ref = control.closest('.exam-part-row')?.id ?? null;
		control.scrollIntoView({ block: 'center' });
		control.click();
		return {
			ref,
			label: control.textContent?.replace(/\s+/g, ' ').trim() ?? null,
			checked: control.getAttribute('aria-checked')
		};
	});
	if (!fixed?.ref)
		throw new Error('No fixed response control was available on the approved paper.');
	await waitUntil(
		async () => {
			const session = (await storedSitting(cdp)).session;
			return (
				Boolean(session?.answers?.[fixed.ref]) &&
				(session?.responseDurationsMs?.[typed.ref] ?? 0) >= 700
			);
		},
		timeoutMs,
		50
	);
	await delay(500);
	const stored = (await storedSitting(cdp)).session;
	return {
		typedRef: typed.ref,
		typedAriaLabel: typed.ariaLabel,
		typedStored: stored.answers?.[typed.ref] === typedText,
		typedLength: typedText.length,
		typedAnswerHash: evidenceToken(typedText),
		typedDurationMs: stored.responseDurationsMs?.[typed.ref] ?? 0,
		fixedRef: fixed.ref,
		fixedLabel: fixed.label,
		fixedStored: Boolean(stored.answers?.[fixed.ref]),
		answerCount: Object.values(stored.answers ?? {}).filter((value) => String(value).trim()).length
	};
}

async function submitDespiteBlanks(cdp, timeoutMs) {
	const started = await evaluate(cdp, () => {
		window.__qcApprovedSubmissionConfirm = { messages: [], confirmed: false };
		window.confirm = (message) => {
			window.__qcApprovedSubmissionConfirm.messages.push(String(message));
			window.__qcApprovedSubmissionConfirm.confirmed = true;
			return true;
		};
		const button = [...document.querySelectorAll('button')].find(
			(item) => item.textContent?.trim() === 'Finish paper'
		);
		button?.click();
		return { buttonFound: Boolean(button) };
	});
	await waitUntil(
		async () => evaluate(cdp, () => window.__qcApprovedSubmissionConfirm?.confirmed === true),
		timeoutMs,
		50
	);
	const confirmation = await evaluate(cdp, () => ({
		confirmed: window.__qcApprovedSubmissionConfirm?.confirmed === true,
		message: window.__qcApprovedSubmissionConfirm?.messages?.[0] ?? null
	}));
	return { ...started, ...confirmation };
}

async function replayGradedQuestion(cdp, paperSlug, ref) {
	if (!ref) throw new Error('No completed question ref was available for idempotent replay.');
	return evaluate(
		cdp,
		async ({ paperSlug: slug, ref: questionRef, prefix }) => {
			const key = Object.keys(localStorage).find((candidate) => candidate.startsWith(prefix));
			const session = key ? JSON.parse(localStorage.getItem(key) ?? 'null') : null;
			if (!session?.sessionId || !session?.nonce)
				return { status: 0, ref: questionRef, resultCount: 0 };
			const response = await fetch(
				`/api/experiments/questions/${encodeURIComponent(slug)}/${encodeURIComponent(questionRef)}/grade`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
					body: JSON.stringify({
						paperSitting: { sessionId: session.sessionId, nonce: session.nonce }
					})
				}
			);
			let body = null;
			try {
				body = await response.json();
			} catch {
				// The status remains sufficient evidence if a proxy stripped the replay body.
			}
			return {
				status: response.status,
				ref: body?.ref ?? questionRef,
				resultCount: Array.isArray(body?.results) ? body.results.length : 0,
				modelPresent: typeof body?.model === 'string' && body.model.length > 0
			};
		},
		{ paperSlug, ref, prefix: PAPER_STORAGE_PREFIX }
	);
}

function persistenceAssertions({ completedLocal, persisted, responseEntry }) {
	const assertions = [];
	const session = persisted.session;
	const partRefs = session.partRefs;
	const gradeable = session.results.filter((item) => item.maxMarks > 0);
	const evidenceByQuestion = new Map(persisted.evidence.map((item) => [item.questionId, item]));
	const serverResultProjection = Object.fromEntries(
		session.results.map((result) => [
			result.ref,
			{
				status: result.status,
				result: result.result,
				awardedMarks: result.awardedMarks,
				maxMarks: result.maxMarks
			}
		])
	);
	assertions.push(
		assertion(
			'server-sitting-complete',
			session.status === 'complete' &&
				Boolean(session.submittedAtMs) &&
				Boolean(session.completedAtMs) &&
				session.completedAtMs >= session.submittedAtMs &&
				sameStrings(session.gradedQuestionRefs, session.questionGroupRefs) &&
				session.nextQuestionIndex === session.questionGroupRefs.length,
			{
				status: session.status,
				submittedAtMs: session.submittedAtMs,
				completedAtMs: session.completedAtMs
			}
		),
		assertion(
			'exact-per-part-results-persisted',
			sameStrings(session.resultRefs, partRefs) &&
				sameStrings(Object.keys(completedLocal.results).sort(), partRefs) &&
				sameJson(serverResultProjection, completedLocal.results),
			{
				expected: partRefs,
				server: session.resultRefs,
				browser: Object.keys(completedLocal.results).sort()
			}
		),
		assertion(
			'exact-per-part-timing-persisted',
			sameStrings(Object.keys(session.responseDurationsMs).sort(), partRefs) &&
				sameStrings(Object.keys(completedLocal.responseDurationsMs).sort(), partRefs) &&
				Number(session.responseDurationsMs[responseEntry.typedRef]) >= 700 &&
				Number(completedLocal.responseDurationsMs[responseEntry.typedRef]) >= 700,
			{
				serverResponseDurationsMs: session.responseDurationsMs,
				browserResponseDurationsMs: completedLocal.responseDurationsMs
			}
		),
		assertion(
			'per-part-attempt-and-evidence-persisted',
			persisted.attempts.length === gradeable.length &&
				persisted.evidence.length === gradeable.length &&
				gradeable.every((result) => {
					const evidence = evidenceByQuestion.get(result.questionId);
					return (
						Boolean(evidence) &&
						evidence.responseDurationMs === session.responseDurationsMs[result.ref]
					);
				}),
			{
				gradeablePartCount: gradeable.length,
				attemptCount: persisted.attempts.length,
				evidenceCount: persisted.evidence.length,
				evidence: persisted.evidence
			}
		),
		assertion(
			'nonblank-answer-locked-on-server',
			session.answers[responseEntry.typedRef]?.nonBlank === true &&
				session.answers[responseEntry.typedRef]?.hash === responseEntry.typedAnswerHash,
			{ ref: responseEntry.typedRef, answer: session.answers[responseEntry.typedRef] }
		)
	);
	return assertions;
}

async function collectPersistedSitting(sessionId) {
	const [row] = await d1Rows(
		`SELECT id, status, started_at_ms, submitted_at_ms, completed_at_ms,
		        question_groups_json, answers_json, response_durations_json, results_json,
		        grade_responses_json, graded_question_refs_json, next_question_index,
		        version, updated_at
		 FROM user_paper_sitting_sessions
		 WHERE id = ? AND user_id = ?`,
		[sessionId, DISPOSABLE_DEV_AUTH_USER_ID],
		{ binding: 'PERSONAL_DB' }
	);
	if (!row) throw new Error('The submitted sitting row was not found for the disposable uid.');
	const attemptPrefix = `paper:${encodeURIComponent(DISPOSABLE_DEV_AUTH_USER_ID)}:${encodeURIComponent(sessionId)}:`;
	const [attemptRows, evidenceRows] = await Promise.all([
		d1Rows(
			`SELECT id, question_id, source_question_ref, result, awarded_marks, max_marks,
			        model, model_version, created_at
			 FROM user_question_attempts
			 WHERE user_id = ? AND instr(id, ?) = 1
			 ORDER BY source_question_ref, id`,
			[DISPOSABLE_DEV_AUTH_USER_ID, attemptPrefix],
			{ binding: 'PERSONAL_DB' }
		),
		d1Rows(
			`SELECT id, source_attempt_id, question_id, outcome, awarded_marks, max_marks,
			        response_duration_ms, occurred_at
			 FROM user_learning_evidence
			 WHERE user_id = ? AND source_session_id = ?
			 ORDER BY question_id, id`,
			[DISPOSABLE_DEV_AUTH_USER_ID, sessionId],
			{ binding: 'PERSONAL_DB' }
		)
	]);
	return sanitizePersistedSitting(row, attemptRows, evidenceRows);
}

export function sanitizePersistedSitting(row, attemptRows, evidenceRows) {
	const questionGroups = parseJson(row.question_groups_json, []);
	const answers = parseJson(row.answers_json, {});
	const responseDurationsMs = parseJson(row.response_durations_json, {});
	const resultsRecord = parseJson(row.results_json, {});
	const partRefs = questionGroups.flatMap((group) => group.partRefs).sort();
	const results = Object.entries(resultsRecord)
		.map(([ref, result]) => ({
			ref,
			questionId: result?.questionId ?? null,
			status: result?.status ?? null,
			result: result?.result ?? null,
			awardedMarks: result?.awardedMarks ?? null,
			maxMarks: result?.maxMarks ?? null,
			gradeableMarks: result?.gradeableMarks ?? null
		}))
		.sort((left, right) => left.ref.localeCompare(right.ref));
	return {
		session: {
			sessionToken: evidenceToken(row.id),
			status: row.status,
			startedAtMs: Number(row.started_at_ms),
			submittedAtMs: row.submitted_at_ms === null ? null : Number(row.submitted_at_ms),
			completedAtMs: row.completed_at_ms === null ? null : Number(row.completed_at_ms),
			partRefs,
			questionGroupRefs: questionGroups.map((group) => group.questionRef),
			answers: sanitizeAnswers(answers),
			responseDurationsMs,
			results,
			resultRefs: results.map((item) => item.ref).sort(),
			resultsHash: evidenceToken(row.results_json),
			gradeResponsesHash: evidenceToken(row.grade_responses_json),
			gradedQuestionRefs: parseJson(row.graded_question_refs_json, []),
			nextQuestionIndex: Number(row.next_question_index),
			version: Number(row.version),
			updatedAt: row.updated_at
		},
		attempts: attemptRows.map((item) => ({
			attemptToken: evidenceToken(item.id),
			questionId: item.question_id,
			ref: item.source_question_ref,
			result: item.result,
			awardedMarks: Number(item.awarded_marks),
			maxMarks: Number(item.max_marks),
			model: item.model,
			modelVersion: item.model_version,
			createdAt: item.created_at
		})),
		evidence: evidenceRows.map((item) => ({
			evidenceToken: evidenceToken(item.id),
			attemptToken: evidenceToken(item.source_attempt_id),
			questionId: item.question_id,
			outcome: item.outcome,
			awardedMarks: item.awarded_marks === null ? null : Number(item.awarded_marks),
			maxMarks: item.max_marks === null ? null : Number(item.max_marks),
			responseDurationMs:
				item.response_duration_ms === null ? null : Number(item.response_duration_ms),
			occurredAt: item.occurred_at
		}))
	};
}

function sanitizeLocalSitting(session) {
	return {
		sessionToken: evidenceToken(session?.sessionId),
		status: session?.status ?? null,
		startedAt: session?.startedAt ?? null,
		submittedAt: session?.submittedAt ?? null,
		answers: sanitizeAnswers(session?.answers ?? {}),
		answersHash: evidenceToken(JSON.stringify(session?.answers ?? {})),
		responseDurationsMs: session?.responseDurationsMs ?? {},
		results: Object.fromEntries(
			Object.entries(session?.results ?? {}).map(([ref, result]) => [
				ref,
				{
					status: result?.status ?? null,
					result: result?.result ?? null,
					awardedMarks: result?.awardedMarks ?? null,
					maxMarks: result?.maxMarks ?? null
				}
			])
		),
		resultsHash: evidenceToken(JSON.stringify(session?.results ?? {})),
		gradedQuestionRefs: [...(session?.gradedQuestionRefs ?? [])]
	};
}

function sanitizeAnswers(answers) {
	return Object.fromEntries(
		Object.entries(answers).map(([ref, value]) => {
			const text = String(value ?? '');
			return [
				ref,
				{ nonBlank: text.trim().length > 0, length: text.length, hash: evidenceToken(text) }
			];
		})
	);
}

async function waitForModelRuns() {
	let rows = [];
	let stableSignature = '';
	let stableSince = 0;
	await waitUntil(
		async () => {
			rows = await collectSafeModelRuns();
			const signature = rows
				.map((row) => row.runToken)
				.sort()
				.join(',');
			if (rows.length === 0 || signature !== stableSignature) {
				stableSignature = signature;
				stableSince = Date.now();
				return false;
			}
			return Date.now() - stableSince >= 3_000;
		},
		30_000,
		500
	);
	return rows;
}

async function collectSafeModelRuns() {
	const rows = await d1Rows(
		`SELECT run_id, session_id, environment, feature, path, model, model_version,
		        thinking_level, status, started_at, completed_at, duration_ms,
		        usage_json, cost_usd, metadata_json
		 FROM analytics_model_runs
		 WHERE user_id = ? AND feature = 'experiment_question_grading'
		 ORDER BY started_at, run_id`,
		[DISPOSABLE_DEV_AUTH_USER_ID],
		{ binding: 'ANALYTICS_DB' }
	);
	return rows.map((row) => {
		const metadata = parseJson(row.metadata_json, {});
		return {
			runToken: evidenceToken(row.run_id),
			browserSessionToken: evidenceToken(row.session_id),
			environment: row.environment,
			feature: row.feature,
			path: row.path,
			model: row.model,
			modelVersion: row.model_version,
			thinkingLevel: row.thinking_level,
			status: row.status,
			startedAt: row.started_at,
			completedAt: row.completed_at,
			durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
			usage: parseJson(row.usage_json, null),
			costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
			paperSlug: typeof metadata.paperSlug === 'string' ? metadata.paperSlug : null,
			questionRef: typeof metadata.ref === 'string' ? metadata.ref : null,
			questionCount: typeof metadata.questionCount === 'number' ? metadata.questionCount : null
		};
	});
}

async function cleanDisposableUser() {
	const before = await devAuthCleanupInventory(DISPOSABLE_DEV_AUTH_USER_ID);
	const failures = [];
	try {
		await d1Batch(analyticsCleanupStatements(DISPOSABLE_DEV_AUTH_USER_ID), {
			binding: 'ANALYTICS_DB'
		});
	} catch (error) {
		failures.push(`Analytics cleanup: ${redactHarnessText(error)}`);
	}
	try {
		await d1Batch(personalCleanupStatements(DISPOSABLE_DEV_AUTH_USER_ID), {
			binding: 'PERSONAL_DB'
		});
	} catch (error) {
		failures.push(`Personal cleanup: ${redactHarnessText(error)}`);
	}
	const after = await devAuthCleanupInventory(DISPOSABLE_DEV_AUTH_USER_ID);
	if (after.personal.total !== 0 || after.analytics.total !== 0) {
		failures.push('cleanup verification found remaining directly traceable rows');
	}
	if (failures.length > 0) throw new Error(failures.join('; '));
	return {
		personalRowsRemoved: before.personal.total,
		analyticsDirectRowsRemoved: before.analytics.total,
		verifiedPersonalRowsRemaining: after.personal.total,
		verifiedAnalyticsDirectRowsRemaining: after.analytics.total
	};
}

async function configurePage(cdp) {
	await Promise.all([
		cdp.send('Page.enable'),
		cdp.send('Runtime.enable'),
		cdp.send('Log.enable'),
		cdp.send('Network.enable')
	]);
	await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
	await cdp.send('Emulation.setDeviceMetricsOverride', {
		width: VIEWPORTS.laptop.width,
		height: VIEWPORTS.laptop.height,
		deviceScaleFactor: VIEWPORTS.laptop.deviceScaleFactor,
		mobile: VIEWPORTS.laptop.mobile,
		screenWidth: VIEWPORTS.laptop.width,
		screenHeight: VIEWPORTS.laptop.height,
		dontSetVisibleSize: false
	});
	await cdp.send('Emulation.setEmulatedMedia', {
		media: 'screen',
		features: [{ name: 'prefers-color-scheme', value: 'light' }]
	});
	await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
		source: `try {
			const acceptanceKey = 'qc-full-paper-approved-submission-initialized';
			if (!sessionStorage.getItem(acceptanceKey)) {
				for (const key of Object.keys(localStorage)) {
					if (key.startsWith(${JSON.stringify(PAPER_STORAGE_PREFIX)})) localStorage.removeItem(key);
				}
				sessionStorage.setItem(acceptanceKey, '1');
			}
			localStorage.setItem('question-constellation-theme', 'light');
		} catch {}`
	});
}

async function navigate(cdp, url, options) {
	const load = cdp.waitFor('Page.loadEventFired', options.timeoutMs);
	await cdp.send('Page.navigate', { url });
	await load;
	await waitForDocumentReady(cdp, options.timeoutMs);
	await settlePageAssets(cdp, options.timeoutMs);
	await delay(options.settleMs);
}

async function waitForSelector(cdp, selector, timeoutMs) {
	await waitUntil(
		async () => evaluate(cdp, (value) => Boolean(document.querySelector(value)), selector),
		timeoutMs,
		75
	);
}

async function storedSitting(cdp) {
	return evaluate(
		cdp,
		(prefix) => {
			const keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix));
			const storageKey = keys[0] ?? null;
			const remainder = storageKey?.slice(prefix.length) ?? '';
			const separator = remainder.indexOf(':');
			const parsed = storageKey ? JSON.parse(localStorage.getItem(storageKey) ?? 'null') : null;
			const session = parsed && typeof parsed === 'object' ? { ...parsed } : parsed;
			if (session) delete session.nonce;
			return {
				keyCount: keys.length,
				userId: separator >= 0 ? decodeURIComponent(remainder.slice(0, separator)) : null,
				session
			};
		},
		PAPER_STORAGE_PREFIX
	);
}

async function clearStoredSittings(cdp) {
	return evaluate(
		cdp,
		(prefix) => {
			const keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix));
			for (const key of keys) localStorage.removeItem(key);
			return {
				removed: keys.length,
				remaining: Object.keys(localStorage).filter((key) => key.startsWith(prefix)).length
			};
		},
		PAPER_STORAGE_PREFIX
	);
}

function observeNetwork(cdp) {
	const state = {
		requestUrls: new Map(),
		gradeRequestIndexes: new Map(),
		gradeRequests: [],
		failedRequests: [],
		exceptions: []
	};
	cdp.on('Network.requestWillBeSent', (event) => {
		const url = event.request?.url ?? '';
		state.requestUrls.set(event.requestId, url);
		if (/\/api\/experiments\/questions\/[^/]+\/[^/]+\/grade(?:\?|$)/.test(url)) {
			const index = state.gradeRequests.length;
			state.gradeRequestIndexes.set(event.requestId, index);
			state.gradeRequests.push({
				method: event.request?.method ?? null,
				url: safeUrl(url),
				status: null
			});
		}
	});
	cdp.on('Network.responseReceived', (event) => {
		const index = state.gradeRequestIndexes.get(event.requestId);
		if (index !== undefined) state.gradeRequests[index].status = event.response?.status ?? null;
	});
	cdp.on('Network.loadingFailed', (event) => {
		const url = state.requestUrls.get(event.requestId) ?? '';
		state.requestUrls.delete(event.requestId);
		if (!event.canceled && event.blockedReason !== 'inspector') {
			state.failedRequests.push({ url: safeUrl(url), error: sanitizeText(event.errorText) });
		}
	});
	cdp.on('Network.loadingFinished', (event) => {
		state.requestUrls.delete(event.requestId);
	});
	cdp.on('Runtime.exceptionThrown', (event) => {
		state.exceptions.push({
			text: redactHarnessText(
				event.exceptionDetails?.exception?.description ??
					event.exceptionDetails?.text ??
					'Browser exception'
			)
		});
	});
	return state;
}

function networkSummary(network) {
	return {
		gradeRequests: network.gradeRequests,
		failedRequests: network.failedRequests,
		exceptions: network.exceptions
	};
}

async function screenshot(cdp, outputDir, screenshotDir, filename) {
	const absolute = path.join(screenshotDir, filename);
	await captureScreenshot(cdp, absolute, 'viewport');
	return path.relative(outputDir, absolute);
}

async function migrationFiles(directory) {
	return (await readdir(directory, { withFileTypes: true }))
		.filter((entry) => entry.isFile() && /^\d+.*\.sql$/.test(entry.name))
		.map((entry) => entry.name)
		.sort();
}

function assertion(name, passed, evidence = null) {
	return { name, passed: Boolean(passed), evidence };
}

function optionValue(argument) {
	return argument.slice(argument.indexOf('=') + 1);
}

function positiveInteger(raw, argument) {
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new Error(`Expected a positive integer: ${argument}`);
	}
	return value;
}

function parseJson(raw, fallback) {
	try {
		return typeof raw === 'string' ? JSON.parse(raw) : fallback;
	} catch {
		return fallback;
	}
}

function sameStrings(left, right) {
	return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function sameJson(left, right) {
	return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function canonicalValue(value) {
	if (Array.isArray(value)) return value.map(canonicalValue);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, canonicalValue(value[key])])
		);
	}
	return value;
}

function redactHarnessText(value) {
	return sanitizeText(value).replaceAll(DISPOSABLE_DEV_AUTH_USER_ID, '<disposable-dev-user>');
}

function markdownSummary(report) {
	const assertions = (report.run?.assertions ?? [])
		.map((item) => `| ${item.name} | ${item.passed ? 'pass' : 'fail'} |`)
		.join('\n');
	const screenshots = Object.entries(report.run?.screenshots ?? {})
		.filter(([, value]) => value)
		.map(([name, value]) => `- [${name}](${value})`)
		.join('\n');
	return `# Full-paper approved-submission acceptance

- Status: **${report.status}**
- Paper: \`${report.configuration.paperSlug}\`
- Origin: \`${report.baseUrl}\`
- Disposable user token: \`${report.configuration.disposableUserToken}\`
- Grade endpoint requests: **${report.run?.network.gradeRequests.length ?? 0}**
- Actual model runs: **${report.run?.modelRunsBeforeRetry.length ?? 0}**
- Post-retry model runs: **${report.run?.modelRunsAfterRetry.length ?? 0}**
- Personal rows remaining after cleanup: **${report.cleanup.afterRun?.verifiedPersonalRowsRemaining ?? 'unknown'}**
- Direct Analytics rows remaining after cleanup: **${report.cleanup.afterRun?.verifiedAnalyticsDirectRowsRemaining ?? 'unknown'}**

| Assertion | Result |
| --- | --- |
${assertions}

The run used real headless Chrome, typed a genuine nonblank answer through the UI, accepted the
remaining-blank confirmation, waited for the complete result, checked exact per-part timing and
result persistence in Personal D1, reloaded the route, and replayed one completed grade request.
The replay had to preserve the same model-run, attempt, evidence, and sitting-version inventories.
Raw user ids, sitting ids, nonces, answers, prompts, model outputs, reasoning, and D1 credentials
are excluded from this evidence; identifiers and test answers are represented by short SHA-256
tokens.

## Screenshots

${screenshots || '- Disabled for this run.'}

See [report.json](report.json) for the sanitized machine-readable evidence.
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
