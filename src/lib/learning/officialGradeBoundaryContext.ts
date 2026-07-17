import rawBoundaryData from './officialGradeBoundariesJune2024.json';

export type GradeBoundaryApplicability =
	| 'qualification_total_only'
	| 'combined_subject_slice'
	| 'future_specification'
	| 'history_option_route';

type BoundarySource = {
	board: 'AQA' | 'OCR';
	documentId: string;
	title: string;
	url: string;
	sha256: string;
};

type BoundarySet = {
	sourceId: string;
	qualificationCode: string;
	awardType: 'single' | 'double';
	maximumMark: number;
	highestPublishedAward: string;
	lowestPublishedAward: string;
	thresholds: Record<string, number>;
};

type OfferingContextRow = {
	offeringId: string;
	sourceId?: string;
	boundarySetId: string | null;
	applicability: GradeBoundaryApplicability;
};

type BoundaryData = {
	schemaVersion: number;
	series: string;
	sources: Record<string, BoundarySource>;
	boundarySets: Record<string, BoundarySet>;
	offeringContexts: OfferingContextRow[];
};

export type OfficialGradeBoundaryContext = {
	offeringId: string;
	series: string;
	applicability: GradeBoundaryApplicability;
	source: BoundarySource;
	boundarySet: BoundarySet | null;
	learnerCaveat: string;
};

const boundaryData = rawBoundaryData as BoundaryData;
const contextByOfferingId = new Map(
	boundaryData.offeringContexts.map((context) => [context.offeringId, context] as const)
);

function sourceForContext(
	context: OfferingContextRow,
	boundarySet: BoundarySet | null
): BoundarySource {
	const sourceId = boundarySet?.sourceId ?? context.sourceId;
	const source = sourceId ? boundaryData.sources[sourceId] : null;
	if (!source) {
		throw new Error(`Missing official grade-boundary source for ${context.offeringId}.`);
	}
	return source;
}

function caveatForContext(
	context: OfferingContextRow,
	boundarySet: BoundarySet | null,
	source: BoundarySource
): string {
	switch (context.applicability) {
		case 'qualification_total_only':
			if (!boundarySet) {
				throw new Error(`Missing qualification boundary set for ${context.offeringId}.`);
			}
			return `The ${boundaryData.series} ${source.board} ${boundarySet.qualificationCode} boundary uses the complete ${boundarySet.maximumMark}-mark qualification total, so it cannot convert this question sample to a GCSE grade.`;
		case 'combined_subject_slice':
			if (!boundarySet) {
				throw new Error(`Missing Combined Science boundary set for ${context.offeringId}.`);
			}
			return `The ${boundaryData.series} ${source.board} ${boundarySet.qualificationCode} boundary awards a double grade from all six papers (${boundarySet.maximumMark} marks); this subject-only sample cannot be converted to that award.`;
		case 'future_specification':
			return `The supported AQA 8525 course has first exams in 2027, so its assessment has no applicable ${boundaryData.series} grade boundary.`;
		case 'history_option_route':
			return `The ${boundaryData.series} AQA 8145 boundaries vary by the learner's exact History option route; this profile does not identify one complete entry code, and a question sample is not a qualification total.`;
	}
}

export function officialGradeBoundaryContextForOffering(
	offeringId: string | null | undefined
): OfficialGradeBoundaryContext | null {
	if (!offeringId) return null;
	const context = contextByOfferingId.get(offeringId);
	if (!context) return null;
	const boundarySet = context.boundarySetId
		? (boundaryData.boundarySets[context.boundarySetId] ?? null)
		: null;
	if (context.boundarySetId && !boundarySet) {
		throw new Error(`Missing official boundary set ${context.boundarySetId}.`);
	}
	const source = sourceForContext(context, boundarySet);
	return {
		offeringId,
		series: boundaryData.series,
		applicability: context.applicability,
		source,
		boundarySet,
		learnerCaveat: caveatForContext(context, boundarySet, source)
	};
}

export function supportedGradeBoundaryOfferingIds(): string[] {
	return [...contextByOfferingId.keys()].sort();
}
