export function safeAuthReturnPath(value: string | null | undefined, fallback = '/') {
	const raw = value?.trim();
	if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(raw)) {
		return fallback;
	}
	return raw;
}

export function authStartHref(next: string) {
	return `/auth/start?next=${encodeURIComponent(safeAuthReturnPath(next))}`;
}
