import type { AnalyticsBatchPayload, AnalyticsEventPayload } from './types';

const ENDPOINT = '/api/analytics/events';
const ANONYMOUS_KEY = 'qc-analytics-anonymous-id';
const SESSION_KEY = 'qc-analytics-session';
const SESSION_TIMEOUT_MS = 30 * 60 * 1_000;
const ANONYMOUS_COOKIE = 'qc_aid';
const SESSION_COOKIE = 'qc_sid';
const FLUSH_INTERVAL_MS = 3_000;
const SENSITIVE_FIELD_PATTERN =
	/(pass(word)?|secret|token|api.?key|auth|credit.?card|card.?number|cvv|cvc|security.?code|one.?time|otp)/i;

type StoredSession = { id: string; lastActivityAt: number };
type InputElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;

let anonymousId = '';
let sessionId = '';
let queue: AnalyticsEventPayload[] = [];
let sequence = 0;
let flushTimer: number | undefined;
let currentPageViewId = '';
let currentPageStartedAt = 0;
let visibleStartedAt = 0;
let visibleElapsedMs = 0;
let maximumScrollDepth = 0;
let currentPageLocation: ReturnType<typeof locationFields> | null = null;
let installed = false;
let teardown: (() => void) | null = null;
const inputTimers = new Map<InputElement, number>();
const inputValues = new WeakMap<InputElement, string>();

function id(): string {
	return crypto.randomUUID().replaceAll('-', '');
}

function storageGet(storage: Storage, key: string): string | null {
	try {
		return storage.getItem(key);
	} catch {
		return null;
	}
}

function storageSet(storage: Storage, key: string, value: string) {
	try {
		storage.setItem(key, value);
	} catch {
		// Analytics remains available in-memory when storage is unavailable.
	}
}

function identities() {
	anonymousId = storageGet(localStorage, ANONYMOUS_KEY) || id();
	storageSet(localStorage, ANONYMOUS_KEY, anonymousId);

	let stored: StoredSession | null = null;
	try {
		stored = JSON.parse(storageGet(sessionStorage, SESSION_KEY) || 'null') as StoredSession | null;
	} catch {
		stored = null;
	}
	const now = Date.now();
	sessionId = stored && now - stored.lastActivityAt < SESSION_TIMEOUT_MS ? stored.id : id();
	touchSession();
}

function touchSession() {
	storageSet(
		sessionStorage,
		SESSION_KEY,
		JSON.stringify({ id: sessionId, lastActivityAt: Date.now() })
	);
	document.cookie = `${ANONYMOUS_COOKIE}=${anonymousId}; Path=/; Max-Age=31536000; SameSite=Lax`;
	document.cookie = `${SESSION_COOKIE}=${sessionId}; Path=/; SameSite=Lax`;
}

function browserContext(): NonNullable<AnalyticsBatchPayload['context']> {
	const ua = navigator.userAgent;
	const connection = (
		navigator as Navigator & {
			connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
			deviceMemory?: number;
		}
	).connection;
	const browser =
		ua.match(/Edg\/([\d.]+)/)?.slice(0, 2) ||
		ua.match(/OPR\/([\d.]+)/)?.slice(0, 2) ||
		ua.match(/Chrome\/([\d.]+)/)?.slice(0, 2) ||
		ua.match(/Firefox\/([\d.]+)/)?.slice(0, 2) ||
		ua.match(/Version\/([\d.]+).*Safari/)?.slice(0, 2);
	let browserName = 'Unknown';
	if (browser) {
		if (ua.includes('Edg/')) browserName = 'Edge';
		else if (ua.includes('OPR/')) browserName = 'Opera';
		else if (ua.includes('Chrome/')) browserName = 'Chrome';
		else if (ua.includes('Firefox/')) browserName = 'Firefox';
		else if (ua.includes('Safari/')) browserName = 'Safari';
	}
	const operatingSystem = /Windows NT/.test(ua)
		? 'Windows'
		: /Android/.test(ua)
			? 'Android'
			: /iPhone|iPad|iPod/.test(ua)
				? 'iOS/iPadOS'
				: /Mac OS X/.test(ua)
					? 'macOS'
					: /Linux/.test(ua)
						? 'Linux'
						: 'Unknown';
	return {
		browserName,
		browserVersion: browser?.[1],
		operatingSystem,
		deviceType: /Mobi|Android|iPhone|iPod/.test(ua)
			? 'mobile'
			: /iPad|Tablet/.test(ua)
				? 'tablet'
				: 'desktop',
		viewportWidth: window.innerWidth,
		viewportHeight: window.innerHeight,
		screenWidth: window.screen.width,
		screenHeight: window.screen.height,
		connectionEffectiveType: connection?.effectiveType,
		connectionDownlinkMbps: connection?.downlink,
		connectionRttMs: connection?.rtt,
		connectionSaveData: connection?.saveData,
		deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
		hardwareConcurrency: navigator.hardwareConcurrency
	};
}

function locationFields() {
	return {
		url: window.location.href,
		path: window.location.pathname,
		query: window.location.search,
		title: document.title,
		referrer: document.referrer || undefined
	};
}

function enqueue(event: Omit<AnalyticsEventPayload, 'eventId' | 'timestamp' | 'sequence'>) {
	queue.push({
		...event,
		eventId: id(),
		timestamp: Date.now(),
		sequence: ++sequence,
		pageViewId: event.pageViewId ?? currentPageViewId,
		...(!event.url ? locationFields() : {})
	});
	touchSession();
	if (queue.length >= 20) void flush();
}

async function flush(useBeacon = false) {
	if (!queue.length) return;
	const events = queue.splice(0, 50);
	const payload: AnalyticsBatchPayload = {
		sessionId,
		anonymousId,
		sentAt: Date.now(),
		context: browserContext(),
		events
	};
	const body = JSON.stringify(payload);
	if (useBeacon && navigator.sendBeacon) {
		const accepted = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
		if (accepted) return;
	}
	try {
		const response = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
			keepalive: useBeacon
		});
		if (!response.ok) queue.unshift(...events);
	} catch {
		queue.unshift(...events);
	}
}

function visibleTime() {
	return visibleElapsedMs + (visibleStartedAt ? performance.now() - visibleStartedAt : 0);
}

function finalizePage(reason: string) {
	if (!currentPageViewId) return;
	enqueue({
		type: 'page_leave',
		pageViewId: currentPageViewId,
		...(currentPageLocation ?? {}),
		durationMs: Math.round(performance.now() - currentPageStartedAt),
		engagedMs: Math.round(visibleTime()),
		scrollDepthPercent: maximumScrollDepth,
		properties: { reason }
	});
	currentPageViewId = '';
	currentPageLocation = null;
	visibleStartedAt = 0;
	visibleElapsedMs = 0;
}

export function analyticsPageView() {
	if (!installed) return;
	if (currentPageViewId) finalizePage('navigation');
	currentPageViewId = id();
	currentPageLocation = locationFields();
	currentPageStartedAt = performance.now();
	visibleElapsedMs = 0;
	visibleStartedAt = document.visibilityState === 'visible' ? performance.now() : 0;
	maximumScrollDepth = 0;
	enqueue({ type: 'page_view', pageViewId: currentPageViewId, ...currentPageLocation });
}

function elementText(element: InputElement | SVGElement): string | undefined {
	const explicit = element.getAttribute('data-analytics-label');
	const raw = explicit || element.getAttribute('aria-label') || element.textContent || '';
	const normalized = raw.replace(/\s+/g, ' ').trim();
	return normalized ? normalized.slice(0, 2_000) : undefined;
}

function selectorFor(element: InputElement | SVGElement): string {
	const parts: string[] = [];
	let current: InputElement | SVGElement | null = element;
	while (current && parts.length < 5 && current !== document.body) {
		let part = current.tagName.toLowerCase();
		if (current.id) {
			part += `#${CSS.escape(current.id)}`;
			parts.unshift(part);
			break;
		}
		const stableClasses = Array.from(current.classList).filter(
			(name) => !/^(s-|active|open|selected)/.test(name)
		);
		if (stableClasses.length)
			part += `.${stableClasses
				.slice(0, 2)
				.map((name) => CSS.escape(name))
				.join('.')}`;
		parts.unshift(part);
		current = current.parentElement;
	}
	return parts.join(' > ').slice(0, 2_000);
}

function elementDetails(element: InputElement | SVGElement) {
	return {
		tag: element.tagName.toLowerCase(),
		id: element.id || undefined,
		classes: element instanceof SVGElement ? element.className.baseVal : element.className || undefined,
		text: elementText(element),
		role: element.getAttribute('role') || undefined,
		name: element.getAttribute('name') || element.getAttribute('aria-label') || undefined,
		href: element instanceof HTMLAnchorElement ? element.href : undefined,
		selector: selectorFor(element)
	};
}

function click(event: MouseEvent) {
	const target = event.target instanceof Element ? event.target : null;
	const element = target?.closest(
		'a, button, [role="button"], input, select, textarea, summary, [data-analytics-click]'
	);
	if (!element || element.closest('[data-analytics-ignore]')) return;
	if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return;
	enqueue({
		type: 'click',
		element: elementDetails(element),
		properties: { x: event.clientX, y: event.clientY, button: event.button }
	});
}

function inputValue(element: InputElement): string {
	if (element instanceof HTMLInputElement) {
		if (element.type === 'checkbox' || element.type === 'radio') return String(element.checked);
		if (element.type === 'file')
			return element.files ? `[${element.files.length} file(s)]` : '[file]';
		return element.value;
	}
	if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
		return element.value;
	return element.textContent || '';
}

function shouldRedact(element: InputElement): boolean {
	if (element.closest('[data-analytics-redact]')) return true;
	const type = element instanceof HTMLInputElement ? element.type : '';
	const autocomplete = element.getAttribute('autocomplete') || '';
	const identity = [element.getAttribute('name'), element.id, element.getAttribute('aria-label')]
		.filter(Boolean)
		.join(' ');
	return (
		type === 'password' ||
		type === 'hidden' ||
		type === 'file' ||
		/(current-password|new-password|one-time-code|cc-)/i.test(autocomplete) ||
		SENSITIVE_FIELD_PATTERN.test(identity)
	);
}

function captureInput(element: InputElement, trigger: string) {
	const value = inputValue(element);
	const previousValue = inputValues.get(element);
	inputValues.set(element, value);
	const redacted = shouldRedact(element);
	enqueue({
		type: 'input_change',
		element: elementDetails(element),
		input: {
			name: element.getAttribute('name') || element.id || undefined,
			type: element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase(),
			value: redacted ? '[REDACTED]' : value,
			previousValue: redacted ? '[REDACTED]' : previousValue,
			redacted
		},
		properties: { trigger, length: value.length }
	});
}

function input(event: Event) {
	const element = event.target;
	if (
		!(element instanceof HTMLInputElement) &&
		!(element instanceof HTMLTextAreaElement) &&
		!(element instanceof HTMLSelectElement) &&
		!(element instanceof HTMLElement && element.isContentEditable)
	)
		return;
	if (element.closest('[data-analytics-ignore]')) return;
	if (!inputValues.has(element)) inputValues.set(element, '');
	const existing = inputTimers.get(element);
	if (existing) window.clearTimeout(existing);
	inputTimers.set(
		element,
		window.setTimeout(() => {
			inputTimers.delete(element);
			captureInput(element, event.type);
		}, 700)
	);
}

function change(event: Event) {
	const element = event.target;
	if (
		!(element instanceof HTMLInputElement) &&
		!(element instanceof HTMLTextAreaElement) &&
		!(element instanceof HTMLSelectElement)
	)
		return;
	const pending = inputTimers.get(element);
	if (!pending && inputValues.get(element) === inputValue(element)) return;
	if (pending) window.clearTimeout(pending);
	inputTimers.delete(element);
	captureInput(element, 'change');
}

function focusIn(event: FocusEvent) {
	const element = event.target;
	if (
		element instanceof HTMLInputElement ||
		element instanceof HTMLTextAreaElement ||
		element instanceof HTMLSelectElement ||
		(element instanceof HTMLElement && element.isContentEditable)
	)
		inputValues.set(element, inputValue(element));
}

function submit(event: SubmitEvent) {
	if (!(event.target instanceof HTMLFormElement) || event.target.closest('[data-analytics-ignore]'))
		return;
	enqueue({ type: 'form_submit', element: elementDetails(event.target) });
}

function scroll() {
	const height = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
	const depth = height === 0 ? 100 : Math.min(100, (window.scrollY / height) * 100);
	maximumScrollDepth = Math.max(maximumScrollDepth, Math.round(depth * 10) / 10);
}

function visibility() {
	if (document.visibilityState === 'hidden') {
		if (visibleStartedAt) visibleElapsedMs += performance.now() - visibleStartedAt;
		visibleStartedAt = 0;
		void flush(true);
	} else {
		visibleStartedAt = performance.now();
	}
}

function errorEvent(event: ErrorEvent) {
	enqueue({
		type: 'client_error',
		properties: {
			message: event.message,
			filename: event.filename,
			line: event.lineno,
			column: event.colno
		}
	});
}

export function installAnalytics(): () => void {
	if (installed) return teardown || (() => {});
	installed = true;
	identities();
	document.addEventListener('click', click, true);
	document.addEventListener('input', input, true);
	document.addEventListener('change', change, true);
	document.addEventListener('focusin', focusIn, true);
	document.addEventListener('submit', submit, true);
	document.addEventListener('scroll', scroll, { passive: true });
	document.addEventListener('visibilitychange', visibility);
	window.addEventListener('error', errorEvent);
	const beforeUnload = () => {
		for (const [element, timer] of inputTimers) {
			window.clearTimeout(timer);
			captureInput(element, 'unload');
		}
		inputTimers.clear();
		finalizePage('unload');
		void flush(true);
	};
	window.addEventListener('pagehide', beforeUnload);
	flushTimer = window.setInterval(() => void flush(), FLUSH_INTERVAL_MS);

	teardown = () => {
		if (!installed) return;
		installed = false;
		document.removeEventListener('click', click, true);
		document.removeEventListener('input', input, true);
		document.removeEventListener('change', change, true);
		document.removeEventListener('focusin', focusIn, true);
		document.removeEventListener('submit', submit, true);
		document.removeEventListener('scroll', scroll);
		document.removeEventListener('visibilitychange', visibility);
		window.removeEventListener('error', errorEvent);
		window.removeEventListener('pagehide', beforeUnload);
		if (flushTimer) window.clearInterval(flushTimer);
		finalizePage('tracker_teardown');
		void flush(true);
	};
	return teardown;
}
