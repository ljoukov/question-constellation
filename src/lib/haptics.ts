import { browser } from '$app/environment';
import { hapticTrigger } from 'ios-haptics';
import type { Attachment } from 'svelte/attachments';

type HapticCue = 'selection' | 'success' | 'error';

const VIBRATION_PATTERNS: Record<HapticCue, number | number[]> = {
	selection: 8,
	success: [10, 32, 18],
	error: [28, 36, 28]
};

function restorePosition(element: HTMLElement, value: string, priority: string) {
	if (value) {
		element.style.setProperty('position', value, priority);
	} else {
		element.style.removeProperty('position');
	}
}

function isIosTouchBrowser() {
	if (typeof navigator === 'undefined') return false;
	const userAgent = navigator.userAgent ?? '';
	const platform = navigator.platform ?? '';
	return (
		/iPad|iPhone|iPod/.test(userAgent) ||
		(platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1)
	);
}

/**
 * Adds Safari's direct-tap haptic proxy as a progressive enhancement.
 *
 * The upstream helper deliberately overlays a native switch input and does not
 * expose cleanup. Keep the proxy out of the accessibility and analytics trees,
 * and restore all DOM/style changes when Svelte detaches it.
 */
export const attachHaptic: Attachment<HTMLElement> = (element) => {
	if (!browser || !isIosTouchBrowser()) return;

	const control =
		element instanceof HTMLButtonElement
			? element
			: element.querySelector<HTMLButtonElement>('button[data-haptic-control]');
	if (!control) return;

	const existingChildren = new Set(element.children);
	const previousPosition = element.style.getPropertyValue('position');
	const previousPositionPriority = element.style.getPropertyPriority('position');
	let alreadyPositioned = previousPosition !== '' && previousPosition !== 'static';
	try {
		alreadyPositioned = getComputedStyle(element).position !== 'static';
	} catch {
		// The inline value is a sufficient fallback in non-standard DOMs.
	}

	try {
		hapticTrigger(element);
	} catch {
		// Haptics are enhancement-only; unsupported browsers should stay silent.
	}

	const proxy = Array.from(element.children).find(
		(child): child is HTMLInputElement =>
			!existingChildren.has(child) && child instanceof HTMLInputElement && child.type === 'checkbox'
	);
	const upstreamSetRelative = element.style.getPropertyValue('position') === 'relative';

	if (!proxy) {
		if (upstreamSetRelative) {
			restorePosition(element, previousPosition, previousPositionPriority);
		}
		return;
	}

	proxy.setAttribute('data-haptic-proxy', '');
	proxy.setAttribute('aria-hidden', 'true');
	proxy.tabIndex = -1;
	const forwardClick = () => {
		if (!control.disabled) control.click();
	};
	proxy.addEventListener('click', forwardClick);

	let observer: MutationObserver | undefined;
	const syncDisabled = () => {
		proxy.disabled = control.disabled;
	};
	syncDisabled();
	if (typeof MutationObserver !== 'undefined') {
		observer = new MutationObserver(syncDisabled);
		observer.observe(control, { attributes: true, attributeFilter: ['disabled'] });
	}

	// Preserve an existing positioning context instead of letting the helper
	// replace absolute/fixed/sticky or stylesheet-provided positioning.
	const retainedUpstreamPosition = upstreamSetRelative && !alreadyPositioned;
	if (upstreamSetRelative && alreadyPositioned) {
		restorePosition(element, previousPosition, previousPositionPriority);
	}

	return () => {
		observer?.disconnect();
		proxy.removeEventListener('click', forwardClick);
		proxy.remove();
		if (retainedUpstreamPosition && element.style.getPropertyValue('position') === 'relative') {
			restorePosition(element, previousPosition, previousPositionPriority);
		}
	};
};

export function playHaptic(cue: HapticCue = 'selection') {
	if (!browser || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function')
		return;

	try {
		navigator.vibrate(VIBRATION_PATTERNS[cue]);
	} catch {
		// Tactile feedback is never required for the interaction to succeed.
	}
}

export const haptics = {
	selection: () => playHaptic('selection'),
	success: () => playHaptic('success'),
	error: () => playHaptic('error')
};
