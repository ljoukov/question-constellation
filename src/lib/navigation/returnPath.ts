export function safeInternalReturnPath(value: string | null | undefined): string | null {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
	if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
	return value;
}
