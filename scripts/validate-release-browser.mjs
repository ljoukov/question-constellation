#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** @typedef {'mobile' | 'ipad' | 'laptop'} ViewportName */
/** @typedef {'light' | 'dark'} Theme */
/** @typedef {'viewport' | 'full'} ScreenshotMode */
/** @typedef {{name: string, pathname: string}} Route */
/** @typedef {{width: number, height: number, deviceScaleFactor: number, mobile: boolean, touch: boolean}} Viewport */
/**
 * @typedef {object} RunOptions
 * @property {string} baseUrl
 * @property {string} output
 * @property {Route[]} routes
 * @property {ViewportName[]} viewports
 * @property {Theme[]} themes
 * @property {ScreenshotMode} screenshot
 * @property {boolean} screenshots
 * @property {string} chromeBin
 * @property {number} settleMs
 * @property {number} timeoutMs
 * @property {string} englishRoute
 * @property {string | null} englishAnswer
 * @property {boolean} englishCheck
 * @property {boolean} requireSignedIn
 * @property {boolean} failOnIssues
 * @property {boolean} help
 */
/** @typedef {{webSocketDebuggerUrl: string, id: string}} ChromeTarget */
/** @typedef {{websocket: string, port: number}} ChromeDebugEndpoint */
/**
 * @typedef {object} ChromeController
 * @property {string} binary
 * @property {string} version
 * @property {() => Promise<ChromeTarget>} newTarget
 * @property {(id: string) => Promise<void>} closeTarget
 * @property {() => Promise<void>} close
 */
/** @typedef {{url: string, status: number | null, statusText: string, type: string | null}} CdpResponseRecord */
/** @typedef {{kind: string, selector: string, left: number, right: number, width: number, clientWidth: number, scrollWidth: number, overflowX: string, textSample: string}} LayoutFinding */
/**
 * @typedef {object} LayoutEvidence
 * @property {{width: number, height: number, devicePixelRatio: number} | null} viewport
 * @property {{clientWidth: number, scrollWidth: number, clientHeight: number, scrollHeight: number} | null} document
 * @property {boolean} documentHorizontalOverflow
 * @property {LayoutFinding[]} viewportProtrusions
 * @property {LayoutFinding[]} clippedContent
 * @property {LayoutFinding[]} horizontalScrollRegions
 */
/**
 * @typedef {object} ValidationCase
 * @property {'passed' | 'failed'} status
 * @property {string} name
 * @property {Route} route
 * @property {string} requestedUrl
 * @property {string | null} finalUrl
 * @property {number | null} httpStatus
 * @property {number} durationMs
 * @property {{name: ViewportName} & Viewport} viewport
 * @property {{requested: Theme, active: string | null}} theme
 * @property {any} dom
 * @property {LayoutEvidence} layout
 * @property {any} interaction
 * @property {any[]} errors
 * @property {any[]} console
 * @property {any[]} pageExceptions
 * @property {any[]} logEntries
 * @property {any[]} failedRequests
 * @property {any[]} errorResponses
 * @property {string | null} screenshot
 */

/** @type {Route[]} */
const DEFAULT_ROUTES = [
	{ name: 'home', pathname: '/' },
	{ name: 'questions', pathname: '/questions' },
	{ name: 'challenges', pathname: '/challenges' },
	{ name: 'physics-challenges', pathname: '/challenges/physics' },
	{
		name: 'physics-challenge-game',
		pathname: '/challenges/physics/half-range-uncertainty'
	},
	{ name: 'biology-subject', pathname: '/subjects/biology' },
	{ name: 'physics-content', pathname: '/subjects/physics/content' },
	{ name: 'english-literature', pathname: '/subjects/english-literature' },
	{
		name: 'english-literature-content',
		pathname: '/subjects/english-literature/content'
	},
	{
		name: 'english-practice',
		pathname: '/questions/ocr-j352-01-jun24-04-1b/practice'
	},
	{ name: 'biology-flashcards', pathname: '/recall/biology/flashcards' },
	{ name: 'biology-mcq', pathname: '/recall/biology/multiple-choice' },
	{ name: 'biology-true-false', pathname: '/recall/biology/true-or-false' },
	{
		name: 'public-question',
		pathname: '/questions/ocr-j352-01-jun24-04-1b'
	},
	{
		name: 'answer-chain',
		pathname: '/questions/ocr-j352-01-jun24-04-1b/answer-chain'
	},
	{ name: 'physics-subject', pathname: '/subjects/physics' }
];

/** @type {Record<string, Viewport>} */
const VIEWPORTS = {
	mobile: { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, touch: true },
	ipad: { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true, touch: true },
	laptop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, touch: false }
};

const usage = `Usage:
node scripts/validate-release-browser.mjs [options]

Options:
  --base-url=http://127.0.0.1:5173
  --output=docs/release-evidence/browser-validation
  --route=name:/pathname       Repeat to replace the default release-route matrix.
  --viewport=mobile,ipad,laptop
  --theme=light,dark
  --screenshot=viewport|full   Default: viewport.
  --chrome-bin=/usr/bin/google-chrome
  --settle-ms=750
  --timeout-ms=20000
  --english-route=english-practice
  --english-answer="typed response"
  --english-check              Explicitly click Check step and await feedback.
  --allow-anonymous            Do not require the signed-in account control.
  --fail-on-issues             Exit non-zero on page errors or document overflow.
  --no-screenshots
  --help

The English interaction is opt-in. --english-answer fills the active response editor;
--english-check additionally invokes grading and therefore requires --english-answer.`;

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

	/** @type {ChromeController | null} */
	let chrome = null;
	let fatalError = null;
	/** @type {ValidationCase[]} */
	const cases = [];

	try {
		chrome = await launchChrome(options);
		for (const viewportName of options.viewports) {
			for (const theme of options.themes) {
				for (const route of options.routes) {
					const result = await validateCase({
						chrome,
						viewportName,
						theme,
						route,
						options,
						outputDir,
						screenshotDir
					});
					cases.push(result);
					const issueCount = result.errors.length;
					console.log(
						`${result.status.toUpperCase()} ${viewportName}/${theme}/${route.name}` +
							` ${result.httpStatus ?? '-'} ${result.durationMs}ms ${issueCount} issue(s)`
					);
				}
			}
		}
	} catch (error) {
		fatalError = error instanceof Error ? error.stack || error.message : String(error);
		console.error(fatalError);
	} finally {
		if (chrome) await chrome.close();
	}

	const failedCases = cases.filter((item) => item.status === 'failed');
	const report = {
		schemaVersion: 1,
		status: fatalError || failedCases.length > 0 ? 'failed' : 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		baseUrl: safeUrl(options.baseUrl),
		chrome: chrome
			? {
					binary: chrome.binary,
					version: chrome.version,
					headless: true
				}
			: null,
		configuration: {
			routes: options.routes,
			viewports: options.viewports.map((name) => ({ name, ...VIEWPORTS[name] })),
			themes: options.themes,
			screenshot: options.screenshots ? options.screenshot : 'disabled',
			englishInteraction: options.englishAnswer
				? {
						route: options.englishRoute,
						answerLength: options.englishAnswer.length,
						checkRequested: options.englishCheck
					}
				: null,
			requireSignedIn: options.requireSignedIn
		},
		summary: {
			caseCount: cases.length,
			passedCaseCount: cases.length - failedCases.length,
			failedCaseCount: failedCases.length,
			pageErrorCount: cases.reduce((sum, item) => sum + item.errors.length, 0),
			documentOverflowCaseCount: cases.filter((item) => item.layout.documentHorizontalOverflow)
				.length,
			viewportProtrusionCount: cases.reduce(
				(sum, item) => sum + item.layout.viewportProtrusions.length,
				0
			),
			clippedContentCount: cases.reduce((sum, item) => sum + item.layout.clippedContent.length, 0),
			horizontalScrollRegionCount: cases.reduce(
				(sum, item) => sum + item.layout.horizontalScrollRegions.length,
				0
			)
		},
		fatalError: fatalError ? sanitizeText(fatalError) : null,
		cases
	};

	await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
	await writeFile(path.join(outputDir, 'summary.md'), markdownSummary(report));

	console.log(`Evidence: ${path.relative(rootDir, path.join(outputDir, 'report.json'))}`);
	if (fatalError) process.exitCode = 1;
	if (options.failOnIssues && failedCases.length > 0) process.exitCode = 1;
}

/**
 * @param {{chrome: ChromeController, viewportName: ViewportName, theme: Theme, route: Route, options: RunOptions, outputDir: string, screenshotDir: string}} input
 * @returns {Promise<ValidationCase>}
 */
async function validateCase({
	chrome,
	viewportName,
	theme,
	route,
	options: runOptions,
	outputDir,
	screenshotDir
}) {
	const started = Date.now();
	const viewport = VIEWPORTS[viewportName];
	const target = await chrome.newTarget();
	const cdp = await CdpClient.connect(target.webSocketDebuggerUrl, runOptions.timeoutMs);
	/** @type {any[]} */ const runtimeEvents = [];
	/** @type {any[]} */ const logEntries = [];
	/** @type {any[]} */ const pageExceptions = [];
	/** @type {any[]} */ const failedRequests = [];
	/** @type {CdpResponseRecord[]} */ const errorResponses = [];
	/** @type {Set<string>} */ const requestIds = new Set();
	/** @type {Map<string, string>} */ const requestUrls = new Map();
	/** @type {CdpResponseRecord | null} */ let documentResponse = null;

	cdp.on('Runtime.consoleAPICalled', (event) => {
		runtimeEvents.push({
			type: event.type,
			text: sanitizeText(
				/** @type {any[]} */ (event.args ?? [])
					.map((arg) => arg.value ?? arg.description ?? arg.type)
					.map(String)
					.join(' ')
			),
			timestamp: event.timestamp ?? null
		});
	});
	cdp.on('Runtime.exceptionThrown', (event) => {
		pageExceptions.push({
			text: sanitizeText(
				event.exceptionDetails?.exception?.description ??
					event.exceptionDetails?.text ??
					'Unhandled page exception'
			),
			lineNumber: event.exceptionDetails?.lineNumber ?? null,
			columnNumber: event.exceptionDetails?.columnNumber ?? null,
			url: safeUrl(event.exceptionDetails?.url ?? '')
		});
	});
	cdp.on('Log.entryAdded', ({ entry }) => {
		logEntries.push({
			level: entry.level,
			source: entry.source,
			text: sanitizeText(entry.text),
			url: safeUrl(entry.url ?? '')
		});
	});
	cdp.on('Network.requestWillBeSent', (event) => {
		requestUrls.set(event.requestId, event.request?.url ?? '');
		if (tracksForIdle(event.type, event.request?.url)) requestIds.add(event.requestId);
	});
	cdp.on('Network.loadingFinished', (event) => {
		requestIds.delete(event.requestId);
		requestUrls.delete(event.requestId);
	});
	cdp.on('Network.loadingFailed', (event) => {
		requestIds.delete(event.requestId);
		const requestUrl = requestUrls.get(event.requestId) ?? '';
		requestUrls.delete(event.requestId);
		if (event.canceled || event.blockedReason === 'inspector') return;
		failedRequests.push({
			url: safeUrl(requestUrl),
			type: event.type ?? null,
			errorText: sanitizeText(event.errorText ?? 'Network request failed')
		});
	});
	cdp.on('Network.responseReceived', (event) => {
		const item = {
			url: safeUrl(event.response?.url ?? ''),
			status: event.response?.status ?? null,
			statusText: sanitizeText(event.response?.statusText ?? ''),
			type: event.type ?? null
		};
		if (event.type === 'Document') documentResponse = item;
		if (
			(event.response?.status ?? 0) >= 400 &&
			sameOrigin(event.response.url, runOptions.baseUrl)
		) {
			errorResponses.push(item);
		}
	});

	try {
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
			source: `try { localStorage.setItem('question-constellation-theme', ${JSON.stringify(theme)}); } catch {}`
		});

		const loadPromise = cdp.waitFor('Page.loadEventFired', runOptions.timeoutMs);
		const requestedUrl = new URL(route.pathname, `${runOptions.baseUrl}/`).toString();
		await cdp.send('Page.navigate', { url: requestedUrl });
		await loadPromise;
		await waitForDocumentReady(cdp, runOptions.timeoutMs);
		await waitForNetworkIdle(requestIds, requestUrls, runOptions.timeoutMs, runOptions.settleMs);
		await settlePageAssets(cdp, runOptions.timeoutMs);
		await forceTheme(cdp, theme);

		let interaction = null;
		if (route.name === runOptions.englishRoute && runOptions.englishAnswer) {
			interaction = await interactWithEnglishPractice(cdp, runOptions);
			await waitForDocumentReady(cdp, runOptions.timeoutMs);
			await waitForNetworkIdle(requestIds, requestUrls, runOptions.timeoutMs, runOptions.settleMs);
			await forceTheme(cdp, theme);
		} else if (
			/^\/recall\/[^/]+\/(quick|flashcards|multiple-choice|true-or-false|reverse)$/.test(
				route.pathname
			)
		) {
			interaction = await interactWithRecallActivity(cdp, runOptions, route);
			await waitForDocumentReady(cdp, runOptions.timeoutMs);
			await waitForNetworkIdle(requestIds, requestUrls, runOptions.timeoutMs, runOptions.settleMs);
			await forceTheme(cdp, theme);
		}

		const dom = await collectDomSummary(cdp);
		const layout = await collectLayoutEvidence(cdp);
		const activeTheme = dom.theme;
		const signedIn =
			dom.signedIn ||
			interactionProvesSignedIn(interaction) ||
			usesImmersiveChallengeShell(route.pathname);
		const errors = buildErrors({
			documentResponse,
			runtimeEvents,
			logEntries,
			pageExceptions,
			failedRequests,
			errorResponses,
			layout,
			activeTheme,
			expectedTheme: theme,
			signedIn,
			requireSignedIn: runOptions.requireSignedIn
		});

		let screenshot = null;
		if (runOptions.screenshots) {
			const filename = `${safeFilename(route.name)}--${viewportName}--${theme}.jpg`;
			const screenshotPath = path.join(screenshotDir, filename);
			await captureScreenshot(cdp, screenshotPath, runOptions.screenshot);
			screenshot = path.relative(outputDir, screenshotPath);
		}

		return {
			status: errors.length === 0 ? 'passed' : 'failed',
			name: `${viewportName}/${theme}/${route.name}`,
			route,
			requestedUrl: safeUrl(requestedUrl),
			finalUrl: safeUrl(dom.url),
			httpStatus: responseStatus(documentResponse),
			durationMs: Date.now() - started,
			viewport: { name: viewportName, ...viewport },
			theme: { requested: theme, active: activeTheme },
			dom,
			layout,
			interaction,
			errors,
			console: runtimeEvents.filter((item) => ['error', 'warning', 'warn'].includes(item.type)),
			pageExceptions,
			logEntries: logEntries.filter((item) => ['error', 'warning'].includes(item.level)),
			failedRequests,
			errorResponses,
			screenshot
		};
	} catch (error) {
		const message = sanitizeText(
			error instanceof Error ? error.stack || error.message : String(error)
		);
		return {
			status: 'failed',
			name: `${viewportName}/${theme}/${route.name}`,
			route,
			requestedUrl: safeUrl(new URL(route.pathname, `${runOptions.baseUrl}/`).toString()),
			finalUrl: null,
			httpStatus: responseStatus(documentResponse),
			durationMs: Date.now() - started,
			viewport: { name: viewportName, ...viewport },
			theme: { requested: theme, active: null },
			dom: null,
			layout: emptyLayout(),
			interaction: null,
			errors: [{ kind: 'harness', message }],
			console: runtimeEvents,
			pageExceptions,
			logEntries,
			failedRequests,
			errorResponses,
			screenshot: null
		};
	} finally {
		cdp.close();
		await chrome.closeTarget(target.id);
	}
}

/** @param {any} interaction */
function interactionProvesSignedIn(interaction) {
	return Boolean(
		interaction &&
		typeof interaction === 'object' &&
		interaction.start?.status === 'already-started'
	);
}

/** Challenge play deliberately removes the account control with the rest of the global shell. */
/** @param {string} pathname */
function usesImmersiveChallengeShell(pathname) {
	const path = new URL(pathname, 'http://navigation.local').pathname;
	return /^\/challenges\/[^/]+\/[^/]+\/?$/.test(path);
}

/** @param {CdpClient} cdp @param {RunOptions} runOptions @param {Route} route */
async function interactWithRecallActivity(cdp, runOptions, route) {
	const activity = route.pathname.split('/').at(-1);
	const start = await evaluate(cdp, () => {
		if (document.querySelector('.card-stage .stack-card.active')) {
			return { status: 'already-started', href: location.href };
		}
		const link = document.querySelector('.recall-quick-start > a');
		if (!(link instanceof HTMLAnchorElement)) {
			return {
				status: 'not-found',
				heading: document.querySelector('.recall-quick-start h2')?.textContent?.trim() ?? null
			};
		}
		link.click();
		return { status: 'clicked', href: link.href };
	});
	if (!['clicked', 'already-started'].includes(start.status)) {
		throw new Error(
			`Recall ${activity} quick start was unavailable (${start.heading ?? start.status}).`
		);
	}

	await waitUntil(
		async () =>
			evaluate(cdp, () => Boolean(document.querySelector('.card-stage .stack-card.active'))),
		runOptions.timeoutMs,
		100
	);

	if (activity === 'flashcards') {
		const reveal = await evaluate(cdp, () => {
			const button = document.querySelector('button.card-reveal-hitbox');
			if (!(button instanceof HTMLButtonElement)) return { status: 'not-found' };
			button.click();
			return { status: 'clicked' };
		});
		if (reveal.status !== 'clicked') {
			throw new Error('Flashcard interaction could not reveal the first answer.');
		}
		await waitUntil(
			async () =>
				evaluate(cdp, () =>
					Boolean(document.querySelector('.card-stage .stack-card.active.revealed'))
				),
			runOptions.timeoutMs,
			50
		);

		const drag = await evaluate(cdp, () => {
			const card = document.querySelector('.card-stage .stack-card.active');
			const prompt = card?.querySelector('[id^="recall-prompt-"]');
			if (!(card instanceof HTMLElement)) return { status: 'not-found' };
			const idBefore = prompt?.id ?? null;
			const rect = card.getBoundingClientRect();
			const pointerId = 71;
			const x = rect.left + rect.width / 2;
			const y = rect.top + rect.height / 2;
			for (const event of [
				new PointerEvent('pointerdown', {
					bubbles: true,
					pointerId,
					pointerType: 'touch',
					clientX: x,
					clientY: y
				}),
				new PointerEvent('pointermove', {
					bubbles: true,
					cancelable: true,
					pointerId,
					pointerType: 'touch',
					clientX: x + 42,
					clientY: y + 6
				}),
				new PointerEvent('pointerup', {
					bubbles: true,
					pointerId,
					pointerType: 'touch',
					clientX: x + 42,
					clientY: y + 6
				})
			]) {
				card.dispatchEvent(event);
			}
			return {
				status: 'dragged-below-review-threshold',
				idBefore,
				revealed: card.classList.contains('revealed')
			};
		});
		await delay(300);
		const after = await evaluate(cdp, () => {
			const card = document.querySelector('.card-stage .stack-card.active');
			return {
				idAfter: card?.querySelector('[id^="recall-prompt-"]')?.id ?? null,
				revealed: card?.classList.contains('revealed') ?? false,
				nextButtonVisible: Boolean(document.querySelector('.session-actions .session-next'))
			};
		});
		if (drag.idBefore !== after.idAfter || !after.revealed || !after.nextButtonVisible) {
			throw new Error('Flashcard drag changed or lost the active revealed card before review.');
		}
		return { activity, start, reveal, drag, after, reviewWritten: false };
	}

	const choice = await evaluate(cdp, () => {
		const button = document.querySelector('.card-stage .choice-grid button');
		if (!(button instanceof HTMLButtonElement)) return { status: 'not-found' };
		const label = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
		button.click();
		return { status: 'clicked', label };
	});
	if (choice.status !== 'clicked') {
		throw new Error(`Recall ${activity} interaction could not choose the first answer.`);
	}
	await waitUntil(
		async () =>
			evaluate(cdp, () =>
				Boolean(
					document.querySelector(
						'.card-stage .stack-card.active.revealed [aria-label="Answer feedback"]'
					)
				)
			),
		runOptions.timeoutMs,
		50
	);
	const result = await evaluate(cdp, () => ({
		status:
			document.querySelector('.mcq-result-status h1')?.textContent?.replace(/\s+/g, ' ').trim() ??
			null,
		answer:
			document
				.querySelector('[aria-label="Answer feedback"]')
				?.textContent?.replace(/\s+/g, ' ')
				.trim()
				.slice(0, 240) ?? null,
		nextButtonVisible: Boolean(document.querySelector('.session-actions .session-next'))
	}));
	if (!result.status || !result.answer || !result.nextButtonVisible) {
		throw new Error(`Recall ${activity} did not render complete answer feedback.`);
	}
	return { activity, start, choice, result, reviewWritten: false };
}

/** @param {CdpClient} cdp @param {RunOptions} runOptions */
async function interactWithEnglishPractice(cdp, runOptions) {
	const answerText = runOptions.englishAnswer;
	if (!answerText) throw new Error('English interaction requires a non-empty answer.');
	const fill = await evaluate(
		cdp,
		(answer) => {
			const workspace = document.querySelector('[aria-label="Step-by-step answer practice"]');
			const editor = workspace?.querySelector(
				'textarea, [contenteditable="true"], input[type="text"]'
			);
			if (!(editor instanceof HTMLElement)) return { status: 'not-found', editor: null };
			if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
				const prototype =
					editor instanceof HTMLTextAreaElement
						? HTMLTextAreaElement.prototype
						: HTMLInputElement.prototype;
				const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
				setter?.call(editor, answer);
				editor.dispatchEvent(
					new InputEvent('input', { bubbles: true, inputType: 'insertText', data: answer })
				);
				editor.dispatchEvent(new Event('change', { bubbles: true }));
			} else {
				editor.textContent = answer;
				editor.dispatchEvent(
					new InputEvent('input', { bubbles: true, inputType: 'insertText', data: answer })
				);
			}
			editor.focus();
			return {
				status: 'filled',
				editor: editor.tagName.toLowerCase(),
				answerLength: answer.length
			};
		},
		answerText
	);

	if (fill.status !== 'filled') {
		throw new Error('English interaction could not find the active response editor.');
	}
	if (!runOptions.englishCheck) return { ...fill, checked: false };

	const click = await evaluate(cdp, () => {
		const buttons = [...document.querySelectorAll('button')];
		const button = buttons.find((item) =>
			/^(check step|check again)$/i.test(item.textContent?.trim() ?? '')
		);
		if (!button) return { status: 'not-found' };
		if (button.disabled) return { status: 'disabled', label: button.textContent?.trim() ?? '' };
		button.click();
		return { status: 'clicked', label: button.textContent?.trim() ?? '' };
	});
	if (click.status !== 'clicked') {
		throw new Error(`English interaction could not submit the step (${click.status}).`);
	}

	await waitUntil(
		async () =>
			evaluate(cdp, () => {
				const feedback = document.querySelector('[aria-label="Feedback"]');
				const busy = [...document.querySelectorAll('button')].some((button) =>
					/checking|reading|feedback/i.test(button.textContent ?? '')
				);
				return Boolean(feedback) && !busy;
			}),
		runOptions.timeoutMs,
		100
	);
	const feedback = await evaluate(cdp, () => {
		const panel = document.querySelector('[aria-label="Feedback"]');
		return {
			status: panel ? 'received' : 'missing',
			heading: panel?.querySelector('h3')?.textContent?.trim() ?? null,
			textSample: panel?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 320) ?? null
		};
	});
	return { ...fill, checked: true, click, feedback };
}

/** @param {CdpClient} cdp */
async function collectDomSummary(cdp) {
	return evaluate(cdp, () => {
		/** @param {Element | null | undefined} element */
		const text = (element) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
		/** @param {Element} element */
		const visible = (element) => {
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return (
				style.display !== 'none' &&
				style.visibility !== 'hidden' &&
				rect.width > 0 &&
				rect.height > 0
			);
		};
		const controls = [...document.querySelectorAll('a, button, input, textarea, select')].filter(
			visible
		);
		return {
			url: location.href,
			title: document.title,
			theme: document.documentElement.dataset.theme ?? null,
			language: document.documentElement.lang || null,
			h1: [...document.querySelectorAll('h1')].filter(visible).map(text).slice(0, 8),
			h2: [...document.querySelectorAll('h2')].filter(visible).map(text).slice(0, 16),
			landmarks: {
				main: document.querySelectorAll('main').length,
				nav: document.querySelectorAll('nav').length,
				aside: document.querySelectorAll('aside').length
			},
			controls: {
				links: controls.filter((item) => item.tagName === 'A').length,
				buttons: controls.filter((item) => item.tagName === 'BUTTON').length,
				inputs: controls.filter((item) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(item.tagName))
					.length,
				labels: controls
					.map((item) => item.getAttribute('aria-label') || text(item))
					.filter(Boolean)
					.slice(0, 30)
			},
			activeStep:
				document.querySelector('[aria-current="step"]')?.textContent?.replace(/\s+/g, ' ').trim() ??
				null,
			feedbackVisible: Boolean(document.querySelector('[aria-label="Feedback"]')),
			signedIn: Boolean(document.querySelector('[aria-label="Account menu"]')),
			bodyTextLength: document.body?.innerText.length ?? 0
		};
	});
}

/** @param {CdpClient} cdp @returns {Promise<LayoutEvidence>} */
async function collectLayoutEvidence(cdp) {
	return evaluate(cdp, () => {
		const tolerance = 2;
		const root = document.documentElement;
		const body = document.body;
		/** @param {Element} element */
		const selector = (element) => {
			if (element.id) return `${element.tagName.toLowerCase()}#${CSS.escape(element.id)}`;
			const classes = [...element.classList]
				.slice(0, 3)
				.map((item) => `.${CSS.escape(item)}`)
				.join('');
			return `${element.tagName.toLowerCase()}${classes}`;
		};
		/** @param {Element} element @param {string} kind @returns {LayoutFinding} */
		const details = (element, kind) => {
			const rect = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				kind,
				selector: selector(element),
				left: Math.round(rect.left * 10) / 10,
				right: Math.round(rect.right * 10) / 10,
				width: Math.round(rect.width * 10) / 10,
				clientWidth: element.clientWidth,
				scrollWidth: element.scrollWidth,
				overflowX: style.overflowX,
				textSample: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
			};
		};
		const elements = [...document.body.querySelectorAll('*')];
		/** @param {Element} element */
		const insideHorizontalOverflowRegion = (element) => {
			let ancestor = element.parentElement;
			while (ancestor && ancestor !== document.body) {
				const style = getComputedStyle(ancestor);
				if (
					['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX) &&
					ancestor.scrollWidth > ancestor.clientWidth + tolerance
				) {
					return true;
				}
				ancestor = ancestor.parentElement;
			}
			return false;
		};
		const rendered = elements.filter((element) => {
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return (
				style.display !== 'none' &&
				style.visibility !== 'hidden' &&
				Number(style.opacity || 1) > 0 &&
				rect.width > 0 &&
				rect.height > 0 &&
				!element.closest('[aria-hidden="true"]')
			);
		});
		const viewportProtrusions = rendered
			.filter((element) => {
				const rect = element.getBoundingClientRect();
				return (
					(rect.left < -tolerance || rect.right > innerWidth + tolerance) &&
					!insideHorizontalOverflowRegion(element)
				);
			})
			.map((element) => details(element, 'viewport-protrusion'))
			.slice(0, 50);
		const clippedContent = rendered
			.filter((element) => {
				const style = getComputedStyle(element);
				return (
					!element.matches('.theme-aware-challenge-art') &&
					element.scrollWidth > element.clientWidth + tolerance &&
					['hidden', 'clip'].includes(style.overflowX) &&
					((element.textContent ?? '').trim().length > 0 ||
						Boolean(element.querySelector('img, svg, input, textarea, button, a')))
				);
			})
			.map((element) => details(element, 'clipped-content'))
			.slice(0, 50);
		const horizontalScrollRegions = rendered
			.filter((element) => {
				const style = getComputedStyle(element);
				return (
					element.scrollWidth > element.clientWidth + tolerance &&
					['auto', 'scroll'].includes(style.overflowX)
				);
			})
			.map((element) => details(element, 'horizontal-scroll-region'))
			.slice(0, 30);
		return {
			viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
			document: {
				clientWidth: root.clientWidth,
				scrollWidth: Math.max(root.scrollWidth, body?.scrollWidth ?? 0),
				clientHeight: root.clientHeight,
				scrollHeight: Math.max(root.scrollHeight, body?.scrollHeight ?? 0)
			},
			documentHorizontalOverflow:
				Math.max(root.scrollWidth, body?.scrollWidth ?? 0) > root.clientWidth + tolerance,
			viewportProtrusions,
			clippedContent,
			horizontalScrollRegions
		};
	});
}

/**
 * @param {{documentResponse: CdpResponseRecord | null, runtimeEvents: any[], logEntries: any[], pageExceptions: any[], failedRequests: any[], errorResponses: CdpResponseRecord[], layout: LayoutEvidence, activeTheme: string | null, expectedTheme: Theme, signedIn: boolean, requireSignedIn: boolean}} input
 */
function buildErrors({
	documentResponse,
	runtimeEvents,
	logEntries,
	pageExceptions,
	failedRequests,
	errorResponses,
	layout,
	activeTheme,
	expectedTheme,
	signedIn,
	requireSignedIn
}) {
	/** @type {any[]} */
	const errors = [];
	const status = responseStatus(documentResponse);
	if (status === null || status < 200 || status >= 400) {
		errors.push({
			kind: 'document-response',
			message:
				status !== null ? `Document returned HTTP ${status}.` : 'No document response was observed.'
		});
	}
	for (const event of runtimeEvents.filter((item) => item.type === 'error')) {
		errors.push({ kind: 'console', message: event.text });
	}
	for (const entry of logEntries.filter((item) => item.level === 'error')) {
		errors.push({ kind: 'browser-log', message: entry.text, url: entry.url });
	}
	for (const exception of pageExceptions) {
		errors.push({ kind: 'page-exception', message: exception.text, url: exception.url });
	}
	for (const request of failedRequests) {
		errors.push({ kind: 'network-failure', message: request.errorText, url: request.url });
	}
	for (const response of errorResponses) {
		errors.push({
			kind: 'http-response',
			message: `Same-origin request returned HTTP ${response.status}.`,
			url: response.url
		});
	}
	if (layout.documentHorizontalOverflow) {
		errors.push({ kind: 'document-overflow', message: 'The document is wider than the viewport.' });
	}
	if (activeTheme !== expectedTheme) {
		errors.push({
			kind: 'theme',
			message: `Expected ${expectedTheme} theme but the active theme was ${activeTheme ?? 'unset'}.`
		});
	}
	if (requireSignedIn && !signedIn) {
		errors.push({
			kind: 'authentication',
			message: 'The signed-in account control was not present.'
		});
	}
	return deduplicate(errors);
}

/** @param {CdpClient} cdp @param {string} outputPath @param {ScreenshotMode} mode */
async function captureScreenshot(cdp, outputPath, mode) {
	/** @type {Record<string, any>} */
	let params = { format: 'jpeg', quality: 86, fromSurface: true, captureBeyondViewport: false };
	if (mode === 'full') {
		const metrics = await cdp.send('Page.getLayoutMetrics');
		const size = metrics.cssContentSize ?? metrics.contentSize;
		params = {
			...params,
			captureBeyondViewport: true,
			clip: {
				x: 0,
				y: 0,
				width: Math.max(1, Math.ceil(size.width)),
				height: Math.max(1, Math.min(20_000, Math.ceil(size.height))),
				scale: 1
			}
		};
	}
	const result = await cdp.send('Page.captureScreenshot', params);
	await writeFile(outputPath, Buffer.from(result.data, 'base64'));
}

/** @param {CdpClient} cdp @param {number} timeoutMs */
async function settlePageAssets(cdp, timeoutMs) {
	await evaluate(
		cdp,
		async (timeout) => {
			await Promise.race([
				document.fonts?.ready ?? Promise.resolve(),
				new Promise((resolve) => setTimeout(resolve, timeout))
			]);
			const images = [...document.images].filter((image) => {
				const rect = image.getBoundingClientRect();
				return rect.width > 0 && rect.height > 0;
			});
			await Promise.race([
				Promise.all(
					images.map((image) =>
						image.complete ? Promise.resolve() : image.decode?.().catch(() => undefined)
					)
				),
				new Promise((resolve) => setTimeout(resolve, timeout))
			]);
		},
		Math.min(timeoutMs, 5000)
	);
}

/** @param {CdpClient} cdp @param {Theme} theme */
async function forceTheme(cdp, theme) {
	await evaluate(
		cdp,
		(mode) => {
			const root = document.documentElement;
			root.dataset.theme = mode;
			root.classList.toggle('dark', mode === 'dark');
			root.style.colorScheme = mode;
		},
		theme
	);
	await delay(50);
}

/** @param {CdpClient} cdp @param {number} timeoutMs */
async function waitForDocumentReady(cdp, timeoutMs) {
	await waitUntil(
		async () =>
			evaluate(
				cdp,
				() =>
					document.readyState === 'complete' &&
					!document.querySelector('[aria-busy="true"], .qc-step-hydrating')
			),
		timeoutMs,
		100
	);
}

/** @param {Set<string>} requestIds @param {Map<string, string>} requestUrls @param {number} timeoutMs @param {number} settleMs */
async function waitForNetworkIdle(requestIds, requestUrls, timeoutMs, settleMs) {
	const started = Date.now();
	let idleSince = null;
	while (Date.now() - started < timeoutMs) {
		if (requestIds.size === 0) {
			idleSince ??= Date.now();
			if (Date.now() - idleSince >= settleMs) return;
		} else {
			idleSince = null;
		}
		await delay(50);
	}
	const activeUrls = [...requestIds]
		.map((requestId) => safeUrl(requestUrls.get(requestId) ?? ''))
		.filter(Boolean)
		.slice(0, 8);
	throw new Error(
		`Timed out waiting for network idle (${requestIds.size} request(s) active): ${activeUrls.join(', ')}`
	);
}

/**
 * @template T
 * @template [A=undefined]
 * @param {CdpClient} cdp
 * @param {(argument: A) => T | Promise<T>} fn
 * @param {A} [argument]
 * @returns {Promise<Awaited<T>>}
 */
async function evaluate(cdp, fn, argument) {
	const expression = `(${fn.toString()})(${argument === undefined ? '' : JSON.stringify(argument)})`;
	const result = await cdp.send('Runtime.evaluate', {
		expression,
		returnByValue: true,
		awaitPromise: true,
		userGesture: true
	});
	if (result.exceptionDetails) {
		throw new Error(
			result.exceptionDetails.exception?.description ??
				result.exceptionDetails.text ??
				'Page evaluation failed.'
		);
	}
	return /** @type {Awaited<T>} */ (result.result?.value);
}

/**
 * @param {() => boolean | Promise<boolean>} predicate
 * @param {number} timeoutMs
 * @param {number} intervalMs
 */
async function waitUntil(predicate, timeoutMs, intervalMs) {
	const started = Date.now();
	let lastError = null;
	while (Date.now() - started < timeoutMs) {
		try {
			if (await predicate()) return;
		} catch (error) {
			lastError = error;
		}
		await delay(intervalMs);
	}
	throw lastError ?? new Error(`Condition did not become true within ${timeoutMs}ms.`);
}

/** @param {RunOptions} runOptions @returns {Promise<ChromeController>} */
async function launchChrome(runOptions) {
	const profileDir = await mkdtemp(path.join(os.tmpdir(), 'qc-release-browser-'));
	const args = [
		'--headless=new',
		'--remote-debugging-address=127.0.0.1',
		'--remote-debugging-port=0',
		`--user-data-dir=${profileDir}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--disable-background-networking',
		'--disable-component-update',
		'--disable-default-apps',
		'--disable-extensions',
		'--disable-sync',
		'--metrics-recording-only',
		'--password-store=basic',
		'--use-mock-keychain',
		'about:blank'
	];
	const child = spawn(runOptions.chromeBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
	let stderr = '';
	/** @type {ChromeDebugEndpoint | null} */
	let endpoint = null;
	const endpointPromise = new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error(`Chrome did not expose DevTools within ${runOptions.timeoutMs}ms.`)),
			runOptions.timeoutMs
		);
		child.once('error', (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.once('exit', (code, signal) => {
			if (endpoint) return;
			clearTimeout(timeout);
			reject(
				new Error(
					`Chrome exited before DevTools was ready (${code ?? signal ?? 'unknown'}): ${sanitizeText(stderr.slice(-1000))}`
				)
			);
		});
		child.stderr.on('data', (chunk) => {
			stderr = `${stderr}${chunk}`.slice(-10_000);
			const match = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/[^\s]+)/);
			if (!match || endpoint) return;
			endpoint = { websocket: match[1], port: Number(match[2]) };
			clearTimeout(timeout);
			resolve(endpoint);
		});
	});
	/** @type {ChromeDebugEndpoint} */
	let debug;
	/** @type {any} */
	let version;
	try {
		debug = await endpointPromise;
		const versionResponse = await fetch(`http://127.0.0.1:${debug.port}/json/version`);
		version = /** @type {any} */ (await versionResponse.json());
	} catch (error) {
		if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
		await rm(profileDir, { recursive: true, force: true });
		throw error;
	}
	return {
		binary: runOptions.chromeBin,
		version: version.Browser ?? 'unknown',
		async newTarget() {
			const response = await fetch(`http://127.0.0.1:${debug.port}/json/new?about%3Ablank`, {
				method: 'PUT'
			});
			if (!response.ok) throw new Error(`Could not create Chrome target: HTTP ${response.status}`);
			return /** @type {Promise<ChromeTarget>} */ (response.json());
		},
		/** @param {string} id */
		async closeTarget(id) {
			await fetch(`http://127.0.0.1:${debug.port}/json/close/${encodeURIComponent(id)}`).catch(
				() => undefined
			);
		},
		async close() {
			if (child.exitCode === null && child.signalCode === null) {
				const exited = new Promise((resolve) => child.once('exit', () => resolve(true)));
				child.kill('SIGTERM');
				const graceful = await Promise.race([exited, delay(3000).then(() => false)]);
				if (!graceful && child.exitCode === null && child.signalCode === null) {
					child.kill('SIGKILL');
					await Promise.race([exited, delay(1000)]);
				}
			}
			await rm(profileDir, { recursive: true, force: true });
		}
	};
}

class CdpClient {
	/** @param {WebSocket} websocket @param {number} timeoutMs */
	constructor(websocket, timeoutMs) {
		this.websocket = websocket;
		this.timeoutMs = timeoutMs;
		this.nextId = 1;
		/** @type {Map<number, {resolve: (value: any) => void, reject: (reason?: any) => void, timeout: ReturnType<typeof setTimeout>, method: string}>} */
		this.pending = new Map();
		/** @type {Map<string, Set<(params: any) => void>>} */
		this.listeners = new Map();
	}

	/** @param {string} url @param {number} timeoutMs */
	static async connect(url, timeoutMs) {
		const websocket = new WebSocket(url);
		/** @type {Promise<void>} */
		const opened = new Promise((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error('Timed out opening DevTools websocket.')),
				timeoutMs
			);
			websocket.addEventListener('open', () => {
				clearTimeout(timeout);
				resolve();
			});
			websocket.addEventListener('error', () => {
				clearTimeout(timeout);
				reject(new Error('Could not open DevTools websocket.'));
			});
		});
		await opened;
		const client = new CdpClient(websocket, timeoutMs);
		websocket.addEventListener('message', (event) => client.handleMessage(event.data));
		websocket.addEventListener('close', () => client.handleClose());
		return client;
	}

	/** @param {string} method @param {(params: any) => void} listener */
	on(method, listener) {
		const listeners = this.listeners.get(method) ?? new Set();
		listeners.add(listener);
		this.listeners.set(method, listeners);
		return () => listeners.delete(listener);
	}

	/** @param {string} method @param {number} [timeoutMs] @returns {Promise<any>} */
	waitFor(method, timeoutMs = this.timeoutMs) {
		return new Promise((resolve, reject) => {
			const cleanup = this.on(method, (params) => {
				clearTimeout(timeout);
				cleanup();
				resolve(params);
			});
			const timeout = setTimeout(() => {
				cleanup();
				reject(new Error(`Timed out waiting for CDP event ${method}.`));
			}, timeoutMs);
		});
	}

	/** @param {string} method @param {Record<string, any>} [params] @returns {Promise<any>} */
	send(method, params = {}) {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Timed out waiting for CDP method ${method}.`));
			}, this.timeoutMs);
			this.pending.set(id, { resolve, reject, timeout, method });
			this.websocket.send(JSON.stringify({ id, method, params }));
		});
	}

	/** @param {any} raw */
	handleMessage(raw) {
		const message = JSON.parse(String(raw));
		if (message.id) {
			const pending = this.pending.get(message.id);
			if (!pending) return;
			this.pending.delete(message.id);
			clearTimeout(pending.timeout);
			if (message.error) {
				pending.reject(new Error(`${pending.method}: ${message.error.message}`));
			} else {
				pending.resolve(message.result);
			}
			return;
		}
		for (const listener of this.listeners.get(message.method) ?? []) {
			try {
				listener(message.params ?? {});
			} catch {
				// Evidence listeners must not break the browser run.
			}
		}
	}

	handleClose() {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timeout);
			pending.reject(new Error(`DevTools websocket closed during ${pending.method}.`));
		}
		this.pending.clear();
	}

	close() {
		if (this.websocket.readyState === WebSocket.OPEN) this.websocket.close();
	}
}

/** @param {string[]} argv @returns {RunOptions} */
function parseArgs(argv) {
	const result = /** @type {RunOptions} */ ({
		baseUrl: 'http://127.0.0.1:5173',
		output: 'docs/release-evidence/browser-validation',
		routes: [],
		viewports: ['mobile', 'ipad', 'laptop'],
		themes: ['light', 'dark'],
		screenshot: 'viewport',
		screenshots: true,
		chromeBin: '/usr/bin/google-chrome',
		settleMs: 750,
		timeoutMs: 20_000,
		englishRoute: 'english-practice',
		englishAnswer: null,
		englishCheck: false,
		requireSignedIn: true,
		failOnIssues: false,
		help: false
	});
	for (const arg of argv) {
		if (arg === '--help') result.help = true;
		else if (arg === '--no-screenshots') result.screenshots = false;
		else if (arg === '--english-check') result.englishCheck = true;
		else if (arg === '--allow-anonymous') result.requireSignedIn = false;
		else if (arg === '--fail-on-issues') result.failOnIssues = true;
		else if (arg.startsWith('--base-url=')) result.baseUrl = argValue(arg).replace(/\/+$/, '');
		else if (arg.startsWith('--output=')) result.output = argValue(arg);
		else if (arg.startsWith('--chrome-bin=')) result.chromeBin = argValue(arg);
		else if (arg.startsWith('--english-route=')) result.englishRoute = argValue(arg);
		else if (arg.startsWith('--english-answer=')) result.englishAnswer = argValue(arg);
		else if (arg.startsWith('--settle-ms=')) result.settleMs = positiveInteger(argValue(arg), arg);
		else if (arg.startsWith('--timeout-ms='))
			result.timeoutMs = positiveInteger(argValue(arg), arg);
		else if (arg.startsWith('--screenshot='))
			result.screenshot = /** @type {ScreenshotMode} */ (argValue(arg));
		else if (arg.startsWith('--theme='))
			result.themes = /** @type {Theme[]} */ (commaList(argValue(arg)));
		else if (arg.startsWith('--viewport='))
			result.viewports = /** @type {ViewportName[]} */ (commaList(argValue(arg)));
		else if (arg.startsWith('--route=')) result.routes.push(parseRoute(argValue(arg)));
		else throw new Error(`Unknown argument: ${arg}\n\n${usage}`);
	}
	if (result.routes.length === 0) result.routes = DEFAULT_ROUTES;
	if (!['viewport', 'full'].includes(result.screenshot)) {
		throw new Error('--screenshot must be viewport or full.');
	}
	for (const viewport of result.viewports) {
		if (!VIEWPORTS[viewport]) throw new Error(`Unknown viewport: ${viewport}`);
	}
	for (const theme of result.themes) {
		if (!['light', 'dark'].includes(theme)) throw new Error(`Unknown theme: ${theme}`);
	}
	if (new Set(result.routes.map((route) => route.name)).size !== result.routes.length) {
		throw new Error('Route names must be unique.');
	}
	if (result.englishCheck && !result.englishAnswer) {
		throw new Error('--english-check requires --english-answer.');
	}
	new URL(result.baseUrl);
	return result;
}

/** @param {string} value @returns {Route} */
function parseRoute(value) {
	const separator = value.indexOf(':');
	if (separator < 1) throw new Error(`Invalid --route value: ${value}`);
	const name = value.slice(0, separator).trim();
	const pathname = value.slice(separator + 1).trim();
	if (!/^[a-z0-9][a-z0-9-]*$/i.test(name) || !pathname.startsWith('/')) {
		throw new Error(`Invalid --route value: ${value}`);
	}
	return { name, pathname };
}

/** @param {string} arg */
function argValue(arg) {
	return arg.slice(arg.indexOf('=') + 1);
}

/** @param {string} value @returns {string[]} */
function commaList(value) {
	const values = value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
	if (values.length === 0) throw new Error('Expected a comma-separated value.');
	return [...new Set(values)];
}

/** @param {string} value @param {string} arg */
function positiveInteger(value, arg) {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1)
		throw new Error(`Expected a positive integer: ${arg}`);
	return parsed;
}

/** @param {string} baseUrl */
async function assertReachable(baseUrl) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);
	try {
		const response = await fetch(`${baseUrl}/`, { signal: controller.signal, redirect: 'manual' });
		if (response.status < 200 || response.status >= 500) {
			throw new Error(`Base URL returned HTTP ${response.status}: ${safeUrl(baseUrl)}`);
		}
	} catch (error) {
		throw new Error(
			`Base URL is not reachable (${safeUrl(baseUrl)}): ${error instanceof Error ? error.message : error}`,
			{ cause: error }
		);
	} finally {
		clearTimeout(timeout);
	}
}

/** @param {string} type @param {string} [url] */
function tracksForIdle(type, url = '') {
	try {
		if (new URL(url).pathname === '/api/home-snapshot/refresh') return false;
	} catch {
		// Non-URL requests fall through to the ordinary resource-type check.
	}
	return (
		!url.startsWith('data:') &&
		['Document', 'Stylesheet', 'Image', 'Media', 'Font', 'Script', 'XHR', 'Fetch'].includes(type)
	);
}

/** @param {string} url @param {string} baseUrl */
function sameOrigin(url, baseUrl) {
	try {
		return new URL(url).origin === new URL(baseUrl).origin;
	} catch {
		return false;
	}
}

/** @param {string} value */
function safeUrl(value) {
	if (!value) return '';
	try {
		const url = new URL(value);
		url.username = '';
		url.password = '';
		for (const key of [...url.searchParams.keys()]) {
			if (/token|secret|key|auth|code|password/i.test(key)) url.searchParams.set(key, '<redacted>');
		}
		return url.toString();
	} catch {
		return sanitizeText(value);
	}
}

/** @param {CdpResponseRecord | null} response */
function responseStatus(response) {
	return response?.status ?? null;
}

/** @param {unknown} value */
function sanitizeText(value) {
	return String(value ?? '')
		.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer <redacted>')
		.replace(/([?&](?:token|secret|key|auth|code|password)=)[^&#\s]+/gi, '$1<redacted>')
		.replace(
			/\b(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ACCESS_TOKEN|GEMINI_API_KEY)=[^\s]+/gi,
			'$1=<redacted>'
		)
		.slice(0, 4000);
}

/** @param {string} value */
function safeFilename(value) {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'route'
	);
}

/** @template T @param {T[]} items @returns {T[]} */
function deduplicate(items) {
	const seen = new Set();
	return items.filter((item) => {
		const key = JSON.stringify(item);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** @returns {LayoutEvidence} */
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

/** @param {any} report */
function markdownSummary(report) {
	const rows = /** @type {ValidationCase[]} */ (report.cases)
		.map(
			(item) =>
				`| ${item.viewport.name} | ${item.theme.requested} | ${item.route.name} | ${item.status} | ${item.httpStatus ?? '—'} | ${item.errors.length} | ${item.layout.documentHorizontalOverflow ? 'yes' : 'no'} | ${item.layout.viewportProtrusions.length} | ${item.screenshot ? `[view](${item.screenshot})` : '—'} |`
		)
		.join('\n');
	return `# Real-Chrome release validation

- Status: **${report.status}**
- Run: ${report.startedAt} to ${report.finishedAt}
- Origin: \`${report.baseUrl}\`
- Chrome: \`${report.chrome?.version ?? 'unavailable'}\`
- Cases: ${report.summary.passedCaseCount}/${report.summary.caseCount} passed
- Page errors: ${report.summary.pageErrorCount}
- Document overflow cases: ${report.summary.documentOverflowCaseCount}
- Intentional horizontal-scroll regions: ${report.summary.horizontalScrollRegionCount}

| Viewport | Theme | Route | Status | HTTP | Errors | Document overflow | Protrusions | Screenshot |
| --- | --- | --- | --- | ---: | ---: | --- | ---: | --- |
${rows}

The machine-readable DOM summaries, console/page errors, response failures, clipping candidates,
and horizontal-scroll regions are in [report.json](report.json). Candidate lists are evidence for
manual review; only document-level horizontal overflow is an automatic failure.
`;
}

/** @param {number} ms @returns {Promise<void>} */
function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export {
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
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
