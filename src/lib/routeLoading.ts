export type RouteLoadingContentType =
	| 'default'
	| 'challenge'
	| 'exam-paper'
	| 'experiment'
	| 'home'
	| 'past-papers'
	| 'practice'
	| 'question'
	| 'question-bank'
	| 'recall-practice';

const routeLoadingMessages = {
	default: 'Loading...',
	challenge: 'Loading challenge...',
	'exam-paper': 'Loading exam paper...',
	experiment: 'Loading experiment...',
	home: 'Loading home...',
	'past-papers': 'Loading past papers...',
	practice: 'Loading practice...',
	question: 'Loading question...',
	'question-bank': 'Loading questions...',
	'recall-practice': 'Loading recall practice...'
} satisfies Record<RouteLoadingContentType, string>;

export function routeLoadingMessageFor(contentType: RouteLoadingContentType = 'default') {
	return routeLoadingMessages[contentType] ?? routeLoadingMessages.default;
}

export function routeLoadingContentTypeForRoute(
	routeId: string | null | undefined,
	pathname = ''
): RouteLoadingContentType {
	if (!routeId) {
		return pathContentType(pathname);
	}

	if (routeId === '/') return 'home';
	if (routeId === '/questions') return 'question-bank';
	if (routeId === '/recall/[subject]/[activity]') return 'recall-practice';
	if (routeId.startsWith('/challenges')) return 'challenge';
	if (routeId.startsWith('/past-papers/gcse')) return 'past-papers';

	if (routeId === '/questions/[questionId]') return 'question';
	if (routeId === '/questions/[questionId]/practice') return 'practice';

	if (routeId === '/experiments/questions/[paperSlug]/[ref]') return 'question';
	if (routeId === '/experiments/questions/[paperSlug]') return 'exam-paper';
	if (routeId.startsWith('/experiments/questions')) return 'experiment';

	return 'default';
}

function pathContentType(pathname: string): RouteLoadingContentType {
	if (pathname === '/') return 'home';
	if (pathname === '/questions') return 'question-bank';
	if (pathname.startsWith('/recall/')) return 'recall-practice';
	if (pathname.startsWith('/challenges')) return 'challenge';
	if (pathname.startsWith('/past-papers/gcse')) return 'past-papers';
	if (pathname.startsWith('/questions/') && pathname.includes('/practice')) return 'practice';
	if (pathname.startsWith('/questions/')) return 'question';
	if (pathname === '/experiments/questions') return 'experiment';
	if (pathname === '/experiments/questions/matching-stress') return 'experiment';
	if (pathname.startsWith('/experiments/questions/')) {
		const parts = pathname.split('/').filter(Boolean);
		if (parts.length >= 4) return 'question';
		if (parts.length === 3) return 'exam-paper';
		return 'experiment';
	}
	return 'default';
}
