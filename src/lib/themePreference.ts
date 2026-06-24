import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = 'auto' | ThemeMode;

const STORAGE_KEY = 'question-constellation-theme';

function readStoredTheme(): ThemePreference {
	if (!browser) return 'auto';
	const value = window.localStorage.getItem(STORAGE_KEY);
	return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

export const themePreference = writable<ThemePreference>(readStoredTheme());

export function applyDocumentTheme(mode: ThemeMode) {
	if (!browser) return;
	const root = document.documentElement;
	root.dataset.theme = mode;
	root.classList.toggle('dark', mode === 'dark');
	root.style.colorScheme = mode;
}

export function setThemePreference(preference: ThemePreference) {
	if (browser) {
		if (preference === 'auto') {
			window.localStorage.removeItem(STORAGE_KEY);
		} else {
			window.localStorage.setItem(STORAGE_KEY, preference);
		}
	}
	themePreference.set(preference);
}

export function startAutomaticThemeSync() {
	if (!browser) return () => {};
	const media = window.matchMedia('(prefers-color-scheme: dark)');
	const apply = () => applyDocumentTheme(media.matches ? 'dark' : 'light');
	apply();
	media.addEventListener('change', apply);
	return () => media.removeEventListener('change', apply);
}
