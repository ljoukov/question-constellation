import type { ChallengeDefinition, ChallengeSubject, ChallengeSubjectArtTheme } from './types';
import type { ChallengeVisualDefinition } from './visuals';

const RUNTIME_SCHEMA = 'generated-science-challenge-runtime/v1';
const ACCEPTED_RELEASE_SCHEMA = 'science-challenge-release/v1';
const RELEASE_PATH = /\/data\/challenges\/releases\/([^/]+)\/runtime\.json$/;
const ACCEPTED_RELEASE_PATH = /\/data\/challenges\/releases\/([^/]+)\/accepted-challenges\.json$/;
const SHA256 = /^[a-f0-9]{64}$/;

type RuntimeIdentity = Pick<ChallengeDefinition, 'id' | 'slug' | 'subject'>;

export type GeneratedScienceChallengeCurriculum = {
	id: string;
	subject: ChallengeSubject;
	curriculumComponentId: string;
	specificationId: string;
	specificationSha256: string;
	specRef: string;
	topicLabel: string;
	sourceTextSha256: string;
	pageStart: number;
	pageEnd: number;
};

type GeneratedScienceChallengeRuntime = {
	schemaVersion: typeof RUNTIME_SCHEMA;
	releaseId: string;
	definitions: ChallengeDefinition[];
	identities: RuntimeIdentity[];
	curriculum: GeneratedScienceChallengeCurriculum[];
	visuals: Array<ChallengeVisualDefinition & { id: string }>;
};

type AcceptedScienceChallengeReleaseMarker = {
	releaseId: string;
	definitions: ChallengeDefinition[];
};

export type LoadedGeneratedScienceChallenges = {
	releaseIds: string[];
	definitions: ChallengeDefinition[];
	curriculum: GeneratedScienceChallengeCurriculum[];
	visuals: Record<string, ChallengeVisualDefinition>;
};

/**
 * Parse every tracked accepted science release discovered by Vite. A missing release is valid while
 * authoring is in progress; a present but incomplete or colliding release fails the build.
 */
export function loadGeneratedScienceChallengeRuntimes(
	modules: Record<string, unknown>,
	acceptedReleaseModules: Record<string, unknown> = {}
): LoadedGeneratedScienceChallenges {
	const releaseIds: string[] = [];
	const definitions: ChallengeDefinition[] = [];
	const curriculum: GeneratedScienceChallengeCurriculum[] = [];
	const visuals: Record<string, ChallengeVisualDefinition> = {};
	const definitionIds = new Set<string>();
	const routeKeys = new Set<string>();
	const acceptedMarkersByReleaseId = new Map<
		string,
		Array<{ modulePath: string; marker: AcceptedScienceChallengeReleaseMarker }>
	>();
	for (const [modulePath, value] of Object.entries(acceptedReleaseModules).sort(([left], [right]) =>
		left.localeCompare(right)
	)) {
		const pathMatch = modulePath.replaceAll('\\', '/').match(ACCEPTED_RELEASE_PATH);
		if (!pathMatch || !safeId(pathMatch[1])) {
			throw new Error(`Generated challenge accepted marker has an unsafe path: ${modulePath}`);
		}
		const marker = validateAcceptedReleaseMarker(value, modulePath);
		const markers = acceptedMarkersByReleaseId.get(pathMatch[1]) ?? [];
		markers.push({ modulePath, marker });
		acceptedMarkersByReleaseId.set(pathMatch[1], markers);
	}
	const matchedAcceptedReleaseIds = new Set<string>();

	for (const [modulePath, value] of Object.entries(modules).sort(([left], [right]) =>
		left.localeCompare(right)
	)) {
		const pathMatch = modulePath.replaceAll('\\', '/').match(RELEASE_PATH);
		if (!pathMatch || !safeId(pathMatch[1]))
			throw new Error(`Generated challenge runtime has an unsafe path: ${modulePath}`);
		const runtime = validateRuntime(value, modulePath);
		if (runtime.releaseId !== pathMatch[1]) {
			throw new Error(
				`Generated challenge runtime release id differs from its path: ${modulePath}`
			);
		}
		const acceptedMarkers = acceptedMarkersByReleaseId.get(runtime.releaseId) ?? [];
		if (acceptedMarkers.length !== 1) {
			throw new Error(
				acceptedMarkers.length === 0
					? `Generated challenge runtime is orphaned from its accepted release marker: ${modulePath}`
					: `Generated challenge runtime must have exactly one accepted release marker: ${modulePath}`
			);
		}
		const acceptedMarker = acceptedMarkers[0];
		if (acceptedMarker.marker.releaseId !== runtime.releaseId) {
			throw new Error(
				`Generated challenge accepted marker release id differs from its runtime: ${acceptedMarker.modulePath}`
			);
		}
		assertAcceptedDefinitionMembership(runtime, acceptedMarker.marker, modulePath);
		matchedAcceptedReleaseIds.add(runtime.releaseId);
		if (releaseIds.includes(runtime.releaseId)) {
			throw new Error(`Generated challenge release id is duplicated: ${runtime.releaseId}`);
		}
		releaseIds.push(runtime.releaseId);

		for (const definition of runtime.definitions) {
			const routeKey = `${definition.subject}/${definition.slug}`;
			if (definitionIds.has(definition.id) || routeKeys.has(routeKey)) {
				throw new Error(`Generated challenge identity is duplicated: ${definition.id}`);
			}
			definitionIds.add(definition.id);
			routeKeys.add(routeKey);
			definitions.push(definition);
		}
		curriculum.push(...runtime.curriculum);
		for (const { id, ...visual } of runtime.visuals) {
			if (visuals[id]) throw new Error(`Generated challenge visual is duplicated: ${id}`);
			visuals[id] = visual;
		}
	}
	for (const [releaseId, markers] of acceptedMarkersByReleaseId) {
		if (!matchedAcceptedReleaseIds.has(releaseId)) {
			throw new Error(
				`Generated challenge accepted marker is orphaned from its runtime: ${markers[0].modulePath}`
			);
		}
	}

	return { releaseIds, definitions, curriculum, visuals };
}

function validateAcceptedReleaseMarker(
	value: unknown,
	modulePath: string
): AcceptedScienceChallengeReleaseMarker {
	if (
		!isRecord(value) ||
		value.schemaVersion !== ACCEPTED_RELEASE_SCHEMA ||
		!isRecord(value.release) ||
		!safeId(value.release.id)
	) {
		throw new Error(`Generated challenge accepted marker header is invalid: ${modulePath}`);
	}
	if (value.release.status !== 'accepted') {
		throw new Error(`Generated challenge release marker is not accepted: ${modulePath}`);
	}
	if (!Array.isArray(value.challenges) || value.challenges.length === 0) {
		throw new Error(`Generated challenge accepted marker membership is incomplete: ${modulePath}`);
	}
	const definitions: ChallengeDefinition[] = [];
	const definitionIds = new Set<string>();
	for (const entry of value.challenges) {
		if (!isRecord(entry) || !validDefinition(entry.definition)) {
			throw new Error(`Generated challenge accepted marker definition is malformed: ${modulePath}`);
		}
		if (definitionIds.has(entry.definition.id)) {
			throw new Error(
				`Generated challenge accepted marker definition is duplicated: ${entry.definition.id}`
			);
		}
		definitionIds.add(entry.definition.id);
		definitions.push(entry.definition);
	}
	return { releaseId: value.release.id, definitions };
}

function assertAcceptedDefinitionMembership(
	runtime: GeneratedScienceChallengeRuntime,
	marker: AcceptedScienceChallengeReleaseMarker,
	modulePath: string
) {
	const acceptedDefinitions = new Map(
		marker.definitions.map((definition) => [definition.id, definition])
	);
	if (
		acceptedDefinitions.size !== runtime.definitions.length ||
		runtime.definitions.some((definition) => {
			const accepted = acceptedDefinitions.get(definition.id);
			return !accepted || !sameJsonValue(accepted, definition);
		})
	) {
		throw new Error(
			`Generated challenge runtime definition membership differs from its accepted release: ${modulePath}`
		);
	}
}

function validateRuntime(value: unknown, modulePath: string): GeneratedScienceChallengeRuntime {
	if (!isRecord(value) || value.schemaVersion !== RUNTIME_SCHEMA || !safeId(value.releaseId)) {
		throw new Error(`Generated challenge runtime header is invalid: ${modulePath}`);
	}
	if ('shortRecallPrompts' in value) {
		throw new Error(
			`Generated challenge runtime v1 must not embed short-recall prompts: ${modulePath}`
		);
	}
	for (const field of ['definitions', 'identities', 'curriculum', 'visuals']) {
		if (!Array.isArray(value[field])) {
			throw new Error(`Generated challenge runtime ${field} must be an array: ${modulePath}`);
		}
	}

	const definitions = value.definitions as unknown[];
	const identities = value.identities as unknown[];
	const curriculum = value.curriculum as unknown[];
	const visuals = value.visuals as unknown[];
	if (
		definitions.length === 0 ||
		identities.length !== definitions.length ||
		curriculum.length !== definitions.length
	) {
		throw new Error(`Generated challenge runtime membership is incomplete: ${modulePath}`);
	}

	const definitionById = new Map<string, ChallengeDefinition>();
	for (const candidate of definitions) {
		if (!validDefinition(candidate)) {
			throw new Error(`Generated challenge definition is malformed: ${modulePath}`);
		}
		if (definitionById.has(candidate.id)) {
			throw new Error(`Generated challenge definition id is duplicated: ${candidate.id}`);
		}
		definitionById.set(candidate.id, candidate);
	}

	const identityIds = new Set<string>();
	for (const identity of identities) {
		if (!isRecord(identity) || !nonEmpty(identity.id)) {
			throw new Error(`Generated challenge identity is malformed: ${modulePath}`);
		}
		const definition = definitionById.get(identity.id);
		if (
			!definition ||
			identity.slug !== definition.slug ||
			identity.subject !== definition.subject ||
			identityIds.has(identity.id)
		) {
			throw new Error(`Generated challenge identity differs from its definition: ${identity.id}`);
		}
		identityIds.add(identity.id);
	}

	const curriculumIds = new Set<string>();
	for (const row of curriculum) {
		if (!validCurriculum(row) || curriculumIds.has(row.id)) {
			throw new Error(`Generated challenge curriculum row is malformed: ${modulePath}`);
		}
		const definition = definitionById.get(row.id);
		if (!definition || row.subject !== definition.subject) {
			throw new Error(`Generated challenge curriculum differs from its definition: ${row.id}`);
		}
		curriculumIds.add(row.id);
	}

	const visualIds = new Set<string>();
	for (const visual of visuals) {
		if (!validVisual(visual) || visualIds.has(visual.id)) {
			throw new Error(`Generated challenge visual is malformed: ${modulePath}`);
		}
		visualIds.add(visual.id);
	}

	return value as GeneratedScienceChallengeRuntime;
}

function validDefinition(value: unknown): value is ChallengeDefinition {
	if (!isRecord(value)) return false;
	const subject = value.subject;
	const theme = value.subjectArtTheme;
	const strings = [
		'id',
		'slug',
		'title',
		'topic',
		'hook',
		'arc',
		'mechanic',
		'difficulty',
		'previewQuestion',
		'metaDescription',
		'lastReviewed',
		'weakAnswerKind',
		'showdownExplanation',
		'commandWordLesson',
		'diagnosisPrompt',
		'repairPrompt',
		'repairSuccess',
		'transferPromptLead',
		'transferExplanation',
		'memoryHandle'
	];
	return (
		safeId(value.id) &&
		safeSlug(value.slug) &&
		validSubject(subject) &&
		validTheme(subject, theme) &&
		strings.every((field) => nonEmpty(value[field])) &&
		['a', 'b'].includes(String(value.strongerAnswer)) &&
		['a', 'b'].includes(String(value.weakAnswer)) &&
		isRecord(value.staticAnswers) &&
		nonEmpty(value.staticAnswers.a) &&
		nonEmpty(value.staticAnswers.b) &&
		Number.isInteger(value.marks) &&
		Number(value.marks) > 0 &&
		Number.isInteger(value.estimatedMinutes) &&
		Number(value.estimatedMinutes) > 0 &&
		Number.isInteger(value.version) &&
		Number(value.version) > 0 &&
		validChoices(value.diagnosisChoices) &&
		validChoices(value.repairChoices) &&
		validChoices(value.transferChoices) &&
		Array.isArray(value.freeTextKeywordGroups) &&
		value.freeTextKeywordGroups.length > 0 &&
		value.freeTextKeywordGroups.every(
			(group) => Array.isArray(group) && group.length > 0 && group.every(nonEmpty)
		) &&
		validQuestionPresentation(value.questionPresentation)
	);
}

function validCurriculum(value: unknown): value is GeneratedScienceChallengeCurriculum {
	return (
		isRecord(value) &&
		safeId(value.id) &&
		validSubject(value.subject) &&
		nonEmpty(value.curriculumComponentId) &&
		nonEmpty(value.specificationId) &&
		SHA256.test(String(value.specificationSha256 ?? '')) &&
		nonEmpty(value.specRef) &&
		nonEmpty(value.topicLabel) &&
		SHA256.test(String(value.sourceTextSha256 ?? '')) &&
		Number.isInteger(value.pageStart) &&
		Number(value.pageStart) > 0 &&
		Number.isInteger(value.pageEnd) &&
		Number(value.pageEnd) >= Number(value.pageStart)
	);
}

function validVisual(value: unknown): value is ChallengeVisualDefinition & { id: string } {
	return (
		isRecord(value) &&
		safeId(value.id) &&
		Array.isArray(value.segments) &&
		value.segments.length > 0 &&
		value.segments.every(nonEmpty) &&
		Number.isInteger(value.decisiveIndex) &&
		Number(value.decisiveIndex) >= 0 &&
		Number(value.decisiveIndex) < value.segments.length &&
		nonEmpty(value.decisiveLabel) &&
		validCardArt(value.cardArt) &&
		validCardArt(value.transferArt)
	);
}

function validCardArt(value: unknown): boolean {
	return (
		isRecord(value) &&
		nonEmpty(value.src) &&
		nonEmpty(value.darkSrc) &&
		nonEmpty(value.alt) &&
		Number.isInteger(value.width) &&
		Number(value.width) > 0 &&
		Number.isInteger(value.height) &&
		Number(value.height) > 0
	);
}

function validChoices(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.length >= 2 &&
		value.every(
			(choice) =>
				isRecord(choice) &&
				nonEmpty(choice.id) &&
				nonEmpty(choice.text) &&
				typeof choice.correct === 'boolean'
		)
	);
}

function validQuestionPresentation(value: unknown): boolean {
	if (value === undefined) return true;
	if (!isRecord(value) || !nonEmpty(value.lead) || !nonEmpty(value.task)) return false;
	if (value.table === undefined) return true;
	return (
		isRecord(value.table) &&
		nonEmpty(value.table.caption) &&
		Array.isArray(value.table.columns) &&
		value.table.columns.length === 2 &&
		value.table.columns.every(nonEmpty) &&
		Array.isArray(value.table.rows) &&
		value.table.rows.length > 0 &&
		value.table.rows.every((row) => Array.isArray(row) && row.length === 2 && row.every(nonEmpty))
	);
}

function validTheme(subject: unknown, theme: unknown): theme is ChallengeSubjectArtTheme {
	const themes: Record<ChallengeSubject, readonly ChallengeSubjectArtTheme[]> = {
		biology: ['cells-practical', 'biochemistry', 'inheritance-reproduction', 'regulation-immunity'],
		chemistry: [
			'particles-bonding',
			'reactions-energy',
			'practical-analysis',
			'materials-industry'
		],
		physics: [
			'forces-motion',
			'electricity-magnetism',
			'thermal-particles',
			'radiation-measurement'
		]
	};
	return validSubject(subject) && themes[subject].includes(theme as ChallengeSubjectArtTheme);
}

function validSubject(value: unknown): value is ChallengeSubject {
	return value === 'biology' || value === 'chemistry' || value === 'physics';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function safeId(value: unknown): value is string {
	return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function safeSlug(value: unknown): value is string {
	return safeId(value);
}

function sameJsonValue(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (Array.isArray(left) || Array.isArray(right)) {
		return (
			Array.isArray(left) &&
			Array.isArray(right) &&
			left.length === right.length &&
			left.every((value, index) => sameJsonValue(value, right[index]))
		);
	}
	if (!isRecord(left) || !isRecord(right)) return false;
	const leftKeys = Object.keys(left).sort();
	const rightKeys = Object.keys(right).sort();
	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(left[key], right[key]))
	);
}

const runtimeModules = import.meta.glob('../../../data/challenges/releases/*/runtime.json', {
	eager: true,
	import: 'default'
}) as Record<string, unknown>;

const acceptedReleaseModules = import.meta.glob(
	'../../../data/challenges/releases/*/accepted-challenges.json',
	{
		eager: true,
		import: 'default'
	}
) as Record<string, unknown>;

const generatedRuntime = loadGeneratedScienceChallengeRuntimes(
	runtimeModules,
	acceptedReleaseModules
);

export const generatedScienceChallengeReleaseIds = generatedRuntime.releaseIds;
export const generatedScienceChallengeDefinitions = generatedRuntime.definitions;
export const generatedScienceChallengeCurriculum = generatedRuntime.curriculum;
export const generatedScienceChallengeVisuals = generatedRuntime.visuals;
