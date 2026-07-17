import { afterEach, describe, expect, it, vi } from 'vitest';

import { analyticsEvent, installAnalytics } from './client';

class FakeElement {
	readonly classList: string[] = [];
	parentElement: FakeElement | null = null;
	id = '';
	className = '';
	textContent = '';
	private attributes = new Map<string, string>();

	constructor(readonly tagName: string) {}

	setAttribute(name: string, value: string) {
		this.attributes.set(name, value);
	}

	getAttribute(name: string) {
		return this.attributes.get(name) ?? null;
	}

	hasAttribute(name: string) {
		return this.attributes.has(name);
	}

	closest(selector: string): FakeElement | null {
		const matches = (current: FakeElement) => {
			if (selector === '[data-haptic-proxy]' && current.hasAttribute('data-haptic-proxy'))
				return true;
			if (selector === '[data-analytics-ignore]' && current.hasAttribute('data-analytics-ignore'))
				return true;
			if (
				selector === 'button, a, [role="button"]' &&
				(current.tagName === 'BUTTON' ||
					current.tagName === 'A' ||
					current.getAttribute('role') === 'button')
			)
				return true;
			return (
				selector.includes('input, select, textarea') &&
				['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(current.tagName)
			);
		};

		if (matches(this)) return this;
		let current = this.parentElement;
		while (current) {
			if (matches(current)) return current;
			current = current.parentElement;
		}
		return null;
	}
}

class FakeHTMLElement extends FakeElement {
	isContentEditable = false;
}

class FakeInput extends FakeHTMLElement {
	type = 'checkbox';
	checked = false;
	value = '';
	files = null;
}

class FakeButton extends FakeHTMLElement {}
class FakeAnchor extends FakeHTMLElement {
	href = '';
}
class FakeTextArea extends FakeHTMLElement {
	value = '';
}
class FakeSelect extends FakeHTMLElement {
	value = '';
}
class FakeForm extends FakeHTMLElement {}
class FakeSvg extends FakeElement {}

function storage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value)
	};
}

describe('browser analytics haptic integration', () => {
	let stop: (() => void) | undefined;

	afterEach(() => {
		stop?.();
		stop = undefined;
		vi.unstubAllGlobals();
	});

	it('records custom events only when installed and ignores the native haptic proxy', async () => {
		const documentListeners = new Map<string, EventListener>();
		const body = new FakeHTMLElement('BODY');
		const fetch = vi.fn(async (input: string, init?: { body?: string }) => {
			void input;
			void init;
			return { ok: true };
		});
		let uuid = 0;

		vi.stubGlobal('Element', FakeElement);
		vi.stubGlobal('HTMLElement', FakeHTMLElement);
		vi.stubGlobal('HTMLInputElement', FakeInput);
		vi.stubGlobal('HTMLButtonElement', FakeButton);
		vi.stubGlobal('HTMLAnchorElement', FakeAnchor);
		vi.stubGlobal('HTMLTextAreaElement', FakeTextArea);
		vi.stubGlobal('HTMLSelectElement', FakeSelect);
		vi.stubGlobal('HTMLFormElement', FakeForm);
		vi.stubGlobal('SVGElement', FakeSvg);
		vi.stubGlobal('localStorage', storage());
		vi.stubGlobal('sessionStorage', storage());
		vi.stubGlobal('crypto', {
			randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`
		});
		vi.stubGlobal('navigator', {
			userAgent: 'Mobile Safari test',
			hardwareConcurrency: 4
		});
		vi.stubGlobal('fetch', fetch);
		vi.stubGlobal('document', {
			body,
			documentElement: { scrollHeight: 800 },
			title: 'Challenge',
			referrer: '',
			visibilityState: 'visible',
			cookie: '',
			addEventListener: vi.fn((type: string, listener: EventListener) => {
				documentListeners.set(type, listener);
			}),
			removeEventListener: vi.fn()
		});
		vi.stubGlobal('window', {
			location: {
				href: 'https://example.test/challenges/orbit-order',
				pathname: '/challenges/orbit-order',
				search: ''
			},
			innerWidth: 390,
			innerHeight: 844,
			screen: { width: 390, height: 844 },
			scrollY: 0,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			setInterval: vi.fn(() => 1),
			clearInterval: vi.fn(),
			setTimeout,
			clearTimeout
		});

		analyticsEvent('before_install', { shouldNotAppear: true });
		expect(fetch).not.toHaveBeenCalled();

		stop = installAnalytics();
		analyticsEvent('challenge_started', { challengeId: 'orbit-order' });

		const host = new FakeButton('BUTTON');
		host.textContent = 'Choose the next orbit';
		host.parentElement = body;
		const proxy = new FakeInput('INPUT');
		proxy.setAttribute('data-haptic-proxy', '');
		proxy.parentElement = host;

		documentListeners.get('click')?.({
			target: proxy,
			clientX: 24,
			clientY: 32,
			button: 0
		} as unknown as Event);
		documentListeners.get('focusin')?.({ target: proxy } as unknown as Event);
		documentListeners.get('input')?.({ target: proxy, type: 'input' } as unknown as Event);
		documentListeners.get('change')?.({ target: proxy, type: 'change' } as unknown as Event);
		documentListeners.get('click')?.({
			target: host,
			clientX: 24,
			clientY: 32,
			button: 0
		} as unknown as Event);

		stop();
		stop = undefined;
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());

		const requestBody = fetch.mock.calls[0]?.[1]?.body;
		expect(requestBody).toBeTypeOf('string');
		if (!requestBody) throw new Error('Analytics request body was not captured');
		const payload = JSON.parse(requestBody) as {
			events: Array<{
				type: string;
				properties?: Record<string, unknown>;
				element?: { tag?: string; text?: string };
			}>;
		};

		expect(payload.events.map((event) => event.type)).toEqual(['challenge_started', 'click']);
		expect(payload.events[0]?.properties).toEqual({ challengeId: 'orbit-order' });
		expect(payload.events[1]?.element).toMatchObject({
			tag: 'button',
			text: 'Choose the next orbit'
		});
		expect(payload.events.some((event) => event.type === 'before_install')).toBe(false);
		expect(payload.events.some((event) => event.type === 'input_change')).toBe(false);
	});
});
