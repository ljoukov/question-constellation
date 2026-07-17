import { officialGradeBoundaryContextForOffering } from './officialGradeBoundaryContext';

export type CheckedAnswerAttempt = {
	questionId: string;
	awardedMarks: number;
	maxMarks: number;
};

export type CheckedAnswerPerformance = {
	label: string;
	detail: string;
	value: string | null;
};

type CheckedAnswerPerformanceInput = {
	attempts: CheckedAnswerAttempt[];
	observedTopicCount: number;
	includedTopicCount: number;
	offeringId?: string | null;
};

function finiteMark(value: number): number | null {
	return Number.isFinite(value) ? value : null;
}

function latestUniqueValidAttempts(attempts: CheckedAnswerAttempt[]): CheckedAnswerAttempt[] {
	const seenQuestionIds = new Set<string>();
	const valid: CheckedAnswerAttempt[] = [];
	for (const attempt of attempts) {
		if (!attempt.questionId || seenQuestionIds.has(attempt.questionId)) continue;
		seenQuestionIds.add(attempt.questionId);
		const awardedMarks = finiteMark(attempt.awardedMarks);
		const maxMarks = finiteMark(attempt.maxMarks);
		if (awardedMarks === null || maxMarks === null || maxMarks <= 0) continue;
		valid.push({
			questionId: attempt.questionId,
			awardedMarks: Math.min(maxMarks, Math.max(0, awardedMarks)),
			maxMarks
		});
	}
	return valid;
}

function countLabel(value: number, singular: string, plural = `${singular}s`): string {
	return `${value} ${value === 1 ? singular : plural}`;
}

function displayMark(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

export function deriveCheckedAnswerPerformance({
	attempts,
	observedTopicCount,
	includedTopicCount,
	offeringId = null
}: CheckedAnswerPerformanceInput): CheckedAnswerPerformance {
	const includedTopics = Math.max(0, Math.floor(includedTopicCount));
	const observedTopics = Math.min(includedTopics, Math.max(0, Math.floor(observedTopicCount)));
	const validAttempts = latestUniqueValidAttempts(attempts);
	const totalMarks = validAttempts.reduce((total, attempt) => total + attempt.maxMarks, 0);
	const awardedMarks = validAttempts.reduce((total, attempt) => total + attempt.awardedMarks, 0);

	if (includedTopics === 0) {
		return {
			label: 'Checked-answer summary not ready',
			detail: 'Choose the course content you have covered before we summarise checked work.',
			value: null
		};
	}

	if (validAttempts.length === 0) {
		return {
			label: 'Checked-answer summary not ready',
			detail:
				'Recall and guided work can choose what to practise, but they do not measure independent exam performance. Check a few independent exam answers to start a mark-rate summary.',
			value: null
		};
	}

	const requiredTopicCount = Math.min(2, includedTopics);
	if (validAttempts.length < 3 || totalMarks < 12 || observedTopics < requiredTopicCount) {
		return {
			label: 'Checked-answer summary building',
			detail: `Assessed scope: ${countLabel(validAttempts.length, 'independent checked question')} across ${observedTopics} of ${includedTopics} selected topics. A mark-rate summary needs at least 3 questions, 12 available marks and evidence across ${requiredTopicCount} ${requiredTopicCount === 1 ? 'topic' : 'topics'}; unassessed topics remain unknown.`,
			value: null
		};
	}

	const markRate = Math.round((awardedMarks / totalMarks) * 100);
	const assessedScope = observedTopics / includedTopics;
	const evidenceStrength =
		validAttempts.length >= 10 && totalMarks >= 40 && assessedScope >= 0.6
			? 'Growing evidence'
			: 'Early evidence';
	const unassessedTopics = includedTopics - observedTopics;
	const uncertaintyDetail =
		unassessedTopics > 0
			? `${countLabel(unassessedTopics, 'unassessed topic')} remain unknown.`
			: 'Future independent answers may still change the observed mark rate.';
	const boundaryContext = officialGradeBoundaryContextForOffering(offeringId);
	const gradeBoundaryDetail =
		boundaryContext?.learnerCaveat ??
		'Official grade boundaries use a complete qualification total, so they cannot convert this question sample to a GCSE grade.';

	return {
		label: 'Checked-answer mark rate',
		detail: `${evidenceStrength}. Assessed scope: ${countLabel(validAttempts.length, 'independent checked question')} across ${observedTopics} of ${includedTopics} selected topics. ${gradeBoundaryDetail} ${uncertaintyDetail}`,
		value: `${displayMark(awardedMarks)}/${displayMark(totalMarks)} marks · ${markRate}%`
	};
}
