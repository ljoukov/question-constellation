import type {
	PublicChallengeDefinition,
	PublicChallengePreviewDefinition,
	PublicNextChallengeDefinition
} from './authoredData';
import type { ChallengeProgress } from './progress';
import type { ChallengeLeaderboardSnapshot } from './leaderboard';
import type { ChallengeSubject, ChallengeSubjectDefinition } from './types';
import type { ChallengeVisualDefinition } from './visuals';
import type { AnswerChain } from '$lib/server/questionData';
import type { ShortRecallPrompt } from './shortRecall';

export const CHALLENGE_CATALOG_ROUTE_SCHEMA = 'challenge-catalog-route/v1' as const;
export const CHALLENGE_CATALOG_INDEX_PATH = '/_challenge-index' as const;

export type ChallengeSocialImage = {
	url: string;
	alt: string;
	width: number;
	height: number;
};

export type PublicChallengeCurriculumLink = {
	topicLabel: string;
	officialUrl: string;
};

type ChallengeRoutePayloadBase = {
	schemaVersion: typeof CHALLENGE_CATALOG_ROUTE_SCHEMA;
	releaseId: string;
	socialImage: ChallengeSocialImage;
	ks4ScienceUrl: string;
};

export type ChallengeCatalogIndexPayload = ChallengeRoutePayloadBase & {
	challengeIds: string[];
	challenges: PublicChallengePreviewDefinition[];
	subjects: ChallengeSubjectDefinition[];
	arcs: Array<{ id: string; label: string; description: string }>;
	sitemapEntries: Array<{
		path: string;
		priority: string;
		changefreq: 'weekly' | 'monthly';
		lastmod?: string;
	}>;
	latestReviewed?: string;
};

export type ChallengeHubPayload = ChallengeRoutePayloadBase & {
	featuredChallenge: PublicChallengePreviewDefinition;
	challenges: PublicChallengePreviewDefinition[];
	subjects: Array<{
		subject: ChallengeSubject;
		label: string;
		challengeIds: string[];
		cardArt: PublicChallengePreviewDefinition['cardArt'];
	}>;
	curriculumLinks: PublicChallengeCurriculumLink[];
	challengeIds: string[];
};

export type ChallengeSubjectPayload = ChallengeRoutePayloadBase & {
	subject: Pick<ChallengeSubjectDefinition, 'subject' | 'label' | 'description'>;
	defaultHeroId: string;
	challenges: PublicChallengePreviewDefinition[];
	curriculumLinks: PublicChallengeCurriculumLink[];
	challengeIds: string[];
};

export type ChallengeDetailPayload = ChallengeRoutePayloadBase & {
	challenge: PublicChallengeDefinition;
	chain: AnswerChain;
	visual: ChallengeVisualDefinition;
	nextChallenges: PublicNextChallengeDefinition[];
	shortRecallPrompt: ShortRecallPrompt | null;
	curriculumCitation: PublicChallengeCurriculumLink | null;
	challengeIds: string[];
};

export type ChallengeHubPageData = ChallengeHubPayload & {
	challengeProgress: ChallengeProgress;
	leaderboard: ChallengeLeaderboardSnapshot;
	user: App.Locals['user'];
};
