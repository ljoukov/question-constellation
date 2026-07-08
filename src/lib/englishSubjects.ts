export const ENGLISH_LANGUAGE = 'English Language';
export const ENGLISH_LITERATURE = 'English Literature';

export const ENGLISH_SUBJECTS = [ENGLISH_LANGUAGE, ENGLISH_LITERATURE] as const;

export type EnglishSubject = (typeof ENGLISH_SUBJECTS)[number];

export const BROWSE_SUBJECTS = [
	'All subjects',
	'Science',
	'Biology',
	'Chemistry',
	'Physics',
	'Computer Science',
	'Geography',
	'History',
	ENGLISH_LANGUAGE,
	ENGLISH_LITERATURE
] as const;

export function isEnglishSubject(value: string | null | undefined): boolean {
	return (value ?? '').toLowerCase().includes('english');
}

export function canonicalEnglishSubject(
	value: string | null | undefined
): EnglishSubject | null {
	const normalized = (value ?? '').toLowerCase();
	if (!normalized.includes('english')) return null;
	if (normalized.includes('literature')) return ENGLISH_LITERATURE;
	if (normalized.includes('language')) return ENGLISH_LANGUAGE;
	return null;
}

export function englishSubjectOrDefault(
	value: string | null | undefined,
	fallback: EnglishSubject = ENGLISH_LANGUAGE
): EnglishSubject {
	return canonicalEnglishSubject(value) ?? fallback;
}
