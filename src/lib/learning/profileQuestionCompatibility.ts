import {
	isScienceLearnerSubject,
	supportedLearnerSubjects,
	type SupportedLearnerSubject
} from './subjects';

export type LearnerProfileCombination = {
	subject: string;
	board: string;
	qualification: string;
	course: 'Separate Science' | 'Combined Science' | 'GCSE Subject';
	tier: 'Higher' | 'Foundation';
	enabled: boolean;
};

export type QuestionProfileIdentity = {
	board: string | null | undefined;
	qualification: string | null | undefined;
	subject: string | null | undefined;
	subjectArea: string | null | undefined;
	componentCode: string | null | undefined;
	tier: string | null | undefined;
};

function normalized(value: string | null | undefined): string {
	return (value ?? '').trim().toLowerCase();
}

function canonicalQuestionSubject(
	identity: QuestionProfileIdentity
): SupportedLearnerSubject | null {
	const values = [identity.subjectArea, identity.subject]
		.map(normalized)
		.filter((value) => value.length > 0);
	for (const value of values) {
		const exact = supportedLearnerSubjects.find((subject) => normalized(subject) === value);
		if (exact) return exact;
		const contained = supportedLearnerSubjects.find((subject) => {
			const candidate = normalized(subject);
			return new RegExp(`(?:^|[^a-z])${candidate.replace(/\s+/g, '\\s+')}[^a-z]`).test(`${value} `);
		});
		if (contained) return contained;
	}
	return null;
}

function questionCourse(
	subject: SupportedLearnerSubject,
	identity: QuestionProfileIdentity
): LearnerProfileCombination['course'] | null {
	if (!isScienceLearnerSubject(subject)) return 'GCSE Subject';
	const sourceSubject = normalized(identity.subject);
	const componentCode = normalized(identity.componentCode);
	if (sourceSubject.includes('combined science') || componentCode.startsWith('8464')) {
		return 'Combined Science';
	}
	if (
		sourceSubject.includes(normalized(subject)) ||
		['8461', '8462', '8463'].some((code) => componentCode.startsWith(code))
	) {
		return 'Separate Science';
	}
	return null;
}

function questionTierAllowsLearner(
	questionTier: string | null | undefined,
	learnerTier: LearnerProfileCombination['tier'],
	tierRequired: boolean
): boolean {
	const value = normalized(questionTier);
	if (!value || value === 'untiered' || value === 'not tiered') return !tierRequired;
	if (value === 'both') return true;
	const mentionsHigher = value.includes('higher');
	const mentionsFoundation = value.includes('foundation');
	if (mentionsHigher && mentionsFoundation) return true;
	if (mentionsHigher) return learnerTier === 'Higher';
	if (mentionsFoundation) return learnerTier === 'Foundation';
	return false;
}

export function enabledProfileCombinationForQuestion<T extends LearnerProfileCombination>(
	subjects: readonly T[],
	identity: QuestionProfileIdentity
): T | null {
	const questionSubject = canonicalQuestionSubject(identity);
	const questionBoard = normalized(identity.board);
	const questionQualification = normalized(identity.qualification);
	if (!questionSubject || !questionBoard || !questionQualification) return null;
	const course = questionCourse(questionSubject, identity);
	if (!course) return null;
	return (
		subjects.find(
			(subject) =>
				subject.enabled &&
				subject.subject === questionSubject &&
				normalized(subject.board) === questionBoard &&
				normalized(subject.qualification) === questionQualification &&
				subject.course === course &&
				questionTierAllowsLearner(
					identity.tier,
					subject.tier,
					isScienceLearnerSubject(questionSubject)
				)
		) ?? null
	);
}
