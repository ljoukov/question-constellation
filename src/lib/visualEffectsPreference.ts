import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type VisualEffectsPreference = boolean;

export function safeVisualEffectsPreference(value: unknown): VisualEffectsPreference {
	return value === false || value === 0 ? false : true;
}

export const visualEffectsPreference = writable<VisualEffectsPreference>(true);

export function applyDocumentVisualEffects(enabled: VisualEffectsPreference) {
	if (!browser) return;
	document.documentElement.dataset.visualEffects = enabled ? 'on' : 'off';
}

export function setVisualEffectsPreference(enabled: VisualEffectsPreference) {
	const safePreference = safeVisualEffectsPreference(enabled);
	visualEffectsPreference.set(safePreference);
	applyDocumentVisualEffects(safePreference);
}
