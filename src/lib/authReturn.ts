export function safeAuthReturnPath(value: string | null | undefined, fallback = '/') {
	const raw = value?.trim();
	if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\r\n]/.test(raw)) return fallback;
	return raw;
}

export function authStartHref(next: string) {
	return `/auth/start?next=${encodeURIComponent(safeAuthReturnPath(next))}`;
}
