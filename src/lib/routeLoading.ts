export type RouteLoadingContentType =
	| 'default'
	| 'answer-chain'
	| 'constellation'
	| 'english-questions'
	| 'exam-paper'
	| 'experiment'
	| 'past-papers'
	| 'practice'
	| 'question'
	| 'question-bank'
	| 'recall-practice'
	| 'thinking-memory';

const routeLoadingMessages = {
	default: 'Loading...',
	'answer-chain': 'Loading answer chain...',
	constellation: 'Loading constellation...',
	'english-questions': 'Loading English questions...',
	'exam-paper': 'Loading exam paper...',
	experiment: 'Loading experiment...',
	'past-papers': 'Loading past papers...',
	practice: 'Loading practice...',
	question: 'Loading question...',
	'question-bank': 'Loading question bank...',
	'recall-practice': 'Loading recall practice...',
	'thinking-memory': 'Loading Thinking Memory...'
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

	if (routeId === '/') return 'question-bank';
	if (routeId === '/english') return 'english-questions';
	if (routeId === '/recall') return 'recall-practice';
	if (routeId === '/thinking-memory') return 'thinking-memory';
	if (routeId.startsWith('/past-papers/gcse')) return 'past-papers';

	if (routeId === '/questions/[questionId]') return 'question';
	if (routeId === '/questions/[questionId]/chain' || routeId === '/chains/[chainId]') {
		return 'answer-chain';
	}
	if (routeId === '/constellations/[chainId]') return 'constellation';
	if (
		routeId === '/questions/[questionId]/practice' ||
		routeId === '/practice/[chainId]/[ref]' ||
		routeId === '/practice/[familyId]'
	) {
		return 'practice';
	}

	if (routeId === '/experiments/questions/[paperSlug]/[ref]') return 'question';
	if (routeId === '/experiments/questions/[paperSlug]') return 'exam-paper';
	if (routeId.startsWith('/experiments/questions')) return 'experiment';

	return 'default';
}

function pathContentType(pathname: string): RouteLoadingContentType {
	if (pathname === '/') return 'question-bank';
	if (pathname === '/english') return 'english-questions';
	if (pathname === '/recall') return 'recall-practice';
	if (pathname === '/thinking-memory') return 'thinking-memory';
	if (pathname.startsWith('/past-papers/gcse')) return 'past-papers';
	if (pathname.startsWith('/constellations/')) return 'constellation';
	if (pathname.startsWith('/chains/')) return 'answer-chain';
	if (pathname.startsWith('/practice/')) return 'practice';
	if (pathname.startsWith('/questions/') && pathname.endsWith('/chain')) return 'answer-chain';
	if (pathname.startsWith('/questions/') && pathname.endsWith('/practice')) return 'practice';
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
