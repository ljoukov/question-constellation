import type { EnglishLiteratureSelections } from '$lib/englishLiteratureProfile';
import type { LearnerProfileSettings, LearnerSubject } from '$lib/server/personalLearning';
import { z } from 'zod';

export const ANONYMOUS_PROFILE_STORAGE_KEY = 'question-constellation:learner-profile:v1';
export const ANONYMOUS_PROFILE_COOKIE_NAME = 'qc_learner_profile';

const learnerSubjectSchema = z.object({
	subject: z.string().trim().min(1).max(80),
	board: z.string().trim().min(1).max(40),
	qualification: z.literal('GCSE').default('GCSE'),
	course: z.enum(['Separate Science', 'Combined Science', 'GCSE Subject']),
	tier: z.enum(['Higher', 'Foundation']),
	enabled: z.boolean(),
	currentGrade: z.string().trim().max(20).nullable(),
	targetGrade: z.string().trim().max(20).nullable()
});

const englishLiteratureSelectionsSchema = z.object({
	board: z.literal('OCR').default('OCR'),
	specificationCode: z.literal('J352').default('J352'),
	modernText: z.string().trim().max(120).nullable(),
	nineteenthCenturyNovel: z.string().trim().max(120).nullable(),
	poetryCluster: z.string().trim().max(120).nullable(),
	shakespearePlay: z.string().trim().max(120).nullable()
});

const anonymousLearnerProfileSchema = z.object({
	version: z.literal(1),
	updatedAt: z.number().int().nonnegative(),
	pendingSync: z.boolean(),
	subjects: z.array(learnerSubjectSchema).max(20),
	englishLiteratureSelections: englishLiteratureSelectionsSchema
});

export type AnonymousLearnerProfile = z.infer<typeof anonymousLearnerProfileSchema>;

export type AnonymousProfileAccountMerge = {
	subjects: LearnerSubject[];
	englishLiteratureSelections: EnglishLiteratureSelections;
	subjectsChanged: boolean;
	englishLiteratureSelectionsChanged: boolean;
};

export function parseAnonymousLearnerProfile(value: unknown): AnonymousLearnerProfile | null {
	const parsed = anonymousLearnerProfileSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export function parseAnonymousLearnerProfileCookie(value: string | null | undefined) {
	if (!value) return null;
	try {
		return parseAnonymousLearnerProfile(JSON.parse(decodeURIComponent(value)));
	} catch {
		return null;
	}
}

export function anonymousProfileSettings(
	defaults: LearnerProfileSettings,
	profile: AnonymousLearnerProfile | null | undefined
): LearnerProfileSettings {
	if (!profile) return defaults;
	const bySubject = new Map(profile.subjects.map((subject) => [subject.subject, subject]));
	return {
		...defaults,
		subjects: defaults.subjects.map((subject) => bySubject.get(subject.subject) ?? subject),
		englishLiteratureSelections: profile.englishLiteratureSelections
	};
}

function subjectKey(subject: string): string {
	return subject.trim().toLowerCase();
}

function optionalText(value: string | null | undefined): string | null {
	return value?.trim() || null;
}

function sameLearnerSubjects(left: LearnerSubject[], right: LearnerSubject[]): boolean {
	return (
		left.length === right.length &&
		left.every((subject, index) => {
			const other = right[index];
			return (
				other !== undefined &&
				subject.subject === other.subject &&
				subject.board === other.board &&
				subject.qualification === other.qualification &&
				subject.course === other.course &&
				subject.tier === other.tier &&
				subject.enabled === other.enabled &&
				subject.currentGrade === other.currentGrade &&
				subject.targetGrade === other.targetGrade
			);
		})
	);
}

function sameEnglishLiteratureSelections(
	left: EnglishLiteratureSelections,
	right: EnglishLiteratureSelections
): boolean {
	return (
		left.board === right.board &&
		left.specificationCode === right.specificationCode &&
		left.modernText === right.modernText &&
		left.nineteenthCenturyNovel === right.nineteenthCenturyNovel &&
		left.poetryCluster === right.poetryCluster &&
		left.shakespearePlay === right.shakespearePlay
	);
}

/**
 * Imports useful anonymous choices without treating the anonymous profile as an
 * authoritative replacement for an established account.
 *
 * Persisted account configuration wins for that subject, while a subject that
 * has never been persisted can take the complete guest choice instead of the
 * account's synthetic default. On persisted rows an enabled guest subject is
 * additive, but guest nulls and disabled defaults never erase an account
 * choice. Literature selections follow the same fill-only rule.
 */
export function mergeAnonymousProfileIntoAccount(
	account: LearnerProfileSettings,
	guest: AnonymousLearnerProfile,
	establishedSubjectNames: Iterable<string>
): AnonymousProfileAccountMerge {
	const establishedSubjects = new Set(
		Array.from(establishedSubjectNames, (subject) => subjectKey(subject))
	);
	const guestSubjects = new Map(
		guest.subjects.map((subject) => [subjectKey(subject.subject), subject] as const)
	);

	const subjects = account.subjects.map((accountSubject) => {
		const key = subjectKey(accountSubject.subject);
		const guestSubject = guestSubjects.get(key);
		if (!guestSubject) return { ...accountSubject };

		const preserveAccountConfiguration = establishedSubjects.has(key);
		if (!preserveAccountConfiguration) {
			return {
				...accountSubject,
				board: guestSubject.board,
				qualification: guestSubject.qualification,
				course: guestSubject.course,
				tier: guestSubject.tier,
				enabled: guestSubject.enabled,
				currentGrade: optionalText(guestSubject.currentGrade),
				targetGrade: optionalText(guestSubject.targetGrade)
			};
		}
		if (!guestSubject.enabled) return { ...accountSubject };

		return {
			...accountSubject,
			enabled: true,
			currentGrade:
				optionalText(accountSubject.currentGrade) ?? optionalText(guestSubject.currentGrade),
			targetGrade:
				optionalText(accountSubject.targetGrade) ?? optionalText(guestSubject.targetGrade)
		};
	});

	const englishLiteratureSelections: EnglishLiteratureSelections = {
		board: account.englishLiteratureSelections.board,
		specificationCode: account.englishLiteratureSelections.specificationCode,
		modernText:
			optionalText(account.englishLiteratureSelections.modernText) ??
			optionalText(guest.englishLiteratureSelections.modernText),
		nineteenthCenturyNovel:
			optionalText(account.englishLiteratureSelections.nineteenthCenturyNovel) ??
			optionalText(guest.englishLiteratureSelections.nineteenthCenturyNovel),
		poetryCluster:
			optionalText(account.englishLiteratureSelections.poetryCluster) ??
			optionalText(guest.englishLiteratureSelections.poetryCluster),
		shakespearePlay:
			optionalText(account.englishLiteratureSelections.shakespearePlay) ??
			optionalText(guest.englishLiteratureSelections.shakespearePlay)
	};

	return {
		subjects,
		englishLiteratureSelections,
		subjectsChanged: !sameLearnerSubjects(account.subjects, subjects),
		englishLiteratureSelectionsChanged: !sameEnglishLiteratureSelections(
			account.englishLiteratureSelections,
			englishLiteratureSelections
		)
	};
}

export function readAnonymousLearnerProfile(): AnonymousLearnerProfile | null {
	if (typeof window === 'undefined') return null;
	try {
		return parseAnonymousLearnerProfile(
			JSON.parse(window.localStorage.getItem(ANONYMOUS_PROFILE_STORAGE_KEY) ?? 'null')
		);
	} catch {
		return null;
	}
}

export function saveAnonymousLearnerProfile(input: {
	subjects: LearnerSubject[];
	englishLiteratureSelections: EnglishLiteratureSelections;
}) {
	if (typeof window === 'undefined') return null;
	const profile = anonymousLearnerProfileSchema.parse({
		version: 1,
		updatedAt: Date.now(),
		pendingSync: true,
		subjects: input.subjects,
		englishLiteratureSelections: input.englishLiteratureSelections
	});
	try {
		const serialized = JSON.stringify(profile);
		window.localStorage.setItem(ANONYMOUS_PROFILE_STORAGE_KEY, serialized);
		document.cookie = `${ANONYMOUS_PROFILE_COOKIE_NAME}=${encodeURIComponent(serialized)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
	} catch {
		// The controls remain usable even when browser storage is unavailable.
	}
	return profile;
}

export function markAnonymousLearnerProfileSynced(profile: AnonymousLearnerProfile) {
	if (typeof window === 'undefined') return;
	const synced = { ...profile, pendingSync: false } satisfies AnonymousLearnerProfile;
	try {
		const serialized = JSON.stringify(synced);
		window.localStorage.setItem(ANONYMOUS_PROFILE_STORAGE_KEY, serialized);
		document.cookie = `${ANONYMOUS_PROFILE_COOKIE_NAME}=${encodeURIComponent(serialized)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
	} catch {
		// A later signed-in visit can retry the harmless idempotent import.
	}
}
