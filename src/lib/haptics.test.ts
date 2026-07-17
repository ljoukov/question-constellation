import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hapticTrigger: vi.fn(),
	vibrate: vi.fn()
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('ios-haptics', () => ({ hapticTrigger: mocks.hapticTrigger }));

import { attachHaptic, haptics, playHaptic } from './haptics';

class FakeStyle {
	private values = new Map<string, { value: string; priority: string }>();

	get position() {
		return this.getPropertyValue('position');
	}

	set position(value: string) {
		this.setProperty('position', value);
	}

	getPropertyValue(name: string) {
		return this.values.get(name)?.value ?? '';
	}

	getPropertyPriority(name: string) {
		return this.values.get(name)?.priority ?? '';
	}

	setProperty(name: string, value: string, priority = '') {
		this.values.set(name, { value, priority });
	}

	removeProperty(name: string) {
		const value = this.getPropertyValue(name);
		this.values.delete(name);
		return value;
	}
}

class FakeElement {
	readonly children: FakeElement[] = [];
	readonly style = new FakeStyle();
	parentElement: FakeElement | null = null;
	computedPosition = 'static';
	private attributes = new Map<string, string>();
	private listeners = new Map<string, Set<() => void>>();

	insertAdjacentElement(_position: string, child: FakeElement) {
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	setAttribute(name: string, value: string) {
		this.attributes.set(name, value);
	}

	getAttribute(name: string) {
		return this.attributes.get(name) ?? null;
	}

	hasAttribute(name: string) {
		return this.attributes.has(name);
	}

	querySelector<T extends FakeElement>(selector: string): T | null {
		if (selector !== 'button[data-haptic-control]') return null;
		return (this.children.find(
			(child) => child instanceof FakeButton && child.hasAttribute('data-haptic-control')
		) ?? null) as T | null;
	}

	addEventListener(type: string, listener: () => void) {
		const listeners = this.listeners.get(type) ?? new Set();
		listeners.add(listener);
		this.listeners.set(type, listeners);
	}

	removeEventListener(type: string, listener: () => void) {
		this.listeners.get(type)?.delete(listener);
	}

	dispatch(type: string) {
		for (const listener of this.listeners.get(type) ?? []) listener();
	}

	remove() {
		if (!this.parentElement) return;
		const index = this.parentElement.children.indexOf(this);
		if (index >= 0) this.parentElement.children.splice(index, 1);
		this.parentElement = null;
	}
}

class FakeInput extends FakeElement {
	type = 'checkbox';
	tabIndex = 0;
	disabled = false;
}

class FakeButton extends FakeElement {
	disabled = false;
	readonly click = vi.fn();
}

class FakeMutationObserver {
	static instances: FakeMutationObserver[] = [];
	readonly observe = vi.fn();
	readonly disconnect = vi.fn();

	constructor(readonly callback: MutationCallback) {
		FakeMutationObserver.instances.push(this);
	}

	notify() {
		this.callback([], this as unknown as MutationObserver);
	}
}

describe('haptic enhancement', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		FakeMutationObserver.instances = [];
		vi.stubGlobal('HTMLElement', FakeElement);
		vi.stubGlobal('HTMLInputElement', FakeInput);
		vi.stubGlobal('HTMLButtonElement', FakeButton);
		vi.stubGlobal('MutationObserver', FakeMutationObserver);
		vi.stubGlobal('getComputedStyle', (element: FakeElement) => ({
			position: element.computedPosition
		}));
		vi.stubGlobal('navigator', {
			vibrate: mocks.vibrate,
			userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
			platform: 'iPhone',
			maxTouchPoints: 5
		});
		mocks.hapticTrigger.mockImplementation((element: FakeElement) => {
			element.style.position = 'relative';
			element.insertAdjacentElement('beforeend', new FakeInput());
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('turns the upstream checkbox into an inaccessible, reversible tap proxy', () => {
		const host = new FakeElement();
		const control = new FakeButton();
		control.setAttribute('data-haptic-control', '');
		host.insertAdjacentElement('beforeend', control);
		const cleanup = attachHaptic(host as unknown as HTMLElement);
		const proxy = host.children[1] as FakeInput;
		const observer = FakeMutationObserver.instances[0];

		expect(mocks.hapticTrigger).toHaveBeenCalledOnce();
		expect(mocks.hapticTrigger.mock.calls[0]?.[0]).toBe(host);
		expect(proxy).toBeInstanceOf(FakeInput);
		expect(proxy.getAttribute('data-haptic-proxy')).toBe('');
		expect(proxy.getAttribute('aria-hidden')).toBe('true');
		expect(proxy.tabIndex).toBe(-1);
		expect(proxy.disabled).toBe(false);
		expect(host.style.position).toBe('relative');
		expect(observer.observe).toHaveBeenCalledOnce();
		expect(observer.observe.mock.calls[0]?.[0]).toBe(control);
		expect(observer.observe.mock.calls[0]?.[1]).toEqual({
			attributes: true,
			attributeFilter: ['disabled']
		});

		proxy.dispatch('click');
		expect(control.click).toHaveBeenCalledOnce();

		control.disabled = true;
		observer.notify();
		expect(proxy.disabled).toBe(true);
		proxy.dispatch('click');
		expect(control.click).toHaveBeenCalledOnce();

		expect(cleanup).toBeTypeOf('function');
		if (typeof cleanup === 'function') cleanup();
		expect(observer.disconnect).toHaveBeenCalledOnce();
		expect(host.children).toEqual([control]);
		expect(host.style.position).toBe('');
	});

	it('preserves an existing host positioning context', () => {
		const host = new FakeElement();
		const control = new FakeButton();
		control.setAttribute('data-haptic-control', '');
		host.insertAdjacentElement('beforeend', control);
		host.style.setProperty('position', 'absolute', 'important');
		host.computedPosition = 'absolute';

		const cleanup = attachHaptic(host as unknown as HTMLElement);

		expect(host.style.getPropertyValue('position')).toBe('absolute');
		expect(host.style.getPropertyPriority('position')).toBe('important');

		if (typeof cleanup === 'function') cleanup();
		expect(host.style.getPropertyValue('position')).toBe('absolute');
		expect(host.children).toEqual([control]);
	});

	it('uses optional vibration patterns for selection and answer outcomes', () => {
		haptics.selection();
		haptics.success();
		haptics.error();

		expect(mocks.vibrate.mock.calls).toEqual([[8], [[10, 32, 18]], [[28, 36, 28]]]);
	});

	it('never throws when vibration or the Safari enhancement is unavailable', () => {
		mocks.vibrate.mockImplementation(() => {
			throw new Error('blocked');
		});
		mocks.hapticTrigger.mockImplementation((element: FakeElement) => {
			element.style.position = 'relative';
			throw new Error('unsupported');
		});
		const host = new FakeElement();
		const control = new FakeButton();
		control.setAttribute('data-haptic-control', '');
		host.insertAdjacentElement('beforeend', control);

		expect(() => playHaptic('success')).not.toThrow();
		expect(() => attachHaptic(host as unknown as HTMLElement)).not.toThrow();
		expect(host.style.position).toBe('');
		expect(host.children).toEqual([control]);

		vi.stubGlobal('navigator', {});
		expect(() => playHaptic()).not.toThrow();
	});
});
