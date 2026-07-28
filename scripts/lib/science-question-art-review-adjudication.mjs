import {
	SCIENCE_ART_REVIEW_BOOLEAN_FIELDS,
	SCIENCE_ART_REVIEW_ISSUE_CATEGORIES,
	canonicalHash,
	validateIndependentArtReviewRow
} from './science-challenge-release.mjs';

export const SCIENCE_QUESTION_ART_REVIEW_ADJUDICATION_SCHEMA =
	'science-question-art-review-adjudication/v1';

const MAJOR_CATEGORY_BOOLEAN_FIELD = Object.freeze({
	science: 'scientificallyAccurate',
	relevance: 'exactlyRelevant',
	leakage: 'answerNeutral',
	text: 'textClean',
	theme: 'themeConsistent',
	quality: 'visuallyPolished',
	mobile: 'mobileSafe',
	accessibility: 'accessibleAlt',
	duplication: 'visuallyPolished'
});

/**
 * Apply an explicit, hash-bound major-only policy decision without mutating raw model evidence.
 *
 * The source review's batch files and model rows remain immutable. The derived review is used only
 * as repair authority; a fresh independent full review must still judge the replacement bytes.
 */
export function buildAdjudicatedArtReview({ sourceReview, adjudication }) {
	const issues = validateAdjudicationInputs(sourceReview, adjudication);
	if (issues.length) {
		throw new Error(`Invalid science art review adjudication:\n${issues.join('\n')}`);
	}

	const decisionById = new Map(adjudication.decisions.map((decision) => [decision.id, decision]));
	const reviews = sourceReview.reviews.map((sourceRow) => {
		const decision = decisionById.get(sourceRow.id);
		if (!decision) return structuredClone(sourceRow);
		if (decision.action === 'fresh-regenerate') {
			const row = {
				...structuredClone(sourceRow),
				accepted: false,
				disposition: 'fresh-regenerate',
				score: Math.min(14, sourceRow.score),
				[MAJOR_CATEGORY_BOOLEAN_FIELD[decision.category]]: false,
				issues: [
					...sourceRow.issues
						.filter((issue) => issue.severity === 'minor')
						.map((issue) => structuredClone(issue)),
					{
						category: decision.category,
						severity: 'major',
						description: decision.rationale,
						annotation: '',
						regenerationInstruction: decision.regenerationInstruction
					}
				]
			};
			const validation = validateIndependentArtReviewRow(row);
			if (validation.status !== 'passed') {
				throw new Error(`Adjudicated row ${row.id} is invalid:\n${validation.issues.join('\n')}`);
			}
			return row;
		}
		const minorIssues = sourceRow.issues
			.filter((issue) => issue.severity === 'minor')
			.map((issue) => structuredClone(issue));
		const row = {
			...structuredClone(sourceRow),
			...Object.fromEntries(SCIENCE_ART_REVIEW_BOOLEAN_FIELDS.map((field) => [field, true])),
			accepted: true,
			disposition: 'retain-with-annotation',
			score: Math.max(18, sourceRow.score),
			issues: [
				...minorIssues,
				{
					category: decision.category,
					severity: 'minor',
					description: decision.rationale,
					annotation: decision.annotation,
					regenerationInstruction: ''
				}
			]
		};
		const validation = validateIndependentArtReviewRow(row);
		if (validation.status !== 'passed') {
			throw new Error(`Adjudicated row ${row.id} is invalid:\n${validation.issues.join('\n')}`);
		}
		return row;
	});
	const rejected = reviews.filter((review) => review.accepted === false);
	const cleanAccepted = reviews.filter(
		(review) => review.accepted === true && review.disposition === 'accept'
	);
	const annotatedAccepted = reviews.filter(
		(review) => review.accepted === true && review.disposition === 'retain-with-annotation'
	);
	return {
		...structuredClone(sourceReview),
		status:
			rejected.length || sourceReview.missingCount || sourceReview.invalidBatchCount
				? 'failed'
				: 'passed',
		acceptedCount: reviews.length - rejected.length,
		cleanAcceptedCount: cleanAccepted.length,
		annotatedAcceptedCount: annotatedAccepted.length,
		rejectedCount: rejected.length,
		majorRejectedCount: rejected.length,
		reviews,
		adjudication: {
			schemaVersion: SCIENCE_QUESTION_ART_REVIEW_ADJUDICATION_SCHEMA,
			policy: adjudication.policy,
			sourceReviewSha256: adjudication.sourceReviewSha256,
			decisionsSha256: canonicalHash(adjudication.decisions),
			retainedCount: adjudication.decisions.filter(
				(decision) => decision.action === 'retain-with-annotation'
			).length,
			retainedIds: adjudication.decisions
				.filter((decision) => decision.action === 'retain-with-annotation')
				.map((decision) => decision.id),
			escalatedCount: adjudication.decisions.filter(
				(decision) => decision.action === 'fresh-regenerate'
			).length,
			escalatedIds: adjudication.decisions
				.filter((decision) => decision.action === 'fresh-regenerate')
				.map((decision) => decision.id),
			adjudicatedAt: adjudication.adjudicatedAt
		}
	};
}

export function validateScienceQuestionArtReviewAdjudication({ sourceReview, adjudication }) {
	const issues = validateAdjudicationInputs(sourceReview, adjudication);
	return issues.length ? { status: 'failed', issues } : { status: 'passed', issues: [] };
}

function validateAdjudicationInputs(sourceReview, adjudication) {
	const issues = [];
	if (!sourceReview || typeof sourceReview !== 'object' || !Array.isArray(sourceReview.reviews)) {
		return ['sourceReview must contain a complete reviews array.'];
	}
	if (
		!adjudication ||
		typeof adjudication !== 'object' ||
		adjudication.schemaVersion !== SCIENCE_QUESTION_ART_REVIEW_ADJUDICATION_SCHEMA
	) {
		return [
			`adjudication.schemaVersion must be ${SCIENCE_QUESTION_ART_REVIEW_ADJUDICATION_SCHEMA}.`
		];
	}
	if (adjudication.sourceReviewSha256 !== canonicalHash(sourceReview)) {
		issues.push('sourceReviewSha256 does not bind the exact raw review summary.');
	}
	if (adjudication.policy !== 'major-visible-errors-only') {
		issues.push('policy must be major-visible-errors-only.');
	}
	if (
		typeof adjudication.adjudicatedAt !== 'string' ||
		Number.isNaN(Date.parse(adjudication.adjudicatedAt))
	) {
		issues.push('adjudicatedAt must be an ISO timestamp.');
	}
	if (!Array.isArray(adjudication.decisions) || adjudication.decisions.length === 0) {
		issues.push('decisions must be a non-empty array.');
		return issues;
	}
	const sourceById = new Map(sourceReview.reviews.map((review) => [review.id, review]));
	const seen = new Set();
	for (const [index, decision] of adjudication.decisions.entries()) {
		const prefix = `decisions[${index}]`;
		if (!decision || typeof decision !== 'object') {
			issues.push(`${prefix} must be an object.`);
			continue;
		}
		if (typeof decision.id !== 'string' || !decision.id.trim()) {
			issues.push(`${prefix}.id is required.`);
			continue;
		}
		if (seen.has(decision.id)) issues.push(`${prefix}.id is duplicated.`);
		seen.add(decision.id);
		const source = sourceById.get(decision.id);
		if (!source) issues.push(`${prefix}.id is absent from the source review.`);
		if (!['retain-with-annotation', 'fresh-regenerate'].includes(decision.action)) {
			issues.push(`${prefix}.action must be retain-with-annotation or fresh-regenerate.`);
		} else if (
			decision.action === 'retain-with-annotation' &&
			(source?.accepted !== false || source?.disposition !== 'fresh-regenerate')
		) {
			issues.push(`${prefix}.id is not a raw rejected pair.`);
		} else if (
			decision.action === 'fresh-regenerate' &&
			(source?.accepted !== true ||
				!['accept', 'retain-with-annotation'].includes(source?.disposition))
		) {
			issues.push(`${prefix}.id is not a raw accepted pair.`);
		}
		if (!SCIENCE_ART_REVIEW_ISSUE_CATEGORIES.includes(decision.category)) {
			issues.push(`${prefix}.category is invalid.`);
		}
		if (typeof decision.rationale !== 'string' || !decision.rationale.trim()) {
			issues.push(`${prefix}.rationale is required.`);
		}
		if (
			decision.action === 'retain-with-annotation' &&
			(typeof decision.annotation !== 'string' || !decision.annotation.trim())
		) {
			issues.push(`${prefix}.annotation is required.`);
		}
		if (
			decision.action === 'fresh-regenerate' &&
			(typeof decision.regenerationInstruction !== 'string' ||
				!decision.regenerationInstruction.trim())
		) {
			issues.push(`${prefix}.regenerationInstruction is required.`);
		}
	}
	return issues;
}
