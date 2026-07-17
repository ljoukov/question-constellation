/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- This is a deliberately small CDP transport for operator-only Node scripts.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function launchChrome({ chromeBin, timeoutMs }) {
	const profileDir = await mkdtemp(path.join(os.tmpdir(), 'qc-english-validation-'));
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
	const child = spawn(chromeBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
	let stderr = '';
	let endpoint = null;
	const endpointPromise = new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error(`Chrome did not expose DevTools within ${timeoutMs}ms.`)),
			timeoutMs
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

	let debug;
	let version;
	try {
		debug = await endpointPromise;
		const response = await fetch(`http://127.0.0.1:${debug.port}/json/version`);
		if (!response.ok) throw new Error(`Could not inspect Chrome: HTTP ${response.status}.`);
		version = await response.json();
	} catch (error) {
		if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
		await rm(profileDir, { recursive: true, force: true });
		throw error;
	}

	return {
		binary: chromeBin,
		version: version.Browser ?? 'unknown',
		async newTarget() {
			const response = await fetch(`http://127.0.0.1:${debug.port}/json/new?about%3Ablank`, {
				method: 'PUT'
			});
			if (!response.ok) throw new Error(`Could not create Chrome target: HTTP ${response.status}.`);
			return response.json();
		},
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

export class CdpClient {
	constructor(websocket, timeoutMs) {
		this.websocket = websocket;
		this.timeoutMs = timeoutMs;
		this.nextId = 1;
		this.pending = new Map();
		this.listeners = new Map();
	}

	static async connect(url, timeoutMs) {
		const websocket = new WebSocket(url);
		await new Promise((resolve, reject) => {
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
		const client = new CdpClient(websocket, timeoutMs);
		websocket.addEventListener('message', (event) => client.handleMessage(event.data));
		websocket.addEventListener('close', () => client.handleClose());
		return client;
	}

	on(method, listener) {
		const listeners = this.listeners.get(method) ?? new Set();
		listeners.add(listener);
		this.listeners.set(method, listeners);
		return () => listeners.delete(listener);
	}

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
				// Evidence listeners must never break the browser session.
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

export async function captureScreenshot(cdp, outputPath, mode = 'full') {
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

export async function collectLayoutEvidence(cdp) {
	return evaluate(cdp, () => {
		const tolerance = 2;
		const root = document.documentElement;
		const body = document.body;
		const selector = (element) => {
			if (element.id) return `${element.tagName.toLowerCase()}#${CSS.escape(element.id)}`;
			const classes = [...element.classList]
				.slice(0, 3)
				.map((item) => `.${CSS.escape(item)}`)
				.join('');
			return `${element.tagName.toLowerCase()}${classes}`;
		};
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

export async function settlePageAssets(cdp, timeoutMs) {
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

export async function forceTheme(cdp, theme) {
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

export async function waitForDocumentReady(cdp, timeoutMs) {
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

export async function waitForNetworkIdle(requestIds, timeoutMs, settleMs) {
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
	throw new Error(`Timed out waiting for network idle (${requestIds.size} request(s) active).`);
}

export async function evaluate(cdp, fn, argument) {
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
	return result.result?.value;
}

export async function waitUntil(predicate, timeoutMs, intervalMs) {
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

export function safeUrl(value) {
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

export function sanitizeText(value) {
	return String(value ?? '')
		.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer <redacted>')
		.replace(/([?&](?:token|secret|key|auth|code|password)=)[^&#\s]+/gi, '$1<redacted>')
		.replace(
			/\b(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ACCESS_TOKEN|GEMINI_API_KEY)=[^\s]+/gi,
			'$1=<redacted>'
		)
		.slice(0, 4000);
}

export function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
