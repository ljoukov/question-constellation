import { safeInternalReturnPath } from '$lib/navigation/returnPath';

const entryPattern = /^[a-z][a-z0-9_-]{0,31}$/;

export function englishPracticeContext(searchParams: URLSearchParams): URLSearchParams {
	const context = new URLSearchParams();
	const entry = searchParams.get('entry')?.trim() ?? '';
	if (entryPattern.test(entry)) context.set('entry', entry);
	const returnTo = safeInternalReturnPath(searchParams.get('returnTo'));
	if (returnTo) context.set('returnTo', returnTo);
	return context;
}

export function withEnglishPracticeContext(
	path: string,
	searchParams: URLSearchParams
): string {
	const query = englishPracticeContext(searchParams).toString();
	return query ? `${path}?${query}` : path;
}
