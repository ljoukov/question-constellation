import { browser } from '$app/environment';
import { haptic } from 'ios-haptics';

type HapticCue = 'selection' | 'success' | 'error';

function safeHaptic(play: () => void) {
	if (!browser) return;

	try {
		play();
	} catch {
		// Haptics are enhancement-only; unsupported browsers should stay silent.
	}
}

export function playHaptic(cue: HapticCue = 'selection') {
	if (cue === 'success') {
		safeHaptic(() => haptic.confirm());
		return;
	}

	if (cue === 'error') {
		safeHaptic(() => haptic.error());
		return;
	}

	safeHaptic(() => haptic());
}

export const haptics = {
	selection: () => playHaptic('selection'),
	success: () => playHaptic('success'),
	error: () => playHaptic('error')
};
