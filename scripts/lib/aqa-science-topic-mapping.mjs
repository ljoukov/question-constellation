/** @typedef {'Biology' | 'Chemistry'} ScienceSubjectArea */
/** @typedef {'Combined Science' | 'Separate Science'} ScienceCourse */
/**
 * @typedef {object} AqaScienceTopic
 * @property {ScienceSubjectArea} subjectArea
 * @property {ScienceCourse} course
 * @property {string} code
 * @property {string} title
 */
/**
 * @typedef {object} ScienceIdentity
 * @property {ScienceSubjectArea} subjectArea
 * @property {ScienceCourse} course
 */
/**
 * @typedef {object} ScienceTopicInput
 * @property {string | null | undefined} [id]
 * @property {string | null | undefined} [questionId]
 * @property {string | null | undefined} [sourceDocumentId]
 * @property {string | null | undefined} [source_document_id]
 * @property {string | null | undefined} [sourceQuestionRef]
 * @property {string | null | undefined} [source_question_ref]
 * @property {string | null | undefined} [subjectArea]
 * @property {string | null | undefined} [subject_area]
 * @property {string | null | undefined} [sourceSubject]
 * @property {string | null | undefined} [subject]
 * @property {string | null | undefined} [componentCode]
 * @property {string | null | undefined} [component_code]
 * @property {string[] | string | null | undefined} [topicPath]
 * @property {string[] | string | null | undefined} [topic_path]
 * @property {string | null | undefined} [topic_path_json]
 * @property {string | null | undefined} [specRef]
 * @property {string | null | undefined} [spec_ref]
 * @property {string | null | undefined} [answerChainId]
 * @property {string | null | undefined} [answer_chain_id]
 * @property {{id?: string | null} | null | undefined} [answerChain]
 * @property {string | null | undefined} [promptText]
 */
/**
 * @typedef {object} ReviewedTopicBackfillRow
 * @property {string} id
 * @property {string} sourceDocumentId
 * @property {string} sourceQuestionRef
 * @property {ScienceSubjectArea} subjectArea
 * @property {string} componentCode
 * @property {ScienceCourse} course
 * @property {string | null} topicCode
 * @property {string} reviewBasis
 * @property {string | undefined} [reason]
 */
/**
 * @typedef {object} ReviewedGroupInput
 * @property {string} sourceDocumentId
 * @property {string} idPrefix
 * @property {ScienceSubjectArea} subjectArea
 * @property {string} componentCode
 * @property {ScienceCourse} course
 * @property {string} topicCode
 * @property {string[]} refs
 */
/**
 * @typedef {object} ReviewedUnmappedGroupInput
 * @property {string} sourceDocumentId
 * @property {string} idPrefix
 * @property {ScienceSubjectArea} subjectArea
 * @property {string} componentCode
 * @property {ScienceCourse} course
 * @property {string[]} refs
 * @property {string} reason
 */
/**
 * @typedef {object} ScienceTopicFields
 * @property {string[]} topicPath
 * @property {string | null} specRef
 * @property {AqaScienceTopic | null} topic
 * @property {string | null} provenance
 */

/**
 * @param {ScienceSubjectArea} subjectArea
 * @param {ScienceCourse} course
 * @param {string} code
 * @param {string} title
 * @returns {AqaScienceTopic}
 */
function topic(subjectArea, course, code, title) {
	return { subjectArea, course, code, title };
}

/**
 * Official AQA top-level science topics used by the signed-in curriculum scope.
 *
 * This deliberately stops at chapter level. It is not a keyword classifier and it must not
 * manufacture a topic for a generic working-scientifically question.
 */
/** @type {ReadonlyArray<AqaScienceTopic>} */
export const AQA_SCIENCE_TOPICS = Object.freeze([
	topic('Biology', 'Separate Science', '4.1', 'Cell biology'),
	topic('Biology', 'Separate Science', '4.2', 'Organisation'),
	topic('Biology', 'Separate Science', '4.3', 'Infection and response'),
	topic('Biology', 'Separate Science', '4.4', 'Bioenergetics'),
	topic('Biology', 'Separate Science', '4.5', 'Homeostasis and response'),
	topic('Biology', 'Separate Science', '4.6', 'Inheritance, variation and evolution'),
	topic('Biology', 'Separate Science', '4.7', 'Ecology'),
	topic('Chemistry', 'Separate Science', '4.1', 'Atomic structure and the periodic table'),
	topic('Chemistry', 'Separate Science', '4.2', 'Bonding, structure, and the properties of matter'),
	topic('Chemistry', 'Separate Science', '4.3', 'Quantitative chemistry'),
	topic('Chemistry', 'Separate Science', '4.4', 'Chemical changes'),
	topic('Chemistry', 'Separate Science', '4.5', 'Energy changes'),
	topic('Chemistry', 'Separate Science', '4.6', 'The rate and extent of chemical change'),
	topic('Chemistry', 'Separate Science', '4.7', 'Organic chemistry'),
	topic('Chemistry', 'Separate Science', '4.8', 'Chemical analysis'),
	topic('Chemistry', 'Separate Science', '4.9', 'Chemistry of the atmosphere'),
	topic('Chemistry', 'Separate Science', '4.10', 'Using resources'),
	topic('Biology', 'Combined Science', '4.1', 'Cell biology'),
	topic('Biology', 'Combined Science', '4.2', 'Organisation'),
	topic('Biology', 'Combined Science', '4.3', 'Infection and response'),
	topic('Biology', 'Combined Science', '4.4', 'Bioenergetics'),
	topic('Biology', 'Combined Science', '4.5', 'Homeostasis and response'),
	topic('Biology', 'Combined Science', '4.6', 'Inheritance, variation and evolution'),
	topic('Biology', 'Combined Science', '4.7', 'Ecology'),
	topic('Chemistry', 'Combined Science', '5.1', 'Atomic structure and the periodic table'),
	topic('Chemistry', 'Combined Science', '5.2', 'Bonding, structure, and the properties of matter'),
	topic('Chemistry', 'Combined Science', '5.3', 'Quantitative chemistry'),
	topic('Chemistry', 'Combined Science', '5.4', 'Chemical changes'),
	topic('Chemistry', 'Combined Science', '5.5', 'Energy changes'),
	topic('Chemistry', 'Combined Science', '5.6', 'The rate and extent of chemical change'),
	topic('Chemistry', 'Combined Science', '5.7', 'Organic chemistry'),
	topic('Chemistry', 'Combined Science', '5.8', 'Chemical analysis'),
	topic('Chemistry', 'Combined Science', '5.9', 'Chemistry of the atmosphere'),
	topic('Chemistry', 'Combined Science', '5.10', 'Using resources')
]);

/**
 * @param {ScienceSubjectArea} subjectArea
 * @param {ScienceCourse} course
 * @param {string} code
 */
function topicKey(subjectArea, course, code) {
	return `${subjectArea}|${course}|${code}`;
}

const topicsByKey = new Map(
	AQA_SCIENCE_TOPICS.map((entry) => [topicKey(entry.subjectArea, entry.course, entry.code), entry])
);

/** @param {unknown} value */
function normalized(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/**
 * @param {ScienceTopicInput} value
 * @returns {ScienceIdentity | null}
 */
function scienceIdentity(value) {
	const subjectArea = String(value.subjectArea ?? value.subject_area ?? value.subject ?? '').trim();
	if (subjectArea !== 'Biology' && subjectArea !== 'Chemistry') return null;
	const componentCode = String(value.componentCode ?? value.component_code ?? '');
	const sourceSubject = String(value.sourceSubject ?? value.subject ?? '');
	const course =
		/^8464/i.test(componentCode) || /combined science/i.test(sourceSubject)
			? 'Combined Science'
			: 'Separate Science';
	return { subjectArea, course };
}

/**
 * @param {ReviewedGroupInput} input
 * @returns {ReviewedTopicBackfillRow[]}
 */
function reviewedGroup({
	sourceDocumentId,
	idPrefix,
	subjectArea,
	componentCode,
	course,
	topicCode,
	refs
}) {
	return refs.map((sourceQuestionRef) => ({
		id: `${idPrefix}-${sourceQuestionRef.replace('.', '-')}`,
		sourceDocumentId,
		sourceQuestionRef,
		subjectArea,
		componentCode,
		course,
		topicCode,
		reviewBasis: 'manual question-and-mark-evidence review'
	}));
}

/** @type {Omit<ReviewedGroupInput, 'topicCode' | 'refs'>} */
const separateBiologyIdentity = {
	sourceDocumentId: 'aqa-84611h-qp-nov20',
	idPrefix: '84611h-nov20',
	subjectArea: 'Biology',
	componentCode: '8461/1H',
	course: 'Separate Science'
};

const reviewedMappedGroups = [
	reviewedGroup({
		...separateBiologyIdentity,
		topicCode: '4.1',
		refs: ['02.1', '02.2', '02.4', '02.5', '03.1', '03.2', '03.3', '03.4', '03.5', '03.6']
	}),
	reviewedGroup({
		...separateBiologyIdentity,
		topicCode: '4.2',
		refs: ['02.3', '04.1', '04.2', '04.3', '04.4', '04.5', '06.7']
	}),
	reviewedGroup({
		...separateBiologyIdentity,
		topicCode: '4.3',
		refs: ['05.1', '05.2', '05.3', '05.4', '05.7', '07.1', '07.2', '07.3', '07.4']
	}),
	reviewedGroup({
		...separateBiologyIdentity,
		topicCode: '4.4',
		refs: ['01.1', '01.2', '01.8', '04.6', '04.7', '05.5', '05.6']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b1h-qp-jun18',
		idPrefix: '8464b1h-jun18',
		subjectArea: 'Biology',
		componentCode: '8464B1H',
		course: 'Combined Science',
		topicCode: '4.1',
		refs: ['06.1']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b1h-qp-jun19',
		idPrefix: '8464b1h-jun19',
		subjectArea: 'Biology',
		componentCode: '8464B1H',
		course: 'Combined Science',
		topicCode: '4.4',
		refs: ['04.4']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b1h-qp-jun24',
		idPrefix: '8464b1h-jun24',
		subjectArea: 'Biology',
		componentCode: '8464B1H',
		course: 'Combined Science',
		topicCode: '4.1',
		refs: ['04.6']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b1h-qp-jun24',
		idPrefix: '8464b1h-jun24',
		subjectArea: 'Biology',
		componentCode: '8464B1H',
		course: 'Combined Science',
		topicCode: '4.3',
		refs: ['03.3']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b1h-qp-nov20',
		idPrefix: '8464b1h-nov20',
		subjectArea: 'Biology',
		componentCode: '8464B1H',
		course: 'Combined Science',
		topicCode: '4.3',
		refs: ['04.2']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b1h-qp-nov21',
		idPrefix: '8464b1h-nov21',
		subjectArea: 'Biology',
		componentCode: '8464B1H',
		course: 'Combined Science',
		topicCode: '4.4',
		refs: ['03.2', '04.5']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b2h-qp-jun18',
		idPrefix: '8464b2h-jun18',
		subjectArea: 'Biology',
		componentCode: '8464B2H',
		course: 'Combined Science',
		topicCode: '4.4',
		refs: ['01.2']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b2h-qp-jun19',
		idPrefix: '8464b2h-jun19',
		subjectArea: 'Biology',
		componentCode: '8464B2H',
		course: 'Combined Science',
		topicCode: '4.6',
		refs: ['04.3']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b2h-qp-jun22',
		idPrefix: '8464b2h-jun22',
		subjectArea: 'Biology',
		componentCode: '8464B2H',
		course: 'Combined Science',
		topicCode: '4.5',
		refs: ['05.5']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b2h-qp-jun22',
		idPrefix: '8464b2h-jun22',
		subjectArea: 'Biology',
		componentCode: '8464B2H',
		course: 'Combined Science',
		topicCode: '4.6',
		refs: ['05.6']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b2h-qp-jun23',
		idPrefix: '8464b2h-jun23',
		subjectArea: 'Biology',
		componentCode: '8464B2H',
		course: 'Combined Science',
		topicCode: '4.6',
		refs: ['01.3', '01.4']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b2h-qp-jun24',
		idPrefix: '8464b2h-jun24',
		subjectArea: 'Biology',
		componentCode: '8464B2H',
		course: 'Combined Science',
		topicCode: '4.5',
		refs: ['03.5']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b2h-qp-nov20',
		idPrefix: '8464b2h-nov20',
		subjectArea: 'Biology',
		componentCode: '8464B2H',
		course: 'Combined Science',
		topicCode: '4.6',
		refs: ['01.7', '04.1', '05.3']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464b2h-qp-nov21',
		idPrefix: '8464b2h-nov21',
		subjectArea: 'Biology',
		componentCode: '8464B2H',
		course: 'Combined Science',
		topicCode: '4.6',
		refs: ['06.1']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c1h-qp-jun18',
		idPrefix: '8464c1h-jun18',
		subjectArea: 'Chemistry',
		componentCode: '8464C1H',
		course: 'Combined Science',
		topicCode: '5.1',
		refs: ['08.2']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c1h-qp-jun18',
		idPrefix: '8464c1h-jun18',
		subjectArea: 'Chemistry',
		componentCode: '8464C1H',
		course: 'Combined Science',
		topicCode: '5.2',
		refs: ['04.1']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c1h-qp-jun18',
		idPrefix: '8464c1h-jun18',
		subjectArea: 'Chemistry',
		componentCode: '8464C1H',
		course: 'Combined Science',
		topicCode: '5.3',
		refs: ['08.3']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c1h-qp-jun19',
		idPrefix: '8464c1h-jun19',
		subjectArea: 'Chemistry',
		componentCode: '8464C1H',
		course: 'Combined Science',
		topicCode: '5.3',
		refs: ['01.5']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c1h-qp-jun22',
		idPrefix: '8464c1h-jun22',
		subjectArea: 'Chemistry',
		componentCode: '8464C1H',
		course: 'Combined Science',
		topicCode: '5.2',
		refs: ['05.3']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c1h-qp-jun22',
		idPrefix: '8464c1h-jun22',
		subjectArea: 'Chemistry',
		componentCode: '8464C1H',
		course: 'Combined Science',
		topicCode: '5.3',
		refs: ['02.5']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c1h-qp-jun22',
		idPrefix: '8464c1h-jun22',
		subjectArea: 'Chemistry',
		componentCode: '8464C1H',
		course: 'Combined Science',
		topicCode: '5.4',
		refs: ['01.2', '06.4']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c1h-qp-jun23',
		idPrefix: '8464c1h-jun23',
		subjectArea: 'Chemistry',
		componentCode: '8464C1H',
		course: 'Combined Science',
		topicCode: '5.2',
		refs: ['01.5']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c1h-qp-jun23',
		idPrefix: '8464c1h-jun23',
		subjectArea: 'Chemistry',
		componentCode: '8464C1H',
		course: 'Combined Science',
		topicCode: '5.3',
		refs: ['02.4']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c1h-qp-nov20',
		idPrefix: '8464c1h-nov20',
		subjectArea: 'Chemistry',
		componentCode: '8464C1H',
		course: 'Combined Science',
		topicCode: '5.3',
		refs: ['06.3']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c1h-qp-nov20',
		idPrefix: '8464c1h-nov20',
		subjectArea: 'Chemistry',
		componentCode: '8464C1H',
		course: 'Combined Science',
		topicCode: '5.4',
		refs: ['04.8']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c1h-qp-nov21',
		idPrefix: '8464c1h-nov21',
		subjectArea: 'Chemistry',
		componentCode: '8464C1H',
		course: 'Combined Science',
		topicCode: '5.2',
		refs: ['04.3']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-jun18',
		idPrefix: '8464c2h-jun18',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.7',
		refs: ['01.4', '01.5']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-jun19',
		idPrefix: '8464c2h-jun19',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.7',
		refs: ['07.1']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-jun22',
		idPrefix: '8464c2h-jun22',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.3',
		refs: ['02.3']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-jun22',
		idPrefix: '8464c2h-jun22',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.6',
		refs: ['06.4', '06.5', '06.6']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-jun22',
		idPrefix: '8464c2h-jun22',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.7',
		refs: ['04.2', '04.3']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-jun22',
		idPrefix: '8464c2h-jun22',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.8',
		refs: ['01.4']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-jun23',
		idPrefix: '8464c2h-jun23',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.6',
		refs: ['04.5']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-jun23',
		idPrefix: '8464c2h-jun23',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.8',
		refs: ['02.4']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-jun24',
		idPrefix: '8464c2h-jun24',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.6',
		refs: ['05.4']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-jun24',
		idPrefix: '8464c2h-jun24',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.7',
		refs: ['01.1', '01.4', '03.1']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-jun24',
		idPrefix: '8464c2h-jun24',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.8',
		refs: ['04.2']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-nov20',
		idPrefix: '8464c2h-nov20',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.6',
		refs: ['07.1', '07.2']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-nov20',
		idPrefix: '8464c2h-nov20',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.7',
		refs: ['01.1', '01.3', '01.5', '05.1', '05.2', '05.3']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-nov21',
		idPrefix: '8464c2h-nov21',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.6',
		refs: ['06.6']
	}),
	reviewedGroup({
		sourceDocumentId: 'aqa-8464c2h-qp-nov21',
		idPrefix: '8464c2h-nov21',
		subjectArea: 'Chemistry',
		componentCode: '8464C2H',
		course: 'Combined Science',
		topicCode: '5.7',
		refs: ['02.5']
	})
].flat();

/** @type {ReviewedUnmappedGroupInput[]} */
const reviewedUnmappedGroups = [
	{
		...separateBiologyIdentity,
		refs: ['01.3', '01.4', '01.5', '01.6', '01.7', '01.9'],
		reason:
			'Working-scientifically calculation, anomaly, control-variable or graph skill; the photosynthesis setting is not enough to make the chapter the assessed content.'
	},
	{
		...separateBiologyIdentity,
		refs: ['04.8'],
		reason:
			'Open investigation-extension task spans food-test method and plant production context; no single top-level chapter is sufficiently clear.'
	},
	{
		...separateBiologyIdentity,
		refs: ['06.1', '06.2', '06.3', '06.4', '06.5', '06.6'],
		reason:
			'Working-scientifically controls, calculation, graph interpretation and study-validity items; liver context alone is not a reliable chapter classification.'
	}
];

const reviewedUnmappedRows = reviewedUnmappedGroups.flatMap((group) =>
	group.refs.map((sourceQuestionRef) => ({
		id: `${group.idPrefix}-${sourceQuestionRef.replace('.', '-')}`,
		sourceDocumentId: group.sourceDocumentId,
		sourceQuestionRef,
		subjectArea: group.subjectArea,
		componentCode: group.componentCode,
		course: group.course,
		topicCode: null,
		reason: group.reason,
		reviewBasis: 'manual question-and-mark-evidence review'
	}))
);

/** @type {ReadonlyArray<ReviewedTopicBackfillRow>} */
export const REVIEWED_TOPIC_BACKFILL_ROWS = Object.freeze(
	[...reviewedMappedGroups, ...reviewedUnmappedRows].sort((left, right) =>
		left.id.localeCompare(right.id)
	)
);

const reviewedByQuestionId = new Map(REVIEWED_TOPIC_BACKFILL_ROWS.map((row) => [row.id, row]));

/**
 * Only chains whose method itself identifies one official chapter are included here. Generic
 * calculation, graph, control-variable, filtration and recall chains are intentionally absent.
 */
const REVIEWED_CHAIN_TOPIC = new Map(
	Object.entries({
		'bio-chain-photosynthesis-balanced-equation-recall': ['Biology', '4.4'],
		'bio-chain-photosynthesis-light-energy-captured-chlorophyll': ['Biology', '4.4'],
		'bio-chain-diffusion-into-cells-process-recall': ['Biology', '4.1'],
		'bio-chain-diffusion-rate-increase-gradient-open-exchange-pathway': ['Biology', '4.1'],
		'bio-chain-exchange-surface-adaptations-recall': ['Biology', '4.2'],
		'bio-chain-active-transport-energy-evidence': ['Biology', '4.1'],
		'bio-chain-cell-type-similarity-shared-structures': ['Biology', '4.1'],
		'bio-chain-cell-type-difference-distinct-features': ['Biology', '4.1'],
		'bio-chain-cell-cycle-dna-chromosomes-identical-cells': ['Biology', '4.1'],
		'bio-chain-digestion-substrate-products-recall': ['Biology', '4.2'],
		'bio-chain-enzyme-lock-key-substrate-products-release': ['Biology', '4.2'],
		'bio-chain-enzyme-active-site-complementary-substrate-specificity': ['Biology', '4.2'],
		'bio-chain-food-test-reagent-colour-result': ['Biology', '4.2'],
		'bio-chain-food-test-reagent-heat-colour-result': ['Biology', '4.2'],
		'bio-chain-light-photosynthesis-glucose-starch-storage': ['Biology', '4.4'],
		'bio-chain-no-light-storage-conversion-respiration-no-replenishment': ['Biology', '4.4'],
		'bio-chain-physical-plant-defence-deters-damage': ['Biology', '4.3'],
		'bio-chain-plant-stress-reason-growth-symptom-links': ['Biology', '4.3'],
		'bio-chain-mutualism-plant-sugar-respiration-benefit': ['Biology', '4.4'],
		'bio-chain-mutualism-fixed-nitrogen-mineral-plant-growth': ['Biology', '4.4'],
		'bio-chain-labelled-antibody-bind-detect-target': ['Biology', '4.3'],
		'bio-chain-phagocytosis-pathogen-clearance-reduced-damage': ['Biology', '4.3'],
		'bio-chain-clinical-trial-staged-safety-efficacy-validity': ['Biology', '4.3'],
		'bio-chain-human-derived-biological-treatment-less-rejection-or-known-target': [
			'Biology',
			'4.3'
		],
		'bio-chain-vaccine-antigen-antibodies-memory-immunity': ['Biology', '4.3'],
		'bio-chain-plant-stem-cell-location-meristem-recall': ['Biology', '4.1'],
		'bio-chain-oxygen-control-respiration-mode': ['Biology', '4.4'],
		'bio-chain-photosynthesis-limitation-glucose-protein-growth': ['Biology', '4.4'],
		'bio-chain-ivf-eggs-fertilisation-embryo-transfer': ['Biology', '4.5'],
		'bio-chain-meiosis-divisions-haploid-variation': ['Biology', '4.6'],
		'bio-chain-natural-selection-variation-survival-inheritance-frequency': ['Biology', '4.6'],
		'bio-chain-heterozygous-different-alleles-recall': ['Biology', '4.6'],
		'bio-chain-punnett-gametes-offspring-phenotype-probability': ['Biology', '4.6'],
		'chem-chain-non-aqueous-state-symbol-from-physical-state': ['Chemistry', '5.2'],
		'chem-chain-stoichiometric-mass-from-moles-and-ratio': ['Chemistry', '5.3'],
		'chem-chain-concentration-mass-volume-unit-conversion': ['Chemistry', '5.3'],
		'chem-chain-alloy-hardness-distorted-layers': ['Chemistry', '5.2'],
		'chem-chain-ph-change-factor-ten': ['Chemistry', '5.4'],
		'chem-chain-chromatography-rf-relationship': ['Chemistry', '5.8'],
		'chem-chain-equilibrium-closed-system-equal-rates': ['Chemistry', '5.6'],
		'chem-chain-equilibrium-pressure-fewer-gas-moles': ['Chemistry', '5.6'],
		'chem-chain-equilibrium-temperature-exothermic-shifts-endothermic': ['Chemistry', '5.6'],
		'chem-chain-exothermic-temperature-increase-shifts-left': ['Chemistry', '5.6'],
		'chem-chain-alkane-general-formula-cnh2n-plus-2': ['Chemistry', '5.7'],
		'chem-chain-hydrocarbon-combustion-equation-balance': ['Chemistry', '5.7'],
		'chem-chain-cracking-equation-atom-balance': ['Chemistry', '5.7'],
		'chem-chain-hydrocarbon-carbon-hydrogen-only': ['Chemistry', '5.7'],
		'chem-chain-crude-oil-formation-plankton-burial-compression-time': ['Chemistry', '5.7'],
		'chem-chain-crude-oil-fractional-distillation': ['Chemistry', '5.7'],
		'chem-chain-alkene-bromine-water-test': ['Chemistry', '5.7']
	}).map(([chainId, [subjectArea, combinedCode]]) => [chainId, { subjectArea, combinedCode }])
);

/**
 * @param {ScienceIdentity} identity
 * @param {string} code
 * @returns {AqaScienceTopic | null}
 */
function officialTopicFor(identity, code) {
	return topicsByKey.get(topicKey(identity.subjectArea, identity.course, code)) ?? null;
}

/**
 * @param {ScienceTopicInput} value
 * @param {ScienceIdentity} identity
 * @returns {{topic: AqaScienceTopic | null, conflict: boolean}}
 */
function explicitTopic(value, identity) {
	const allowed = AQA_SCIENCE_TOPICS.filter(
		(entry) => entry.subjectArea === identity.subjectArea && entry.course === identity.course
	);
	const specRef = String(value.specRef ?? value.spec_ref ?? '').trim();
	const specReferences = specRef.match(/\b\d+(?:\.\d+)+\b/g) ?? [];
	/** @type {Map<string, AqaScienceTopic>} */
	const specTopics = new Map();
	for (const reference of specReferences) {
		const matched = allowed.find(
			(entry) => reference === entry.code || reference.startsWith(`${entry.code}.`)
		);
		if (matched) specTopics.set(matched.code, matched);
	}
	if (specTopics.size > 1) return { topic: null, conflict: true };
	const fromSpec = specTopics.values().next().value ?? null;
	const topicPath = value.topicPath ?? value.topic_path ?? value.topic_path_json ?? [];
	let pathValues = topicPath;
	if (typeof pathValues === 'string') {
		try {
			pathValues = JSON.parse(pathValues);
		} catch {
			pathValues = [];
		}
	}
	const pathText = normalized(Array.isArray(pathValues) ? pathValues.join(' ') : '');
	const fromPath = pathText
		? allowed.find((entry) => pathText.includes(normalized(entry.title)))
		: null;
	if (fromSpec && fromPath && fromSpec.code !== fromPath.code) {
		return { topic: null, conflict: true };
	}
	return { topic: fromSpec ?? fromPath ?? null, conflict: false };
}

/**
 * @param {ScienceTopicInput} value
 * @param {ScienceIdentity} identity
 * @returns {AqaScienceTopic | null}
 */
function reviewedQuestionTopic(value, identity) {
	const id = String(value.id ?? value.questionId ?? '').trim();
	const reviewed = reviewedByQuestionId.get(id);
	if (!reviewed?.topicCode) return null;
	if (reviewed.subjectArea !== identity.subjectArea || reviewed.course !== identity.course)
		return null;
	const sourceDocumentId = String(value.sourceDocumentId ?? value.source_document_id ?? '').trim();
	const sourceQuestionRef = String(
		value.sourceQuestionRef ?? value.source_question_ref ?? ''
	).trim();
	const componentCode = String(value.componentCode ?? value.component_code ?? '').trim();
	if (
		(reviewed.sourceDocumentId && sourceDocumentId !== reviewed.sourceDocumentId) ||
		(reviewed.sourceQuestionRef && sourceQuestionRef !== reviewed.sourceQuestionRef) ||
		(reviewed.componentCode && componentCode !== reviewed.componentCode)
	) {
		return null;
	}
	return officialTopicFor(identity, reviewed.topicCode);
}

/**
 * @param {ScienceTopicInput} value
 * @param {ScienceIdentity} identity
 * @returns {AqaScienceTopic | null}
 */
function reviewedChainTopic(value, identity) {
	const chainId = String(
		value.answerChainId ?? value.answer_chain_id ?? value.answerChain?.id ?? ''
	).trim();
	const reviewed = REVIEWED_CHAIN_TOPIC.get(chainId);
	if (!reviewed || reviewed.subjectArea !== identity.subjectArea) return null;
	const code =
		identity.course === 'Combined Science'
			? reviewed.combinedCode
			: reviewed.combinedCode.replace(/^5\./, '4.');
	return officialTopicFor(identity, code);
}

/**
 * Return canonical top-level fields only when the source is auditable: an explicit official ref or
 * title, an exact manually reviewed question identity, or a deliberately curated chapter-specific
 * answer-chain id. Otherwise preserve the supplied fields and report no derivation.
 * @param {ScienceTopicInput} value
 * @returns {ScienceTopicFields}
 */
export function aqaScienceTopicFieldsForImport(value) {
	const identity = scienceIdentity(value);
	const originalTopicPath = sourceTopicPath(value);
	const rawSpecRef = value.specRef ?? value.spec_ref ?? null;
	const originalSpecRef =
		typeof rawSpecRef === 'string' && rawSpecRef.trim() ? rawSpecRef.trim() : null;
	if (!identity) {
		return {
			topicPath: originalTopicPath,
			specRef: originalSpecRef,
			topic: null,
			provenance: null
		};
	}

	const explicitResult = explicitTopic(value, identity);
	if (explicitResult.conflict) {
		return {
			topicPath: originalTopicPath,
			specRef: originalSpecRef,
			topic: null,
			provenance: 'conflicting_trusted_evidence'
		};
	}
	const explicit = explicitResult.topic;
	const reviewedQuestion = reviewedQuestionTopic(value, identity);
	const reviewedChain = reviewedChainTopic(value, identity);
	const selected = explicit ?? reviewedQuestion ?? reviewedChain;
	if (!selected) {
		return {
			topicPath: originalTopicPath,
			specRef: originalSpecRef,
			topic: null,
			provenance: null
		};
	}
	const sources = [
		explicit ? 'explicit_official_topic' : null,
		reviewedQuestion ? 'reviewed_question_mapping' : null,
		reviewedChain ? 'reviewed_chain_mapping' : null
	].filter(Boolean);
	if (
		(explicit && explicit.code !== selected.code) ||
		(reviewedQuestion && reviewedQuestion.code !== selected.code) ||
		(reviewedChain && reviewedChain.code !== selected.code)
	) {
		return {
			topicPath: originalTopicPath,
			specRef: originalSpecRef,
			topic: null,
			provenance: 'conflicting_trusted_evidence'
		};
	}
	return {
		topicPath: [selected.subjectArea, selected.title],
		specRef: selected.code,
		topic: selected,
		provenance: sources.join('+')
	};
}

/**
 * @param {string} questionId
 * @returns {ReviewedTopicBackfillRow | null}
 */
export function reviewedTopicBackfillRow(questionId) {
	return reviewedByQuestionId.get(questionId) ?? null;
}

/**
 * @param {ScienceTopicInput} value
 * @returns {string[]}
 */
function sourceTopicPath(value) {
	const raw = value.topicPath ?? value.topic_path ?? value.topic_path_json ?? [];
	if (Array.isArray(raw)) return raw.filter((item) => typeof item === 'string');
	if (typeof raw !== 'string' || !raw.trim()) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
	} catch {
		return [];
	}
}
