#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { d1Rows } from './lib/d1-rest.mjs';
import { fingerprintPaperSittingContent } from '../src/lib/server/paperSittingContentFingerprint.js';
import {
	CdpClient,
	VIEWPORTS,
	captureScreenshot,
	collectDomSummary,
	collectLayoutEvidence,
	delay,
	evaluate,
	forceTheme,
	launchChrome,
	safeUrl,
	sanitizeText,
	settlePageAssets,
	tracksForIdle,
	waitForDocumentReady,
	waitForNetworkIdle,
	waitUntil
} from './validate-release-browser.mjs';

const PAPER_STORAGE_PREFIX = 'question-constellation:paper-sitting:v4:';
const DEFAULT_APPROVED_SLUG = 'aqa-8464p2h-jun24';
const DEFAULT_CONTROL_SLUG = 'aqa-8464p1h-jun24';
const DEFAULT_CONTROL_CATALOG_PATH =
	'/past-papers/gcse/aqa/combined-physics-higher/2024-june-paper-1-physics';
const CS1A_SLUG =
	'aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp';
const CS1A_CATALOG_PATH =
	'/past-papers/gcse/aqa/computer-science/2024-june-paper-1a-computational-thinking-and-programming-skills-c';

const usage = `Usage:
node scripts/validate-full-paper-browser.mjs [options]

Options:
  --base-url=http://127.0.0.1:5173
  --output=docs/release-evidence/full-paper-browser-validation
  --approved-slug=aqa-8464p2h-jun24
  --control-slug=aqa-8464p1h-jun24
  --control-catalog-path=/past-papers/...
  --viewport=mobile,ipad,laptop
  --theme=light,dark
  --chrome-bin=/usr/bin/google-chrome
  --settle-ms=750
  --timeout-ms=30000
  --no-screenshots
  --help

This acceptance harness never submits the approved paper. It cancels the blank-answer
confirmation, verifies the 5,000-character guard, and only sends one deliberately refused
paper-sitting POST for the unapproved control paper.`;

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(usage);
		return;
	}

	const rootDir = process.cwd();
	const outputDir = path.resolve(rootDir, options.output);
	const screenshotDir = path.join(outputDir, 'screenshots');
	const startedAt = new Date().toISOString();
	await assertReachable(options.baseUrl);
	await mkdir(outputDir, { recursive: true });
	if (options.screenshots) await mkdir(screenshotDir, { recursive: true });

	let chrome = null;
	let fatalError = null;
	let control = null;
	let approvalConsistency = null;
	const cases = [];

	try {
		chrome = await launchChrome(options);
		for (const viewportName of options.viewports) {
			for (const theme of options.themes) {
				const result = await validateApprovedCase({
					chrome,
					viewportName,
					theme,
					options,
					outputDir,
					screenshotDir,
					detailed: viewportName === 'laptop' && theme === 'light'
				});
				cases.push(result);
				console.log(
					`${result.status.toUpperCase()} ${viewportName}/${theme} ` +
						`${result.assertions.filter((item) => !item.passed).length} failed assertion(s)`
				);
			}
		}

		const userId = cases.map((item) => item.userId).find(Boolean);
		if (!userId) throw new Error('The approved sitting did not expose its signed storage owner.');
		control = await validateControlPaper({
			chrome,
			options,
			outputDir,
			screenshotDir,
			userId
		});
		console.log(
			`${control.status.toUpperCase()} control/${options.controlSlug} ` +
				`${control.assertions.filter((item) => !item.passed).length} failed assertion(s)`
		);

		approvalConsistency = await collectApprovalConsistency(options);
	} catch (error) {
		fatalError = sanitizeText(
			error instanceof Error ? error.stack || error.message : String(error)
		);
		console.error(fatalError);
	} finally {
		if (chrome) await chrome.close();
	}

	const failedCases = cases.filter((item) => item.status !== 'passed');
	const controlFailed = control && control.status !== 'passed';
	const report = {
		schemaVersion: 'full-paper-real-chrome-acceptance-v1',
		status: fatalError || failedCases.length > 0 || controlFailed ? 'failed' : 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		baseUrl: safeUrl(options.baseUrl),
		chrome: chrome ? { binary: chrome.binary, version: chrome.version, headless: true } : null,
		configuration: {
			approvedPaper: options.approvedSlug,
			approvedPath: `/experiments/questions/${options.approvedSlug}?mode=sit`,
			controlPaper: options.controlSlug,
			controlCatalogPath: options.controlCatalogPath,
			viewports: options.viewports.map((name) => ({ name, ...VIEWPORTS[name] })),
			themes: options.themes,
			screenshots: options.screenshots,
			gradingPolicy: 'Approved paper submission prohibited; no complete-paper grading requested.'
		},
		summary: {
			caseCount: cases.length,
			passedCaseCount: cases.length - failedCases.length,
			failedCaseCount: failedCases.length,
			controlPassed: control?.status === 'passed',
			approvedGradeRequestCount: cases.reduce(
				(sum, item) => sum + item.network.gradeRequests.length,
				0
			),
			startScreenshotCount: cases.filter((item) => item.screenshots.start).length,
			inProgressScreenshotCount: cases.filter((item) => item.screenshots.inProgress).length,
			documentOverflowCount: cases.filter(
				(item) =>
					item.layouts.start.documentHorizontalOverflow ||
					item.layouts.inProgress.documentHorizontalOverflow
			).length
		},
		fatalError,
		cases,
		control,
		approvalConsistency
	};

	await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
	await writeFile(path.join(outputDir, 'summary.md'), markdownSummary(report));
	await writeFile(path.join(outputDir, 'README.md'), markdownReadme(report));

	console.log(`Evidence: ${path.relative(rootDir, path.join(outputDir, 'report.json'))}`);
	if (report.status !== 'passed') process.exitCode = 1;
}

async function validateApprovedCase({
	chrome,
	viewportName,
	theme,
	options,
	outputDir,
	screenshotDir,
	detailed
}) {
	const started = Date.now();
	const viewport = VIEWPORTS[viewportName];
	const target = await chrome.newTarget();
	const cdp = await CdpClient.connect(target.webSocketDebuggerUrl, options.timeoutMs);
	const network = observePage(cdp, options.baseUrl);
	const assertions = [];
	const screenshots = { start: null, responses: null, inProgress: null };
	let startDom = null;
	let inProgressDom = null;
	let startLayout = emptyLayout();
	let inProgressLayout = emptyLayout();
	let startState = null;
	let blankConfirmation = null;
	let responseEntry = null;
	let detailedChecks = null;
	let cleanup = null;
	let userId = null;
	let error = null;

	try {
		await configurePage(cdp, viewport, theme);
		const requestedUrl = new URL(
			`/experiments/questions/${options.approvedSlug}?mode=sit`,
			`${options.baseUrl}/`
		).toString();
		await navigateAndSettle(cdp, network.pendingRequests, requestedUrl, options);
		await waitForSelector(cdp, '.sitting-start', options.timeoutMs);
		await forceTheme(cdp, theme);

		startState = await evaluate(cdp, () => {
			const text = (selector) =>
				document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
			return {
				heading: text('.sitting-start h1'),
				intro: text('.sitting-start h1 + p'),
				facts: [...document.querySelectorAll('.sitting-start dl div')].map((item) =>
					item.textContent?.replace(/\s+/g, ' ').trim()
				),
				startButton: text('.sitting-start button'),
				signedIn: Boolean(document.querySelector('[aria-label="Account menu"]'))
			};
		});
		startDom = await collectDomSummary(cdp);
		startLayout = await collectLayoutEvidence(cdp);
		addLayoutAssertions(assertions, 'start', startLayout);
		assertions.push(
			assertion('signed-start-state', startState.startButton === 'Start paper', startState)
		);
		assertions.push(
			assertion('signed-route-gate', startState.startButton === 'Start paper', {
				accountControlVisible: startState.signedIn,
				note: 'The experiment shell omits the account menu; rendering the sitting component requires server user data.'
			})
		);
		assertions.push(assertion('theme-start', startDom.theme === theme, { active: startDom.theme }));

		if (options.screenshots) {
			await evaluate(cdp, () => window.scrollTo(0, 0));
			const filename = `start--${viewportName}--${theme}.jpg`;
			const absolute = path.join(screenshotDir, filename);
			await captureScreenshot(cdp, absolute, 'viewport');
			screenshots.start = path.relative(outputDir, absolute);
		}

		await evaluate(cdp, () => document.querySelector('.sitting-start button')?.click());
		await waitForSelector(cdp, '.full-paper-sitting', options.timeoutMs);
		const initialSession = await storedSitting(cdp);
		userId = initialSession.userId;
		assertions.push(
			assertion('session-started', initialSession.session?.status === 'in_progress', {
				status: initialSession.session?.status ?? null,
				sessionIdPresent: Boolean(initialSession.session?.sessionId),
				signedStorageOwnerPresent: Boolean(initialSession.userId)
			})
		);

		blankConfirmation = await cancelBlankSubmission(cdp);
		assertions.push(
			assertion(
				'blank-confirmation-cancelled',
				blankConfirmation.message?.includes('still blank') &&
					blankConfirmation.statusAfter === 'in_progress',
				blankConfirmation
			)
		);

		responseEntry = await enterTypedAndFixedResponses(cdp, options.timeoutMs);
		assertions.push(
			assertion(
				'normal-caret-typing',
				responseEntry.typedStored === responseEntry.typedText,
				responseEntry
			)
		);
		assertions.push(
			assertion(
				'fixed-response-stored',
				Boolean(responseEntry.fixedRef && responseEntry.fixedStored),
				responseEntry
			)
		);

		if (detailed) {
			detailedChecks = await runDetailedChecks(cdp, network.pendingRequests, options, theme);
			for (const item of detailedChecks.assertions) assertions.push(item);
			if (options.screenshots) {
				await evaluate(
					cdp,
					(ref) => {
						document.getElementById(ref)?.scrollIntoView({ block: 'center' });
					},
					responseEntry.typedRef
				);
				await delay(100);
				const filename = `responses--${viewportName}--${theme}.jpg`;
				const absolute = path.join(screenshotDir, filename);
				await captureScreenshot(cdp, absolute, 'viewport');
				screenshots.responses = path.relative(outputDir, absolute);
			}
		}

		await evaluate(cdp, () => window.scrollTo(0, 0));
		await delay(100);
		await forceTheme(cdp, theme);
		inProgressDom = await collectDomSummary(cdp);
		inProgressLayout = await collectLayoutEvidence(cdp);
		addLayoutAssertions(assertions, 'in-progress', inProgressLayout);
		assertions.push(
			assertion(
				'in-progress-dashboard',
				inProgressDom.h1.some((item) => /\d+:\d{2}/.test(item)),
				{
					h1: inProgressDom.h1
				}
			)
		);
		assertions.push(
			assertion('theme-in-progress', inProgressDom.theme === theme, {
				active: inProgressDom.theme
			})
		);

		if (options.screenshots) {
			const filename = `in-progress--${viewportName}--${theme}.jpg`;
			const absolute = path.join(screenshotDir, filename);
			await captureScreenshot(cdp, absolute, 'viewport');
			screenshots.inProgress = path.relative(outputDir, absolute);
		}

		assertions.push(
			assertion('approved-paper-never-graded', network.gradeRequests.length === 0, {
				gradeRequestCount: network.gradeRequests.length
			})
		);
		addBrowserAssertions(assertions, network, { allowStatuses: [] });
	} catch (cause) {
		error = sanitizeText(cause instanceof Error ? cause.stack || cause.message : String(cause));
		assertions.push(assertion('harness-completed', false, { error }));
	} finally {
		try {
			cleanup = await clearStoredSittings(cdp);
			assertions.push(assertion('local-sitting-cleanup', cleanup.remaining === 0, cleanup));
		} catch (cause) {
			assertions.push(
				assertion('local-sitting-cleanup', false, {
					error: sanitizeText(cause instanceof Error ? cause.message : String(cause))
				})
			);
		}
		cdp.close();
		await chrome.closeTarget(target.id);
	}

	return {
		status: assertions.every((item) => item.passed) ? 'passed' : 'failed',
		name: `${viewportName}/${theme}`,
		durationMs: Date.now() - started,
		viewport: { name: viewportName, ...viewport },
		theme,
		detailed,
		userId,
		startState,
		blankConfirmation,
		responseEntry,
		detailedChecks,
		dom: { start: startDom, inProgress: inProgressDom },
		layouts: { start: startLayout, inProgress: inProgressLayout },
		network: networkSummary(network),
		assertions,
		cleanup,
		screenshots,
		error
	};
}

async function cancelBlankSubmission(cdp) {
	return evaluate(cdp, () => {
		window.__qcAcceptanceConfirmMessages = [];
		window.confirm = (message) => {
			window.__qcAcceptanceConfirmMessages.push(String(message));
			return false;
		};
		const button = [...document.querySelectorAll('button')].find(
			(item) => item.textContent?.trim() === 'Finish paper'
		);
		button?.click();
		const storageKey = Object.keys(localStorage).find((key) =>
			key.startsWith('question-constellation:paper-sitting:v2:')
		);
		const stored = storageKey ? JSON.parse(localStorage.getItem(storageKey) ?? 'null') : null;
		return {
			buttonFound: Boolean(button),
			message: window.__qcAcceptanceConfirmMessages[0] ?? null,
			confirmationCount: window.__qcAcceptanceConfirmMessages.length,
			statusAfter: stored?.status ?? null
		};
	});
}

async function enterTypedAndFixedResponses(cdp, timeoutMs) {
	const typedText = 'The measured wavelength decreases as the generator frequency increases.';
	const target = await evaluate(cdp, () => {
		const editor = document.querySelector('.exam-part-row textarea');
		if (!(editor instanceof HTMLTextAreaElement)) return null;
		const part = editor.closest('.exam-part-row');
		editor.scrollIntoView({ block: 'center' });
		editor.focus();
		return { ref: part?.id ?? null, ariaLabel: editor.getAttribute('aria-label') };
	});
	if (!target?.ref) throw new Error('Could not find the first typed paper response.');
	await cdp.send('Input.insertText', { text: typedText });
	await waitUntil(
		async () => (await storedSitting(cdp)).session?.answers?.[target.ref] === typedText,
		timeoutMs,
		50
	);

	const fixed = await evaluate(cdp, () => {
		const control = document.querySelector('.exam-part-row .choice-row[role="radio"]');
		if (!(control instanceof HTMLButtonElement)) return null;
		const part = control.closest('.exam-part-row');
		control.scrollIntoView({ block: 'center' });
		control.click();
		return {
			ref: part?.id ?? null,
			label: control.textContent?.replace(/\s+/g, ' ').trim() ?? null,
			checked: control.getAttribute('aria-checked')
		};
	});
	if (!fixed?.ref) throw new Error('Could not find a fixed-choice paper response.');
	await waitUntil(
		async () => Boolean((await storedSitting(cdp)).session?.answers?.[fixed.ref]),
		timeoutMs,
		50
	);
	const stored = await storedSitting(cdp);
	return {
		typedRef: target.ref,
		typedAriaLabel: target.ariaLabel,
		typedText,
		typedStored: stored.session?.answers?.[target.ref] ?? null,
		fixedRef: fixed.ref,
		fixedLabel: fixed.label,
		fixedStored: stored.session?.answers?.[fixed.ref] ?? null,
		answerCount: Object.values(stored.session?.answers ?? {}).filter((value) =>
			String(value).trim()
		).length
	};
}

async function runDetailedChecks(cdp, pendingRequests, options, theme) {
	const assertions = [];
	const guard = await evaluate(cdp, async () => {
		const editor = document.querySelector('.exam-part-row textarea');
		if (!(editor instanceof HTMLTextAreaElement)) return { found: false };
		const partRef = editor.closest('.exam-part-row')?.id ?? '';
		const setValue = (value) => {
			Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
				editor,
				value
			);
			editor.dispatchEvent(
				new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value })
			);
		};

		setValue('x'.repeat(5001));
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		const warning = [...document.querySelectorAll('.warning-copy')].find((item) =>
			item.textContent?.includes('5,000-character')
		);
		const finish = [...document.querySelectorAll('button')].find(
			(item) => item.textContent?.trim() === 'Finish paper'
		);
		const overlong = {
			warning: warning?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
			finishDisabled: finish?.disabled ?? null,
			valueLength: editor.value.length
		};

		setValue('Ordinary typing still works after blocked external input.');
		editor.focus();
		const valueBeforeBlockedEvents = editor.value;
		const eventResults = {};
		for (const type of ['copy', 'cut', 'paste', 'drop']) {
			const event = new Event(type, { bubbles: true, cancelable: true });
			const dispatched = editor.dispatchEvent(event);
			eventResults[type] = { defaultPrevented: event.defaultPrevented, dispatched };
		}
		const beforeInput = new InputEvent('beforeinput', {
			bubbles: true,
			cancelable: true,
			inputType: 'insertFromPaste',
			data: 'blocked paste'
		});
		const beforeInputDispatched = editor.dispatchEvent(beforeInput);
		eventResults.beforeinput = {
			defaultPrevented: beforeInput.defaultPrevented,
			dispatched: beforeInputDispatched
		};
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		const prompt = editor.closest('.exam-part-row')?.querySelector('.exam-question-body p');
		return {
			found: true,
			partRef,
			overlong,
			eventResults,
			valueBeforeBlockedEvents,
			valueAfterBlockedEvents: editor.value,
			integrityNotice:
				document
					.querySelector('.sitting-dashboard .warning-copy')
					?.textContent?.replace(/\s+/g, ' ')
					.trim() ?? null,
			userSelect: {
				prompt: prompt ? getComputedStyle(prompt).userSelect : null,
				editor: getComputedStyle(editor).userSelect
			}
		};
	});
	assertions.push(
		assertion('5000-character-guard', guard.overlong?.finishDisabled === true, guard.overlong)
	);
	assertions.push(
		assertion(
			'external-input-events-blocked',
			['copy', 'cut', 'paste', 'drop', 'beforeinput'].every(
				(type) => guard.eventResults?.[type]?.defaultPrevented === true
			),
			guard.eventResults
		)
	);
	assertions.push(
		assertion(
			'blocked-input-does-not-change-answer',
			guard.valueBeforeBlockedEvents === guard.valueAfterBlockedEvents,
			{
				before: guard.valueBeforeBlockedEvents,
				after: guard.valueAfterBlockedEvents
			}
		)
	);
	assertions.push(
		assertion(
			'text-selection-policy',
			guard.userSelect?.prompt === 'none' && guard.userSelect?.editor === 'text',
			guard.userSelect
		)
	);

	const beforeNavigation = await storedSitting(cdp);
	await delay(900);
	const navigation = await evaluate(cdp, () => {
		const links = [...document.querySelectorAll('.question-navigator a')];
		const link = links[1];
		link?.click();
		return {
			linkCount: links.length,
			label: link?.getAttribute('aria-label') ?? null,
			href: link?.getAttribute('href') ?? null
		};
	});
	await waitUntil(
		async () => {
			const current = await storedSitting(cdp);
			return (
				Boolean(current.session?.activePartRef) &&
				current.session?.activePartRef !== beforeNavigation.session?.activePartRef
			);
		},
		options.timeoutMs,
		50
	);
	const afterNavigation = await storedSitting(cdp);
	const priorRef = beforeNavigation.session?.activePartRef;
	const priorDurationBefore = beforeNavigation.session?.responseDurationsMs?.[priorRef] ?? 0;
	const priorDurationAfter = afterNavigation.session?.responseDurationsMs?.[priorRef] ?? 0;
	const timing = {
		...navigation,
		priorRef,
		activeAfter: afterNavigation.session?.activePartRef ?? null,
		priorDurationBefore,
		priorDurationAfter,
		deltaMs: priorDurationAfter - priorDurationBefore
	};
	assertions.push(
		assertion(
			'part-navigation-focus-timing',
			timing.activeAfter !== priorRef && timing.deltaMs >= 700,
			timing
		)
	);

	const beforeReload = await storedSitting(cdp);
	const elapsedBefore = Date.now() - beforeReload.session.startedAt;
	await delay(1250);
	const load = cdp.waitFor('Page.loadEventFired', options.timeoutMs);
	await cdp.send('Page.reload', { ignoreCache: true });
	await load;
	await waitForDocumentReady(cdp, options.timeoutMs);
	await waitForNetworkIdle(pendingRequests, options.timeoutMs, options.settleMs);
	await waitForSelector(cdp, '.full-paper-sitting', options.timeoutMs);
	await settlePageAssets(cdp, options.timeoutMs);
	await forceTheme(cdp, theme);
	const afterReload = await storedSitting(cdp);
	const elapsedAfter = Date.now() - afterReload.session.startedAt;
	const resume = {
		sameSession: afterReload.session.sessionId === beforeReload.session.sessionId,
		sameStartedAt: afterReload.session.startedAt === beforeReload.session.startedAt,
		answersPreserved:
			JSON.stringify(afterReload.session.answers) === JSON.stringify(beforeReload.session.answers),
		status: afterReload.session.status,
		elapsedBefore,
		elapsedAfter,
		wallClockDeltaMs: elapsedAfter - elapsedBefore
	};
	assertions.push(
		assertion(
			'reload-resume-wall-clock',
			resume.sameSession &&
				resume.sameStartedAt &&
				resume.answersPreserved &&
				resume.status === 'in_progress' &&
				resume.wallClockDeltaMs >= 1000,
			resume
		)
	);
	return { guard, timing, resume, assertions };
}

async function validateControlPaper({ chrome, options, outputDir, screenshotDir, userId }) {
	const started = Date.now();
	const target = await chrome.newTarget();
	const cdp = await CdpClient.connect(target.webSocketDebuggerUrl, options.timeoutMs);
	const network = observePage(cdp, options.baseUrl);
	const assertions = [];
	let catalog = null;
	let directExperiment = null;
	let refusal = null;
	let evidence = null;
	let layout = emptyLayout();
	let screenshot = null;
	let error = null;

	try {
		await configurePage(cdp, VIEWPORTS.laptop, 'light');
		const catalogUrl = new URL(options.controlCatalogPath, `${options.baseUrl}/`).toString();
		await navigateAndSettle(cdp, network.pendingRequests, catalogUrl, options);
		await waitForSelector(cdp, '#paper-title', options.timeoutMs);
		catalog = await evaluate(cdp, () => ({
			title:
				document.querySelector('#paper-title')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
			signedIn: Boolean(document.querySelector('[aria-label="Account menu"]')),
			onlineSittingCard: Boolean(document.querySelector('.online-sitting')),
			sittingLinks: [...document.querySelectorAll('a')]
				.map((item) => item.getAttribute('href'))
				.filter((href) => href?.includes('mode=sit')),
			documents: [...document.querySelectorAll('.document-grid a')].map((item) =>
				item.textContent?.replace(/\s+/g, ' ').trim()
			)
		}));
		layout = await collectLayoutEvidence(cdp);
		assertions.push(
			assertion(
				'control-not-advertised-as-online-sitting',
				catalog.onlineSittingCard === false && catalog.sittingLinks.length === 0,
				catalog
			)
		);
		assertions.push(assertion('control-catalog-signed-in', catalog.signedIn, catalog));
		addLayoutAssertions(assertions, 'control-catalog', layout);

		if (options.screenshots) {
			const filename = 'control-catalog--laptop--light.jpg';
			const absolute = path.join(screenshotDir, filename);
			await captureScreenshot(cdp, absolute, 'viewport');
			screenshot = path.relative(outputDir, absolute);
		}

		const directUrl = new URL(
			`/experiments/questions/${options.controlSlug}?mode=sit`,
			`${options.baseUrl}/`
		).toString();
		const directResponse = await fetch(directUrl, { redirect: 'manual' });
		directExperiment = {
			url: safeUrl(directUrl),
			status: directResponse.status,
			location: safeUrl(directResponse.headers.get('location') ?? '')
		};
		assertions.push(
			assertion('control-renderer-not-exposed', directExperiment.status === 404, directExperiment)
		);

		const sessionId = randomUUID();
		const before = await paperEvidenceCounts(userId, sessionId);
		refusal = await evaluate(
			cdp,
			async ({ paperSlug, sessionId }) => {
				const response = await fetch(
					`/api/experiments/questions/${encodeURIComponent(paperSlug)}/01/grade`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							answers: { '01.1': '' },
							sessionId,
							responseDurationsMs: { '01.1': 0 }
						})
					}
				);
				let body;
				try {
					body = await response.json();
				} catch {
					body = { parseError: true };
				}
				return { status: response.status, body };
			},
			{ paperSlug: options.controlSlug, sessionId }
		);
		await waitForNetworkIdle(network.pendingRequests, options.timeoutMs, options.settleMs);
		const after = await paperEvidenceCounts(userId, sessionId);
		evidence = { sessionId, before, after };
		assertions.push(
			assertion(
				'control-grade-post-refused-before-model',
				[409, 503].includes(refusal.status) && refusal.body?.error === 'paper_sitting_unavailable',
				refusal
			)
		);
		assertions.push(
			assertion(
				'control-refusal-created-no-evidence',
				before.attempts === 0 &&
					before.evidence === 0 &&
					after.attempts === 0 &&
					after.evidence === 0,
				{ before, after }
			)
		);
		assertions.push(
			assertion('one-intentional-control-grade-request', network.gradeRequests.length === 1, {
				gradeRequests: network.gradeRequests
			})
		);
		addBrowserAssertions(assertions, network, {
			allowStatuses: [409, 503],
			allowedErrorUrlPatterns: [/\/api\/experiments\/questions\/[^/]+\/[^/]+\/grade$/]
		});
	} catch (cause) {
		error = sanitizeText(cause instanceof Error ? cause.stack || cause.message : String(cause));
		assertions.push(assertion('control-harness-completed', false, { error }));
	} finally {
		cdp.close();
		await chrome.closeTarget(target.id);
	}

	return {
		status: assertions.every((item) => item.passed) ? 'passed' : 'failed',
		durationMs: Date.now() - started,
		catalog,
		directExperiment,
		refusal,
		evidence,
		layout,
		network: networkSummary(network),
		assertions,
		screenshot,
		error
	};
}

async function paperEvidenceCounts(userId, sessionId) {
	const attemptPrefix = `paper:${encodeURIComponent(userId)}:${encodeURIComponent(sessionId)}:`;
	const [row = {}] = await d1Rows(
		`SELECT
		  (SELECT COUNT(*) FROM user_question_attempts WHERE user_id = ? AND instr(id, ?) = 1) AS attempts,
		  (SELECT COUNT(*) FROM user_learning_evidence WHERE user_id = ? AND source_session_id = ?) AS evidence`,
		[userId, attemptPrefix, userId, sessionId],
		{ binding: 'PERSONAL_DB' }
	);
	return { attempts: Number(row.attempts ?? 0), evidence: Number(row.evidence ?? 0) };
}

async function collectApprovalConsistency(options) {
	const routePath = `/experiments/questions/${CS1A_SLUG}?mode=sit`;
	const [routeResponse, catalogResponse] = await Promise.all([
		fetch(new URL(`${routePath}&acceptance=${Date.now()}`, `${options.baseUrl}/`)),
		fetch(new URL(`${CS1A_CATALOG_PATH}?acceptance=${Date.now()}`, `${options.baseUrl}/`))
	]);
	const [routeHtml, catalogHtml] = await Promise.all([
		routeResponse.text(),
		catalogResponse.text()
	]);
	const readinessMatch = routeHtml.match(
		/sittingAvailability:\{available:(true|false),reason:(null|"[^"]+")[^}]*reviewedAt:(null|"[^"]+")/
	);
	const reviewRows = await d1Rows(
		`SELECT source_document_id, past_paper_entry_id, status, expected_question_count,
		        expected_total_marks, duration_minutes, reviewed_at,
		        approved_content_fingerprint
		 FROM question_paper_sitting_reviews
		 WHERE source_document_id = ?`,
		[CS1A_SLUG],
		{ binding: 'QUESTION_DB' }
	);
	const liveContentFingerprint = await fingerprintPaperSittingContent({
		sourceDocumentId: CS1A_SLUG,
		query: (sql, params) => d1Rows(sql, params, { binding: 'QUESTION_DB' })
	});
	const approvedReview =
		reviewRows.length === 1 && reviewRows[0].status === 'approved' ? reviewRows[0] : null;
	return {
		paperSlug: CS1A_SLUG,
		route: {
			url: safeUrl(new URL(routePath, `${options.baseUrl}/`).toString()),
			status: routeResponse.status,
			available: readinessMatch ? readinessMatch[1] === 'true' : null,
			reason: readinessMatch?.[2]?.replaceAll('"', '') ?? null,
			reviewedAt: readinessMatch?.[3]?.replaceAll('"', '') ?? null,
			rendersPreview: routeHtml.includes('Online sitting is not ready for this paper')
		},
		catalog: {
			url: safeUrl(new URL(CS1A_CATALOG_PATH, `${options.baseUrl}/`).toString()),
			status: catalogResponse.status,
			hasOnlineSittingCard: catalogHtml.includes('Sit this paper in the browser'),
			hasSittingHref: catalogHtml.includes(`/experiments/questions/${CS1A_SLUG}?mode=sit`)
		},
		reviewRows,
		liveContentFingerprint,
		contentFingerprintMatches:
			Boolean(approvedReview) &&
			approvedReview.approved_content_fingerprint === liveContentFingerprint
	};
}

async function configurePage(cdp, viewport, theme) {
	await Promise.all([
		cdp.send('Page.enable'),
		cdp.send('Runtime.enable'),
		cdp.send('Log.enable'),
		cdp.send('Network.enable')
	]);
	await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
	await cdp.send('Emulation.setDeviceMetricsOverride', {
		width: viewport.width,
		height: viewport.height,
		deviceScaleFactor: viewport.deviceScaleFactor,
		mobile: viewport.mobile,
		screenWidth: viewport.width,
		screenHeight: viewport.height,
		dontSetVisibleSize: false
	});
	await cdp.send('Emulation.setTouchEmulationEnabled', {
		enabled: viewport.touch,
		maxTouchPoints: viewport.touch ? 5 : 1
	});
	await cdp.send('Emulation.setEmulatedMedia', {
		media: 'screen',
		features: [{ name: 'prefers-color-scheme', value: theme }]
	});
	await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
		source: `try {
			const acceptanceKey = 'qc-full-paper-acceptance-initialized';
			if (!sessionStorage.getItem(acceptanceKey)) {
				for (const key of Object.keys(localStorage)) {
					if (key.startsWith(${JSON.stringify(PAPER_STORAGE_PREFIX)})) localStorage.removeItem(key);
				}
				sessionStorage.setItem(acceptanceKey, '1');
			}
			localStorage.setItem('question-constellation-theme', ${JSON.stringify(theme)});
		} catch {}`
	});
}

async function navigateAndSettle(cdp, pendingRequests, url, options) {
	const load = cdp.waitFor('Page.loadEventFired', options.timeoutMs);
	await cdp.send('Page.navigate', { url });
	await load;
	await waitForDocumentReady(cdp, options.timeoutMs);
	await waitForNetworkIdle(pendingRequests, options.timeoutMs, options.settleMs);
	await settlePageAssets(cdp, options.timeoutMs);
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
			const userId = separator >= 0 ? decodeURIComponent(remainder.slice(0, separator)) : null;
			const paperId = separator >= 0 ? decodeURIComponent(remainder.slice(separator + 1)) : null;
			return {
				keyCount: keys.length,
				storageKey,
				userId,
				paperId,
				session: storageKey ? JSON.parse(localStorage.getItem(storageKey) ?? 'null') : null
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

function observePage(cdp, baseUrl) {
	const state = {
		pendingRequests: new Set(),
		requestUrls: new Map(),
		documentResponses: [],
		errorResponses: [],
		failedRequests: [],
		gradeRequests: [],
		console: [],
		exceptions: [],
		logs: []
	};
	cdp.on('Network.requestWillBeSent', (event) => {
		const url = event.request?.url ?? '';
		state.requestUrls.set(event.requestId, url);
		if (tracksForIdle(event.type, url)) state.pendingRequests.add(event.requestId);
		if (/\/api\/experiments\/questions\/[^/]+\/[^/]+\/grade(?:\?|$)/.test(url)) {
			state.gradeRequests.push({ method: event.request?.method ?? null, url: safeUrl(url) });
		}
	});
	cdp.on('Network.loadingFinished', (event) => {
		state.pendingRequests.delete(event.requestId);
		state.requestUrls.delete(event.requestId);
	});
	cdp.on('Network.loadingFailed', (event) => {
		state.pendingRequests.delete(event.requestId);
		const url = state.requestUrls.get(event.requestId) ?? '';
		state.requestUrls.delete(event.requestId);
		if (!event.canceled && event.blockedReason !== 'inspector') {
			state.failedRequests.push({ url: safeUrl(url), error: sanitizeText(event.errorText) });
		}
	});
	cdp.on('Network.responseReceived', (event) => {
		const response = {
			url: safeUrl(event.response?.url ?? ''),
			status: event.response?.status ?? null,
			type: event.type ?? null
		};
		if (event.type === 'Document') state.documentResponses.push(response);
		if (
			(response.status ?? 0) >= 400 &&
			new URL(event.response.url).origin === new URL(baseUrl).origin
		) {
			state.errorResponses.push(response);
		}
	});
	cdp.on('Runtime.consoleAPICalled', (event) => {
		state.console.push({
			type: event.type,
			text: sanitizeText(
				(event.args ?? []).map((arg) => arg.value ?? arg.description ?? arg.type).join(' ')
			)
		});
	});
	cdp.on('Runtime.exceptionThrown', (event) => {
		state.exceptions.push({
			text: sanitizeText(
				event.exceptionDetails?.exception?.description ??
					event.exceptionDetails?.text ??
					'Exception'
			)
		});
	});
	cdp.on('Log.entryAdded', ({ entry }) => {
		state.logs.push({
			level: entry.level,
			text: sanitizeText(entry.text),
			url: safeUrl(entry.url ?? '')
		});
	});
	return state;
}

function networkSummary(network) {
	return {
		documentResponses: network.documentResponses,
		errorResponses: network.errorResponses,
		failedRequests: network.failedRequests,
		gradeRequests: network.gradeRequests,
		console: network.console.filter((item) => ['error', 'warning', 'warn'].includes(item.type)),
		exceptions: network.exceptions,
		logs: network.logs.filter((item) => ['error', 'warning'].includes(item.level))
	};
}

function addBrowserAssertions(
	assertions,
	network,
	{ allowStatuses, allowedErrorUrlPatterns = [] }
) {
	const document = network.documentResponses.at(-1);
	const logErrors = network.logs.filter(
		(item) =>
			item.level === 'error' &&
			!allowedErrorUrlPatterns.some((pattern) => {
				try {
					return pattern.test(new URL(item.url).pathname);
				} catch {
					return false;
				}
			})
	);
	assertions.push(
		assertion('document-response-ok', document?.status >= 200 && document?.status < 400, document)
	);
	assertions.push(
		assertion(
			'no-page-errors',
			network.console.every((item) => item.type !== 'error') &&
				logErrors.length === 0 &&
				network.exceptions.length === 0,
			{
				consoleErrors: network.console.filter((item) => item.type === 'error'),
				logErrors,
				exceptions: network.exceptions
			}
		)
	);
	assertions.push(
		assertion('no-network-failures', network.failedRequests.length === 0, network.failedRequests)
	);
	const unexpectedResponses = network.errorResponses.filter(
		(item) => !allowStatuses.includes(item.status)
	);
	assertions.push(
		assertion('no-unexpected-http-errors', unexpectedResponses.length === 0, unexpectedResponses)
	);
}

function addLayoutAssertions(assertions, state, layout) {
	const unexpectedClippedContent = layout.clippedContent.filter(
		(item) =>
			!(item.width <= 1.5 && item.selector.startsWith('h2#question-')) &&
			item.selector !== 'span.katex-mathml'
	);
	assertions.push(
		assertion(`${state}-no-document-overflow`, !layout.documentHorizontalOverflow, {
			document: layout.document
		})
	);
	assertions.push(
		assertion(`${state}-no-viewport-protrusions`, layout.viewportProtrusions.length === 0, {
			protrusions: layout.viewportProtrusions
		})
	);
	assertions.push(
		assertion(`${state}-no-clipped-content`, unexpectedClippedContent.length === 0, {
			clippedContent: unexpectedClippedContent,
			ignoredAccessibilityClippingCount:
				layout.clippedContent.length - unexpectedClippedContent.length
		})
	);
}

function assertion(name, passed, evidence = null) {
	return { name, passed: Boolean(passed), evidence };
}

function emptyLayout() {
	return {
		viewport: null,
		document: null,
		documentHorizontalOverflow: false,
		viewportProtrusions: [],
		clippedContent: [],
		horizontalScrollRegions: []
	};
}

function parseArgs(argv) {
	const result = {
		baseUrl: 'http://127.0.0.1:5173',
		output: 'docs/release-evidence/full-paper-browser-validation',
		approvedSlug: DEFAULT_APPROVED_SLUG,
		controlSlug: DEFAULT_CONTROL_SLUG,
		controlCatalogPath: DEFAULT_CONTROL_CATALOG_PATH,
		viewports: ['mobile', 'ipad', 'laptop'],
		themes: ['light', 'dark'],
		chromeBin: '/usr/bin/google-chrome',
		settleMs: 750,
		timeoutMs: 30_000,
		screenshots: true,
		help: false
	};
	for (const arg of argv) {
		if (arg === '--help') result.help = true;
		else if (arg === '--no-screenshots') result.screenshots = false;
		else if (arg.startsWith('--base-url=')) result.baseUrl = value(arg).replace(/\/+$/, '');
		else if (arg.startsWith('--output=')) result.output = value(arg);
		else if (arg.startsWith('--approved-slug=')) result.approvedSlug = value(arg);
		else if (arg.startsWith('--control-slug=')) result.controlSlug = value(arg);
		else if (arg.startsWith('--control-catalog-path=')) result.controlCatalogPath = value(arg);
		else if (arg.startsWith('--viewport=')) result.viewports = list(value(arg));
		else if (arg.startsWith('--theme=')) result.themes = list(value(arg));
		else if (arg.startsWith('--chrome-bin=')) result.chromeBin = value(arg);
		else if (arg.startsWith('--settle-ms=')) result.settleMs = positiveInteger(value(arg), arg);
		else if (arg.startsWith('--timeout-ms=')) result.timeoutMs = positiveInteger(value(arg), arg);
		else throw new Error(`Unknown argument: ${arg}\n\n${usage}`);
	}
	for (const viewport of result.viewports) {
		if (!VIEWPORTS[viewport]) throw new Error(`Unknown viewport: ${viewport}`);
	}
	for (const theme of result.themes) {
		if (!['light', 'dark'].includes(theme)) throw new Error(`Unknown theme: ${theme}`);
	}
	if (!result.controlCatalogPath.startsWith('/')) {
		throw new Error('--control-catalog-path must be an absolute application path.');
	}
	new URL(result.baseUrl);
	return result;
}

function value(arg) {
	return arg.slice(arg.indexOf('=') + 1);
}

function list(raw) {
	const values = raw
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
	if (values.length === 0) throw new Error('Expected a comma-separated value.');
	return [...new Set(values)];
}

function positiveInteger(raw, arg) {
	const parsed = Number(raw);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		throw new Error(`Expected a positive integer: ${arg}`);
	}
	return parsed;
}

async function assertReachable(baseUrl) {
	const response = await fetch(new URL('/', `${baseUrl}/`), { redirect: 'manual' });
	if (response.status < 200 || response.status >= 500) {
		throw new Error(`Base URL returned HTTP ${response.status}: ${safeUrl(baseUrl)}`);
	}
}

function markdownSummary(report) {
	const rows = report.cases
		.map(
			(item) =>
				`| ${item.viewport.name} | ${item.theme} | ${item.status} | ${item.assertions.filter((assertion) => !assertion.passed).length} | ${item.network.gradeRequests.length} | ${item.layouts.start.documentHorizontalOverflow || item.layouts.inProgress.documentHorizontalOverflow ? 'yes' : 'no'} | ${item.screenshots.start ? `[start](${item.screenshots.start})` : '—'} | ${item.screenshots.inProgress ? `[in progress](${item.screenshots.inProgress})` : '—'} |`
		)
		.join('\n');
	return `# Full-paper real-Chrome acceptance

- Status: **${report.status}**
- Approved sitting: \`${report.configuration.approvedPaper}\`
- Approved cases: ${report.summary.passedCaseCount}/${report.summary.caseCount}
- Approved-paper grade requests: **${report.summary.approvedGradeRequestCount}**
- Control refusal passed: **${report.summary.controlPassed ? 'yes' : 'no'}**
- Approved-paper submission or model grading: **not performed**

| Viewport | Theme | Status | Failed assertions | Grade requests | Document overflow | Start | In progress |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
${rows}

The detailed laptop/light case covers blank confirmation cancellation, ordinary caret typing,
fixed response persistence, the 5,000-character guard, copy/cut/paste/drop/beforeinput blocking,
selection policy, part-focus timing, and reload/resume wall-clock behavior. The control uses the
incomplete Combined Physics Paper 1 catalog entry, confirms that no online sitting is advertised,
checks that its renderer route is absent, sends one fail-closed sitting request, and verifies zero
attempt/evidence rows for that unique session. See [report.json](report.json) for exact evidence.
`;
}

function markdownReadme(report) {
	return `# Full-paper browser evidence

Generated by \`node scripts/validate-full-paper-browser.mjs\` against a signed local Vite session
using real headless Chrome and a fresh temporary Chrome profile.

Safety boundary: the approved ${report.configuration.approvedPaper} sitting was never submitted,
and no approved-paper grade endpoint was called. The only grade-shaped request was the deliberate
${report.configuration.controlPaper} control, which had to return HTTP 409 before any model call or
personal evidence write.

- [Human summary](summary.md)
- [Machine-readable report](report.json)
- [Screenshots](screenshots/)
`;
}

await main();
