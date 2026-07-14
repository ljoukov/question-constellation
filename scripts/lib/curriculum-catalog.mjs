import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const CURRICULUM_IMPORT_OWNER = 'official_curriculum_importer';
export const CURRICULUM_PROFILE_SNAPSHOT_ID = 'gcse-current';

const OFFICIAL_DOMAINS_BY_BOARD = new Map([
	['aqa', ['aqa.org.uk']],
	['ocr', ['ocr.org.uk']],
	['pearson edexcel', ['pearson.com']],
	['edexcel', ['pearson.com']],
	['eduqas', ['eduqas.co.uk']],
	['wjec', ['wjec.co.uk']],
	['ccea', ['ccea.org.uk']]
]);

// Some boards serve the PDF selected from their official page through a
// third-party asset host. These hosts are accepted for pdfUrl only; landingUrl
// must still be on the board's own domain above.
const OFFICIAL_ASSET_DOMAINS_BY_BOARD = new Map([
	['aqa', ['aqa.org.uk', 'cdn.sanity.io']],
	['ocr', ['ocr.org.uk']]
]);

export class CurriculumCatalogValidationError extends Error {
	/** @param {string[]} issues */
	constructor(issues) {
		super(`Curriculum catalog validation failed:\n- ${issues.join('\n- ')}`);
		this.name = 'CurriculumCatalogValidationError';
		this.issues = issues;
	}
}

/**
 * Validate the reviewed manifest and its immutable local source PDFs.
 * Returns a normalized copy only when every invariant passes.
 *
 * @param {unknown} input
 * @param {{rootDir?: string, inspectPdf?: (absolutePath: string) => {sha256: string, pageCount: number}}} [options]
 */
export function validateCurriculumCatalog(
	input,
	{ rootDir = process.cwd(), inspectPdf = inspectLocalPdf } = {}
) {
	/** @type {string[]} */
	const issues = [];
	if (!isRecord(input)) throw new CurriculumCatalogValidationError(['catalog must be an object']);
	const schemaVersion = normalizeSchemaVersion(input.schemaVersion, issues);
	const generatedAt = requireText(input.generatedAt, 'generatedAt', issues);
	if (generatedAt && !Number.isFinite(Date.parse(generatedAt))) {
		issues.push('generatedAt must be an ISO timestamp');
	}
	const rawSpecifications = requireArray(input.specifications, 'specifications', issues);
	const rawOfferings = requireArray(input.offerings, 'offerings', issues);

	const specifications = rawSpecifications.map((raw, index) =>
		normalizeSpecification(raw, index, { rootDir, inspectPdf, issues })
	);
	const specificationIds = uniqueValues(
		specifications.map((specification) => specification.id),
		'specification id',
		issues
	);
	uniqueValues(
		specifications.map((specification) =>
			[
				specification.board,
				specification.qualification,
				specification.subject,
				specification.course,
				specification.specificationCode,
				specification.version
			].join('\u0000')
		),
		'specification identity',
		issues
	);
	const allComponents = specifications.flatMap((specification) => specification.components);
	uniqueValues(
		allComponents.map((component) => component.id),
		'component id',
		issues
	);
	const specificationsById = new Map(
		specifications.map((specification) => [specification.id, specification])
	);

	const offerings = rawOfferings.map((raw, index) =>
		normalizeOffering(raw, index, { specificationsById, issues })
	);
	uniqueValues(
		offerings.map((offering) => offering.id),
		'offering id',
		issues
	);
	uniqueValues(offerings.map(offeringProfileKey), 'offering profile combination', issues);

	for (const specification of specifications) {
		if (!specificationIds.has(specification.id)) continue;
		const specOfferings = offerings.filter(
			(offering) => offering.specificationId === specification.id
		);
		for (const profileSubject of specification.profileSubjects) {
			if (!specOfferings.some((offering) => offering.profileSubject === profileSubject)) {
				issues.push(`${specification.id}: profile subject ${profileSubject} has no exact offering`);
			}
		}
	}

	if (issues.length) throw new CurriculumCatalogValidationError(issues);
	return { schemaVersion, generatedAt, specifications, offerings };
}

/** @param {any} raw @param {number} index @param {any} context */
function normalizeSpecification(raw, index, { rootDir, inspectPdf, issues }) {
	const label = `specifications[${index}]`;
	if (!isRecord(raw)) {
		issues.push(`${label} must be an object`);
		raw = {};
	}
	const id = requireText(raw.id, `${label}.id`, issues);
	const board = requireText(raw.board, `${label}.board`, issues);
	const qualification = requireText(raw.qualification, `${label}.qualification`, issues);
	const subject = requireText(raw.subject, `${label}.subject`, issues);
	const course = requireText(raw.course, `${label}.course`, issues);
	const profileSubjects = requireStringArray(
		raw.profileSubjects,
		`${label}.profileSubjects`,
		issues
	);
	uniqueValues(profileSubjects, `${label} profile subject`, issues);
	const specificationCode = requireText(
		raw.specificationCode,
		`${label}.specificationCode`,
		issues
	);
	const version = requireText(raw.version, `${label}.version`, issues);
	const title = requireText(raw.title, `${label}.title`, issues);
	const status = requireText(raw.status, `${label}.status`, issues);
	if (status && !['upcoming', 'current', 'legacy', 'withdrawn'].includes(status)) {
		issues.push(`${label}.status is not supported: ${status}`);
	}
	if (status === 'current' && !profileSubjects.length) {
		issues.push(`${label}.profileSubjects must not be empty for a current specification`);
	}
	const landingUrl = validateOfficialUrl(raw.landingUrl, board, `${label}.landingUrl`, issues);
	const pdfUrl = validateOfficialUrl(raw.pdfUrl, board, `${label}.pdfUrl`, issues, {
		allowAssetHost: true
	});
	const localPath = requireText(raw.localPath, `${label}.localPath`, issues);
	const declaredSha256 = normalizeSha256(raw.sha256, `${label}.sha256`, issues);
	const pageCount = requirePositiveInteger(raw.pageCount, `${label}.pageCount`, issues);
	const firstTeachingYear = optionalYear(
		raw.firstTeachingYear,
		`${label}.firstTeachingYear`,
		issues
	);
	const firstExamYear = optionalYear(raw.firstExamYear, `${label}.firstExamYear`, issues);
	const lastExamYear = optionalYear(raw.lastExamYear, `${label}.lastExamYear`, issues);
	if (firstExamYear && lastExamYear && lastExamYear < firstExamYear) {
		issues.push(`${label}.lastExamYear must not precede firstExamYear`);
	}

	if (localPath) {
		const absolutePath = path.resolve(rootDir, localPath);
		const allowedRoot = `${path.resolve(rootDir, 'data/curricula')}${path.sep}`;
		if (
			!absolutePath.startsWith(allowedRoot) ||
			path.extname(absolutePath).toLowerCase() !== '.pdf'
		) {
			issues.push(`${label}.localPath must be a PDF below data/curricula`);
		} else if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
			issues.push(`${label}.localPath does not exist: ${localPath}`);
		} else {
			try {
				const inspected = inspectPdf(absolutePath);
				if (declaredSha256 && inspected.sha256 !== declaredSha256) {
					issues.push(
						`${label}.sha256 mismatch (declared ${declaredSha256}, actual ${inspected.sha256})`
					);
				}
				if (pageCount && inspected.pageCount !== pageCount) {
					issues.push(
						`${label}.pageCount mismatch (declared ${pageCount}, actual ${inspected.pageCount})`
					);
				}
			} catch (error) {
				issues.push(`${label}.localPath could not be inspected: ${errorMessage(error)}`);
			}
		}
	}

	const rawComponents = requireArray(raw.components, `${label}.components`, issues);
	const components = rawComponents.map((component, componentIndex) =>
		normalizeComponent(component, componentIndex, { specificationId: id, pageCount, issues })
	);
	uniqueValues(
		components.map((component) => component.id),
		`${label} component id`,
		issues
	);
	uniqueValues(
		components.map((component) =>
			[component.specificationId, component.subjectArea ?? '<null>', component.code].join('\u0000')
		),
		`${label} component source identity`,
		issues
	);
	validateComponentTree(components, label, issues);

	return {
		id,
		board,
		qualification,
		subject,
		course,
		profileSubjects,
		specificationCode,
		version,
		title,
		firstTeachingYear,
		firstExamYear,
		lastExamYear,
		status,
		landingUrl,
		pdfUrl,
		localPath,
		sha256: declaredSha256,
		pageCount,
		components
	};
}

/** @param {any} raw @param {number} index @param {any} context */
function normalizeComponent(raw, index, { specificationId, pageCount, issues }) {
	const label = `${specificationId || 'unknown-spec'}.components[${index}]`;
	if (!isRecord(raw)) {
		issues.push(`${label} must be an object`);
		raw = {};
	}
	const sourcePageStart = optionalPositiveInteger(
		raw.sourcePageStart,
		`${label}.sourcePageStart`,
		issues
	);
	const sourcePageEnd = optionalPositiveInteger(
		raw.sourcePageEnd,
		`${label}.sourcePageEnd`,
		issues
	);
	if (sourcePageStart && sourcePageEnd && sourcePageEnd < sourcePageStart) {
		issues.push(`${label}.sourcePageEnd must not precede sourcePageStart`);
	}
	if (
		pageCount &&
		((sourcePageStart !== null && sourcePageStart > pageCount) ||
			(sourcePageEnd !== null && sourcePageEnd > pageCount))
	) {
		issues.push(`${label} source pages exceed the specification page count`);
	}
	const metadata = isRecord(raw.metadata) ? structuredClone(raw.metadata) : {};
	if (!isRecord(raw.metadata)) issues.push(`${label}.metadata must be an object`);
	for (const key of [
		'questionSpecRefs',
		'questionComponentCodes',
		'specRefs',
		'examComponentCodes'
	]) {
		if (metadata[key] !== undefined) {
			metadata[key] = requireStringArray(metadata[key], `${label}.metadata.${key}`, issues);
		}
	}
	for (const key of ['selectionMin', 'selectionMax']) {
		if (metadata[key] !== undefined) {
			metadata[key] = requireNonNegativeInteger(metadata[key], `${label}.metadata.${key}`, issues);
		}
	}
	if ((metadata.selectionMin === undefined) !== (metadata.selectionMax === undefined)) {
		issues.push(`${label}.metadata.selectionMin and selectionMax must be supplied together`);
	}
	if (
		metadata.selectionMin !== undefined &&
		metadata.selectionMax !== undefined &&
		metadata.selectionMin > metadata.selectionMax
	) {
		issues.push(`${label}.metadata.selectionMin must not exceed selectionMax`);
	}
	return {
		id: requireText(raw.id, `${label}.id`, issues),
		specificationId,
		parentId: optionalText(raw.parentId, `${label}.parentId`, issues),
		code: requireText(raw.code, `${label}.code`, issues),
		title: requireText(raw.title, `${label}.title`, issues),
		kind: requireText(raw.kind, `${label}.kind`, issues),
		depth: requireNonNegativeInteger(raw.depth, `${label}.depth`, issues),
		displayOrder: requireNonNegativeInteger(raw.displayOrder, `${label}.displayOrder`, issues),
		selectable: requireBoolean(raw.selectable, `${label}.selectable`, issues),
		subjectArea: optionalText(raw.subjectArea, `${label}.subjectArea`, issues),
		paper: optionalText(raw.paper, `${label}.paper`, issues),
		tier: normalizeComponentTier(raw.tier, `${label}.tier`, issues),
		optionGroupId: optionalText(raw.optionGroupId, `${label}.optionGroupId`, issues),
		sourcePageStart,
		sourcePageEnd,
		metadata
	};
}

/** @param {any[]} components @param {string} label @param {string[]} issues */
function validateComponentTree(components, label, issues) {
	const byId = new Map(components.map((component) => [component.id, component]));
	const roots = components.filter((component) => component.parentId === null);
	if (!roots.length) issues.push(`${label} must have at least one root component`);
	const siblingOrders = new Set();
	for (const component of components) {
		if (component.parentId === null) {
			if (component.depth !== 0) issues.push(`${component.id}: root depth must be 0`);
		} else {
			const parent = byId.get(component.parentId);
			if (!parent) {
				issues.push(
					`${component.id}: parent ${component.parentId} is not in the same specification`
				);
			} else if (component.depth !== parent.depth + 1) {
				issues.push(`${component.id}: depth must be exactly parent depth + 1`);
			}
		}
		const siblingOrderKey = `${component.parentId ?? '<root>'}\u0000${component.displayOrder}`;
		if (siblingOrders.has(siblingOrderKey)) {
			issues.push(`${component.id}: duplicate displayOrder among siblings`);
		}
		siblingOrders.add(siblingOrderKey);
		const seen = new Set([component.id]);
		let cursor = component;
		while (cursor.parentId !== null) {
			if (seen.has(cursor.parentId)) {
				issues.push(`${component.id}: parent cycle detected`);
				break;
			}
			seen.add(cursor.parentId);
			const parent = byId.get(cursor.parentId);
			if (!parent) break;
			cursor = parent;
		}
		if (component.optionGroupId !== null) {
			const optionGroup = byId.get(component.optionGroupId);
			if (!optionGroup) {
				issues.push(`${component.id}: optionGroupId ${component.optionGroupId} does not exist`);
			} else {
				if (
					optionGroup.metadata.selectionMin === undefined ||
					optionGroup.metadata.selectionMax === undefined
				) {
					issues.push(
						`${component.id}: optionGroupId must reference a component with selectionMin/selectionMax`
					);
				}
				if (
					!isDescendantOrSelf(component, optionGroup.id, byId) ||
					component.id === optionGroup.id
				) {
					issues.push(`${component.id}: optionGroupId must reference an ancestor component`);
				}
			}
		}
	}
	for (const group of components.filter(
		(component) => component.metadata.selectionMin !== undefined
	)) {
		const options = components.filter((component) => component.optionGroupId === group.id);
		if (!options.length)
			issues.push(`${group.id}: constrained option group has no option components`);
		if (options.some((component) => !component.selectable)) {
			issues.push(`${group.id}: every constrained option must be selectable`);
		}
		if (group.metadata.selectionMax > options.length) {
			issues.push(`${group.id}: selectionMax exceeds its option component count`);
		}
	}
}

/** @param {any} raw @param {number} index @param {any} context */
function normalizeOffering(raw, index, { specificationsById, issues }) {
	const label = `offerings[${index}]`;
	if (!isRecord(raw)) {
		issues.push(`${label} must be an object`);
		raw = {};
	}
	const specificationId = requireText(raw.specificationId, `${label}.specificationId`, issues);
	const specification = specificationsById.get(specificationId);
	if (!specification) issues.push(`${label}.specificationId does not exist: ${specificationId}`);
	const offering = {
		id: requireText(raw.id, `${label}.id`, issues),
		board: requireText(raw.board, `${label}.board`, issues),
		qualification: requireText(raw.qualification, `${label}.qualification`, issues),
		profileSubject: requireText(raw.profileSubject, `${label}.profileSubject`, issues),
		course: requireText(raw.course, `${label}.course`, issues),
		tier: requireText(raw.tier, `${label}.tier`, issues),
		specificationId,
		rootComponentId: requireText(raw.rootComponentId, `${label}.rootComponentId`, issues),
		selectableComponentIds: requireStringArray(
			raw.selectableComponentIds,
			`${label}.selectableComponentIds`,
			issues,
			{ nonEmpty: true }
		),
		label: requireText(raw.label, `${label}.label`, issues),
		isDefault: requireBoolean(raw.isDefault, `${label}.isDefault`, issues)
	};
	uniqueValues(offering.selectableComponentIds, `${label} selectable component id`, issues);
	if (!['Foundation', 'Higher'].includes(offering.tier)) {
		issues.push(`${label}.tier must be Foundation or Higher`);
	}
	if (
		!['Biology', 'Chemistry', 'Physics'].includes(offering.profileSubject) &&
		offering.tier !== 'Higher'
	) {
		issues.push(
			`${label}.tier must be Higher for non-science subjects to match the current persisted profile key`
		);
	}
	if (!specification) return offering;
	if (offering.board !== specification.board)
		issues.push(`${label}.board must exactly match ${specificationId}`);
	if (offering.qualification !== specification.qualification)
		issues.push(`${label}.qualification must exactly match ${specificationId}`);
	if (offering.course !== specification.course)
		issues.push(`${label}.course must exactly match ${specificationId}`);
	if (!specification.profileSubjects.includes(offering.profileSubject)) {
		issues.push(`${label}.profileSubject is not declared by ${specificationId}`);
	}
	/** @type {any[]} */
	const specificationComponents = specification.components;
	const byId = new Map(specificationComponents.map((component) => [component.id, component]));
	const root = byId.get(offering.rootComponentId);
	if (!root) issues.push(`${label}.rootComponentId is not in ${specificationId}`);
	const expectedSelectableIds = specificationComponents
		.filter(
			(component) =>
				component.selectable &&
				isDescendantOrSelf(component, offering.rootComponentId, byId) &&
				(component.subjectArea === null || component.subjectArea === offering.profileSubject) &&
				(!component.tier.length || component.tier.includes(offering.tier))
		)
		.map((component) => component.id)
		.sort();
	const suppliedSelectableIds = [...offering.selectableComponentIds].sort();
	if (JSON.stringify(expectedSelectableIds) !== JSON.stringify(suppliedSelectableIds)) {
		issues.push(
			`${label}.selectableComponentIds must exactly equal the applicable selectable descendants of its root`
		);
	}
	for (const componentId of offering.selectableComponentIds) {
		const component = byId.get(componentId);
		if (!component) issues.push(`${label}: selectable component ${componentId} does not exist`);
		else if (!component.selectable)
			issues.push(`${label}: component ${componentId} is not selectable`);
	}
	for (const group of specificationComponents.filter(
		(component) => component.metadata.selectionMin !== undefined
	)) {
		const applicableOptions = offering.selectableComponentIds.filter(
			(componentId) => byId.get(componentId)?.optionGroupId === group.id
		);
		if (applicableOptions.length && group.metadata.selectionMax > applicableOptions.length) {
			issues.push(`${label}: ${group.id} selectionMax exceeds the offering's available options`);
		}
	}
	return offering;
}

/**
 * Build normalized rows plus the stable denormalized runtime contracts.
 * @param {ReturnType<typeof validateCurriculumCatalog>} catalog
 */
export function buildCurriculumImportSnapshot(catalog) {
	const specifications = catalog.specifications.map((specification) => ({
		id: specification.id,
		board: specification.board,
		qualification: specification.qualification,
		subject: specification.subject,
		course: specification.course,
		specificationCode: specification.specificationCode,
		version: specification.version,
		title: specification.title,
		firstTeachingYear: specification.firstTeachingYear,
		firstExamYear: specification.firstExamYear,
		lastExamYear: specification.lastExamYear,
		status: specification.status,
		landingUrl: specification.landingUrl,
		pdfUrl: specification.pdfUrl,
		localPath: specification.localPath,
		fileHash: `sha256:${specification.sha256}`,
		pageCount: specification.pageCount,
		sourceMetadata: {
			catalogSchemaVersion: catalog.schemaVersion,
			catalogGeneratedAt: catalog.generatedAt,
			profileSubjects: specification.profileSubjects,
			untiered:
				specification.components.find((component) => component.parentId === null)?.metadata
					.untiered ?? null
		},
		importOwner: CURRICULUM_IMPORT_OWNER
	}));
	const components = catalog.specifications.flatMap((specification) =>
		specification.components.map((component) => ({
			...component,
			tierJson: component.tier,
			metadataJson: component.metadata,
			importOwner: CURRICULUM_IMPORT_OWNER
		}))
	);
	const specificationsById = new Map(
		catalog.specifications.map((specification) => [specification.id, specification])
	);
	const offerings = catalog.offerings.map((offering) => {
		const specification = specificationsById.get(offering.specificationId);
		const selectionTree = buildSelectionTree(offering, specification);
		const selectableComponentIds = selectionTree.groups.flatMap(
			/** @param {any} group */ (group) =>
				group.components.map(/** @param {any} component */ (component) => component.id)
		);
		const snapshotHash = sha256Stable({
			offering: {
				id: offering.id,
				board: offering.board,
				qualification: offering.qualification,
				profileSubject: offering.profileSubject,
				course: offering.course,
				tier: offering.tier,
				specificationId: offering.specificationId,
				rootComponentId: offering.rootComponentId,
				label: offering.label,
				isDefault: offering.isDefault
			},
			selectionTree
		});
		return {
			...offering,
			selectionTree,
			selectableComponentIds,
			snapshotHash,
			enabled: true,
			importOwner: CURRICULUM_IMPORT_OWNER
		};
	});
	const profileOfferings = offerings.filter((offering) => offering.isDefault);
	const profileSnapshot = buildProfileSnapshot(profileOfferings, specificationsById);
	return {
		specifications,
		components,
		offerings,
		profileSnapshots: [
			{
				id: CURRICULUM_PROFILE_SNAPSHOT_ID,
				qualification: profileSnapshot.qualification,
				options: profileSnapshot,
				sourceFingerprint: sha256Stable({
					catalogSchemaVersion: catalog.schemaVersion,
					offerings: profileOfferings.map((offering) => ({
						id: offering.id,
						snapshotHash: offering.snapshotHash
					}))
				}),
				importOwner: CURRICULUM_IMPORT_OWNER
			}
		]
	};
}

/** @param {any} offering @param {any} specification */
function buildSelectionTree(offering, specification) {
	/** @type {any[]} */
	const specificationComponents = specification.components;
	const byId = new Map(specificationComponents.map((component) => [component.id, component]));
	const ordinaryComponents = offering.selectableComponentIds
		.map(/** @param {string} componentId */ (componentId) => byId.get(componentId))
		.filter(/** @param {any} component */ (component) => component && !component.optionGroupId);
	const curriculumGroup = ordinaryComponents.length
		? {
				id: `${offering.id}:curriculum`,
				title: curriculumSelectionTitle(ordinaryComponents),
				kind: 'curriculum',
				displayOrder: Math.min(
					...ordinaryComponents.map(
						/** @param {any} component */ (component) => component.displayOrder
					)
				),
				selectionMin: undefined,
				selectionMax: undefined
			}
		: null;
	/** @type {Map<string, any>} */
	const groups = new Map();
	for (const componentId of offering.selectableComponentIds) {
		const component = byId.get(componentId);
		const optionGroup = component.optionGroupId ? byId.get(component.optionGroupId) : null;
		const groupIdentity = optionGroup
			? {
					id: optionGroup.id,
					title: optionGroup.title,
					kind: 'option_group',
					displayOrder: optionGroup.displayOrder,
					selectionMin: optionGroup.metadata.selectionMin,
					selectionMax: optionGroup.metadata.selectionMax
				}
			: curriculumGroup;
		if (!groupIdentity) {
			throw new Error(
				`${offering.id}: selectable component ${component.id} has no selection group`
			);
		}
		if (!groups.has(groupIdentity.id)) {
			/** @type {any} */
			const group = {
				id: groupIdentity.id,
				title: groupIdentity.title,
				kind: groupIdentity.kind,
				displayOrder: groupIdentity.displayOrder,
				components: []
			};
			if (groupIdentity.selectionMin !== undefined) {
				group.selectionMin = groupIdentity.selectionMin;
				group.selectionMax = groupIdentity.selectionMax;
			}
			groups.set(groupIdentity.id, group);
		}
		const group = groups.get(groupIdentity.id);
		group.displayOrder = Math.min(group.displayOrder, component.displayOrder);
		group.components.push({
			id: component.id,
			code: component.code,
			title: component.title,
			kind: component.kind,
			displayOrder: component.displayOrder,
			subjectArea: component.subjectArea,
			optionGroupId: component.optionGroupId,
			sourcePageStart: component.sourcePageStart,
			sourcePageEnd: component.sourcePageEnd
		});
	}
	const orderedGroups = [...groups.values()]
		.map((group) => ({
			...group,
			components: group.components.sort(compareDisplayRows)
		}))
		.sort(compareDisplayRows);
	const emittedIds = orderedGroups.flatMap((group) =>
		group.components.map(/** @param {any} component */ (component) => component.id)
	);
	if (
		new Set(emittedIds).size !== offering.selectableComponentIds.length ||
		[...emittedIds].sort().join('\u0000') !==
			[...offering.selectableComponentIds].sort().join('\u0000')
	) {
		throw new Error(`${offering.id}: selection tree did not emit every selectable component once`);
	}
	return { groups: orderedGroups };
}

/**
 * The persistent curriculum scope is specification content, not an exam-paper
 * filter. Derive one neutral label from the selectable component types; paper
 * metadata remains available on normalized components for provenance and
 * temporary exam-focus features, but never shapes this selection contract.
 *
 * @param {any[]} components
 */
function curriculumSelectionTitle(components) {
	if (
		components.every(
			(component) => component.kind === 'chapter' || component.metadata.selectionRole === 'chapter'
		)
	)
		return 'Chapters';
	if (components.every((component) => ['topic', 'section', 'topic_group'].includes(component.kind)))
		return 'Topics';
	return 'Course content';
}

/** @param {any[]} offerings @param {Map<string, any>} specificationsById */
function buildProfileSnapshot(offerings, specificationsById) {
	const qualifications = [...new Set(offerings.map((offering) => offering.qualification))];
	if (qualifications.length !== 1) {
		throw new Error('gcse-current profile snapshot requires exactly one qualification');
	}
	/** @type {Map<string, any>} */
	const bySubject = new Map();
	for (const offering of [...offerings].sort(compareOfferings)) {
		const specification = specificationsById.get(offering.specificationId);
		let subject = bySubject.get(offering.profileSubject);
		if (!subject) {
			subject = { subject: offering.profileSubject, offerings: [] };
			bySubject.set(offering.profileSubject, subject);
		}
		subject.offerings.push({ offering, specification });
	}
	return {
		qualification: qualifications[0],
		subjects: [...bySubject.values()]
			.sort((a, b) => a.subject.localeCompare(b.subject))
			.map((subjectEntry) => {
				const tierNames = new Set(
					subjectEntry.offerings.map(/** @param {any} entry */ (entry) => entry.offering.tier)
				);
				const untieredFlags = subjectEntry.offerings.map(
					/** @param {any} entry */ (entry) =>
						entry.specification.components.find(
							/** @param {any} component */ (component) => component.parentId === null
						)?.metadata.untiered
				);
				const tierApplies = untieredFlags.every(
					/** @param {any} flag */ (flag) => typeof flag === 'boolean'
				)
					? untieredFlags.some(/** @param {any} flag */ (flag) => flag === false)
					: tierNames.size > 1 ||
						[...tierNames].some((tier) => /^(foundation|higher)$/i.test(tier));
				const byBoard = new Map();
				for (const entry of subjectEntry.offerings) {
					let board = byBoard.get(entry.offering.board);
					if (!board) {
						board = {
							id: slug(entry.offering.board),
							name: entry.offering.board,
							coursesByName: new Map()
						};
						byBoard.set(entry.offering.board, board);
					}
					let course = board.coursesByName.get(entry.offering.course);
					if (!course) {
						course = { name: entry.offering.course, tiers: [] };
						board.coursesByName.set(entry.offering.course, course);
					}
					course.tiers.push({
						name: entry.offering.tier,
						offeringId: entry.offering.id,
						specification: {
							id: entry.specification.id,
							code: entry.specification.specificationCode,
							version: entry.specification.version,
							title: entry.specification.title,
							officialSourceUrl: entry.specification.landingUrl
						}
					});
				}
				return {
					subject: subjectEntry.subject,
					tierApplies,
					boards: [...byBoard.values()]
						.sort((a, b) => a.name.localeCompare(b.name))
						.map((board) => ({
							id: board.id,
							name: board.name,
							courses: [...board.coursesByName.values()]
								.sort((a, b) => a.name.localeCompare(b.name))
								.map((course) => ({
									name: course.name,
									tiers: course.tiers.sort(compareNameRows)
								}))
						}))
				};
			})
	};
}

/**
 * Map only clean, published questions carrying exact trusted identifiers.
 * Prompt text and topic labels are intentionally never inspected.
 *
 * @param {any[]} questions
 * @param {ReturnType<typeof buildCurriculumImportSnapshot>} snapshot
 */
export function buildTrustedQuestionCurriculumMappings(questions, snapshot) {
	const specificationsById = new Map(
		snapshot.specifications.map((specification) => [specification.id, specification])
	);
	const componentsBySpec = new Map();
	for (const component of snapshot.components) {
		const list = componentsBySpec.get(component.specificationId) ?? [];
		list.push(component);
		componentsBySpec.set(component.specificationId, list);
	}
	const mappings = [];
	const unmapped = [];
	const ambiguous = [];
	const ineligible = [];
	for (const question of questions) {
		if (question.status !== 'published' || Number(question.needs_human_review) !== 0) {
			ineligible.push({ questionId: question.id, reason: 'not clean and published' });
			continue;
		}
		const candidates = [];
		for (const [specificationId, components] of componentsBySpec) {
			const specification = specificationsById.get(specificationId);
			if (!questionMatchesSpecification(question, specification)) continue;
			for (const component of components) {
				const sources = [];
				if (
					question.spec_ref &&
					(component.code === question.spec_ref ||
						component.metadataJson.questionSpecRefs?.includes(question.spec_ref) ||
						component.metadataJson.specRefs?.includes(question.spec_ref))
				) {
					sources.push('spec_ref');
				}
				if (
					question.component_code &&
					(component.code === question.component_code ||
						component.metadataJson.questionComponentCodes?.includes(question.component_code) ||
						component.metadataJson.examComponentCodes?.includes(question.component_code))
				) {
					sources.push('component_code');
				}
				if (sources.length) candidates.push({ component, sources });
			}
		}
		if (!candidates.length) {
			unmapped.push({ questionId: question.id, reason: 'no exact trusted identifier match' });
			continue;
		}
		const specRefCandidates = candidates.filter(({ sources }) => sources.includes('spec_ref'));
		let selectedCandidates;
		let ambiguityReason;
		if (specRefCandidates.length) {
			const deepest = Math.max(...specRefCandidates.map(({ component }) => component.depth));
			selectedCandidates = specRefCandidates.filter(({ component }) => component.depth === deepest);
			ambiguityReason = 'multiple equally specific exact spec_ref matches';
		} else {
			selectedCandidates = candidates.filter(({ sources }) => sources.includes('component_code'));
			ambiguityReason = 'component_code repeats across multiple curriculum components';
		}
		const uniqueIds = new Set(selectedCandidates.map(({ component }) => component.id));
		if (uniqueIds.size !== 1) {
			ambiguous.push({
				questionId: question.id,
				componentIds: [...uniqueIds].sort(),
				reason: ambiguityReason
			});
			continue;
		}
		const selected = selectedCandidates[0];
		mappings.push({
			questionId: question.id,
			curriculumComponentId: selected.component.id,
			specificationId: selected.component.specificationId,
			isPrimary: true,
			confidence: 1,
			mappingSource: `${CURRICULUM_IMPORT_OWNER}:${specRefCandidates.length ? 'spec_ref' : 'component_code'}`,
			mappingNotes: 'Exact imported source identity; no keyword or prompt classification.',
			reviewed: true
		});
	}
	return { mappings, unmapped, ambiguous, ineligible };
}

/** @param {any} question @param {any} specification */
function questionMatchesSpecification(question, specification) {
	if (!specification) return false;
	if (normalized(question.board) !== normalized(specification.board)) return false;
	if (normalized(question.qualification) !== normalized(specification.qualification)) return false;
	const questionSubjects = [question.subject, question.subject_area]
		.filter(Boolean)
		.map(normalized);
	const specificationSubjects = [
		specification.subject,
		...(specification.sourceMetadata?.profileSubjects ?? [])
	]
		.filter(Boolean)
		.map(normalized);
	if (!questionSubjects.some((subject) => specificationSubjects.includes(subject))) return false;
	const questionYear = Number(question.year);
	if (Number.isFinite(questionYear)) {
		if (specification.firstExamYear && questionYear < specification.firstExamYear) return false;
		if (specification.lastExamYear && questionYear > specification.lastExamYear) return false;
	}
	const componentCode = String(question.component_code ?? '').trim();
	if (!componentCode) return true;
	return (
		componentCode === specification.specificationCode ||
		componentCode.startsWith(specification.specificationCode)
	);
}

/**
 * Build all deterministic upserts. Deletion statements are supplied explicitly by
 * the CLI after it has inspected current ownership and stale rows.
 * @param {ReturnType<typeof buildCurriculumImportSnapshot>} snapshot
 * @param {ReturnType<typeof buildTrustedQuestionCurriculumMappings>['mappings']} mappings
 */
export function buildCurriculumUpsertStatements(snapshot, mappings) {
	const specificationPayload = snapshot.specifications.map((row) => ({
		...row,
		sourceMetadataJson: JSON.stringify(row.sourceMetadata)
	}));
	const componentPayload = [...snapshot.components]
		.sort((a, b) => a.depth - b.depth || compareDisplayRows(a, b))
		.map((row) => ({
			...row,
			selectable: row.selectable ? 1 : 0,
			tierJson: JSON.stringify(row.tierJson),
			metadataJson: JSON.stringify(row.metadataJson)
		}));
	const offeringPayload = snapshot.offerings.map((row) => ({
		...row,
		selectionTreeJson: JSON.stringify(row.selectionTree),
		selectableComponentIdsJson: JSON.stringify(row.selectableComponentIds),
		isDefault: row.isDefault ? 1 : 0,
		enabled: row.enabled ? 1 : 0
	}));
	const profilePayload = snapshot.profileSnapshots.map((row) => ({
		...row,
		optionsJson: JSON.stringify(row.options)
	}));
	const mappingPayload = mappings.map((row) => ({
		...row,
		isPrimary: row.isPrimary ? 1 : 0,
		reviewed: row.reviewed ? 1 : 0
	}));
	return [
		{
			sql: `INSERT INTO curriculum_specifications (
			  id, board, qualification, subject, course, specification_code, version, title,
			  first_teaching_year, first_exam_year, last_exam_year, status, landing_url, pdf_url,
			  local_path, file_hash, page_count, source_metadata_json, import_owner
			)
			SELECT
			  json_extract(entry.value, '$.id'), json_extract(entry.value, '$.board'),
			  json_extract(entry.value, '$.qualification'), json_extract(entry.value, '$.subject'),
			  json_extract(entry.value, '$.course'), json_extract(entry.value, '$.specificationCode'),
			  json_extract(entry.value, '$.version'), json_extract(entry.value, '$.title'),
			  json_extract(entry.value, '$.firstTeachingYear'),
			  json_extract(entry.value, '$.firstExamYear'),
			  json_extract(entry.value, '$.lastExamYear'), json_extract(entry.value, '$.status'),
			  json_extract(entry.value, '$.landingUrl'), json_extract(entry.value, '$.pdfUrl'),
			  json_extract(entry.value, '$.localPath'), json_extract(entry.value, '$.fileHash'),
			  json_extract(entry.value, '$.pageCount'),
			  json_extract(entry.value, '$.sourceMetadataJson'),
			  json_extract(entry.value, '$.importOwner')
			FROM json_each(?) AS entry
			WHERE 1
			ON CONFLICT(id) DO UPDATE SET
			  board = excluded.board, qualification = excluded.qualification,
			  subject = excluded.subject, course = excluded.course,
			  specification_code = excluded.specification_code, version = excluded.version,
			  title = excluded.title, first_teaching_year = excluded.first_teaching_year,
			  first_exam_year = excluded.first_exam_year, last_exam_year = excluded.last_exam_year,
			  status = excluded.status, landing_url = excluded.landing_url, pdf_url = excluded.pdf_url,
			  local_path = excluded.local_path, file_hash = excluded.file_hash,
			  page_count = excluded.page_count, source_metadata_json = excluded.source_metadata_json,
			  updated_at = CURRENT_TIMESTAMP
			WHERE curriculum_specifications.import_owner = excluded.import_owner`,
			params: [JSON.stringify(specificationPayload)]
		},
		{
			sql: `INSERT INTO curriculum_components (
			  id, specification_id, parent_id, code, title, component_kind, depth,
			  display_order, selectable, subject_area, paper, tier_json, option_group_id,
			  source_page_start, source_page_end, metadata_json, import_owner
			)
			SELECT
			  json_extract(entry.value, '$.id'),
			  json_extract(entry.value, '$.specificationId'),
			  json_extract(entry.value, '$.parentId'), json_extract(entry.value, '$.code'),
			  json_extract(entry.value, '$.title'), json_extract(entry.value, '$.kind'),
			  json_extract(entry.value, '$.depth'), json_extract(entry.value, '$.displayOrder'),
			  json_extract(entry.value, '$.selectable'), json_extract(entry.value, '$.subjectArea'),
			  json_extract(entry.value, '$.paper'), json_extract(entry.value, '$.tierJson'),
			  json_extract(entry.value, '$.optionGroupId'),
			  json_extract(entry.value, '$.sourcePageStart'),
			  json_extract(entry.value, '$.sourcePageEnd'),
			  json_extract(entry.value, '$.metadataJson'),
			  json_extract(entry.value, '$.importOwner')
			FROM json_each(?) AS entry
			WHERE 1
			ON CONFLICT(id) DO UPDATE SET
			  specification_id = excluded.specification_id, parent_id = excluded.parent_id,
			  code = excluded.code, title = excluded.title, component_kind = excluded.component_kind,
			  depth = excluded.depth, display_order = excluded.display_order,
			  selectable = excluded.selectable, subject_area = excluded.subject_area,
			  paper = excluded.paper, tier_json = excluded.tier_json,
			  option_group_id = excluded.option_group_id,
			  source_page_start = excluded.source_page_start,
			  source_page_end = excluded.source_page_end, metadata_json = excluded.metadata_json,
			  updated_at = CURRENT_TIMESTAMP
			WHERE curriculum_components.import_owner = excluded.import_owner`,
			params: [JSON.stringify(componentPayload)]
		},
		{
			sql: `INSERT INTO curriculum_offerings (
			  id, board, qualification, profile_subject, course, tier, specification_id,
			  root_component_id, label, selection_tree_json, selectable_component_ids_json,
			  snapshot_hash, is_default, enabled, import_owner
			)
			SELECT
			  json_extract(entry.value, '$.id'), json_extract(entry.value, '$.board'),
			  json_extract(entry.value, '$.qualification'),
			  json_extract(entry.value, '$.profileSubject'), json_extract(entry.value, '$.course'),
			  json_extract(entry.value, '$.tier'), json_extract(entry.value, '$.specificationId'),
			  json_extract(entry.value, '$.rootComponentId'), json_extract(entry.value, '$.label'),
			  json_extract(entry.value, '$.selectionTreeJson'),
			  json_extract(entry.value, '$.selectableComponentIdsJson'),
			  json_extract(entry.value, '$.snapshotHash'), json_extract(entry.value, '$.isDefault'),
			  json_extract(entry.value, '$.enabled'), json_extract(entry.value, '$.importOwner')
			FROM json_each(?) AS entry
			WHERE 1
			ON CONFLICT(id) DO UPDATE SET
			  board = excluded.board, qualification = excluded.qualification,
			  profile_subject = excluded.profile_subject, course = excluded.course,
			  tier = excluded.tier, specification_id = excluded.specification_id,
			  root_component_id = excluded.root_component_id, label = excluded.label,
			  selection_tree_json = excluded.selection_tree_json,
			  selectable_component_ids_json = excluded.selectable_component_ids_json,
			  snapshot_hash = excluded.snapshot_hash, is_default = excluded.is_default,
			  enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP
			WHERE curriculum_offerings.import_owner = excluded.import_owner`,
			params: [JSON.stringify(offeringPayload)]
		},
		{
			sql: `INSERT INTO curriculum_profile_snapshots (
			  id, qualification, options_json, source_fingerprint, import_owner
			)
			SELECT
			  json_extract(entry.value, '$.id'), json_extract(entry.value, '$.qualification'),
			  json_extract(entry.value, '$.optionsJson'),
			  json_extract(entry.value, '$.sourceFingerprint'),
			  json_extract(entry.value, '$.importOwner')
			FROM json_each(?) AS entry
			WHERE 1
			ON CONFLICT(id) DO UPDATE SET
			  qualification = excluded.qualification, options_json = excluded.options_json,
			  source_fingerprint = excluded.source_fingerprint, updated_at = CURRENT_TIMESTAMP
			WHERE curriculum_profile_snapshots.import_owner = excluded.import_owner`,
			params: [JSON.stringify(profilePayload)]
		},
		{
			sql: `INSERT INTO question_curriculum_components (
			  question_id, curriculum_component_id, specification_id, is_primary,
			  confidence, mapping_source, mapping_notes, reviewed
			)
			SELECT
			  json_extract(entry.value, '$.questionId'),
			  json_extract(entry.value, '$.curriculumComponentId'),
			  json_extract(entry.value, '$.specificationId'),
			  json_extract(entry.value, '$.isPrimary'), json_extract(entry.value, '$.confidence'),
			  json_extract(entry.value, '$.mappingSource'),
			  json_extract(entry.value, '$.mappingNotes'), json_extract(entry.value, '$.reviewed')
			FROM json_each(?) AS entry
			WHERE 1
			ON CONFLICT(question_id, curriculum_component_id) DO UPDATE SET
			  specification_id = excluded.specification_id, is_primary = excluded.is_primary,
			  confidence = excluded.confidence, mapping_notes = excluded.mapping_notes,
			  mapping_source = excluded.mapping_source, reviewed = excluded.reviewed,
			  updated_at = CURRENT_TIMESTAMP
			WHERE question_curriculum_components.mapping_source LIKE '${CURRICULUM_IMPORT_OWNER}:%'`,
			params: [JSON.stringify(mappingPayload)]
		}
	];
}

/** @param {string} absolutePath */
export function inspectLocalPdf(absolutePath) {
	const sha256 = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
	const output = execFileSync('pdfinfo', [absolutePath], { encoding: 'utf8' });
	const match = output.match(/^Pages:\s+(\d+)\s*$/m);
	if (!match) throw new Error('pdfinfo did not report a page count');
	return { sha256, pageCount: Number(match[1]) };
}

/** @param {unknown} value */
export function stableStringify(value) {
	return JSON.stringify(sortJson(value));
}

/** @param {unknown} value */
export function sha256Stable(value) {
	return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/** @param {unknown} value @returns {unknown} */
function sortJson(value) {
	if (Array.isArray(value)) return value.map(sortJson);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, entry]) => [key, sortJson(entry)])
	);
}

/** @param {any} a @param {any} b */
function compareDisplayRows(a, b) {
	return (
		a.displayOrder - b.displayOrder || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
	);
}

/** @param {any} a @param {any} b */
function compareOfferings(a, b) {
	return (
		a.profileSubject.localeCompare(b.profileSubject) ||
		a.board.localeCompare(b.board) ||
		a.course.localeCompare(b.course) ||
		a.tier.localeCompare(b.tier) ||
		a.id.localeCompare(b.id)
	);
}

/** @param {any} offering */
function offeringProfileKey(offering) {
	return [
		offering.board,
		offering.qualification,
		offering.profileSubject,
		offering.course,
		offering.tier
	].join('\u0000');
}

/** @param {any} component @param {string} rootId @param {Map<string, any>} byId */
function isDescendantOrSelf(component, rootId, byId) {
	let cursor = component;
	while (cursor) {
		if (cursor.id === rootId) return true;
		cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
	}
	return false;
}

/** @param {unknown} value @param {string} board @param {string} label @param {string[]} issues @param {{allowAssetHost?: boolean}} [options] */
function validateOfficialUrl(value, board, label, issues, { allowAssetHost = false } = {}) {
	const text = requireText(value, label, issues);
	if (!text) return text;
	let url;
	try {
		url = new URL(text);
	} catch {
		issues.push(`${label} must be an absolute URL`);
		return text;
	}
	if (url.protocol !== 'https:') issues.push(`${label} must use HTTPS`);
	const allowed = (
		allowAssetHost ? OFFICIAL_ASSET_DOMAINS_BY_BOARD : OFFICIAL_DOMAINS_BY_BOARD
	).get(normalized(board));
	if (!allowed) {
		issues.push(`${label}: no reviewed official-domain rule exists for board ${board}`);
	} else if (
		!allowed.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
	) {
		issues.push(`${label} is not on an official ${board} domain`);
	}
	return text;
}

/** @param {unknown} value @param {string[]} issues */
function normalizeSchemaVersion(value, issues) {
	if (typeof value === 'number' && Number.isInteger(value) && value > 0) return String(value);
	return requireText(value, 'schemaVersion', issues);
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function normalizeComponentTier(value, label, issues) {
	if (value === null || value === 'Both') return [];
	const tiers =
		typeof value === 'string' && value.trim()
			? [value.trim()]
			: requireStringArray(value, label, issues);
	const uniqueTiers = [...new Set(tiers)];
	if (uniqueTiers.length !== tiers.length) issues.push(`${label} must not contain duplicates`);
	for (const tier of uniqueTiers) {
		if (!['Foundation', 'Higher'].includes(tier)) {
			issues.push(`${label} contains unsupported tier ${tier}`);
		}
	}
	return uniqueTiers;
}

/** @param {unknown} value @param {string} label @param {string[]} issues @returns {unknown[]} */
function requireArray(value, label, issues) {
	if (!Array.isArray(value) || !value.length) {
		issues.push(`${label} must be a non-empty array`);
		return Array.isArray(value) ? value : [];
	}
	return value;
}

/** @param {unknown} value @param {string} label @param {string[]} issues @param {{nonEmpty?: boolean}} [options] */
function requireStringArray(value, label, issues, { nonEmpty = false } = {}) {
	if (!Array.isArray(value) || (nonEmpty && !value.length)) {
		issues.push(`${label} must be ${nonEmpty ? 'a non-empty' : 'an'} array of strings`);
		return [];
	}
	const normalizedValues = value.map((entry, index) =>
		requireText(entry, `${label}[${index}]`, issues)
	);
	return normalizedValues;
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function requireText(value, label, issues) {
	if (typeof value !== 'string' || !value.trim()) {
		issues.push(`${label} must be a non-empty string`);
		return '';
	}
	return value.trim();
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function optionalText(value, label, issues) {
	if (value === null) return null;
	return requireText(value, label, issues);
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function requireBoolean(value, label, issues) {
	if (typeof value !== 'boolean') {
		issues.push(`${label} must be a boolean`);
		return false;
	}
	return value;
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function requireNonNegativeInteger(value, label, issues) {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		issues.push(`${label} must be a non-negative integer`);
		return 0;
	}
	return value;
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function requirePositiveInteger(value, label, issues) {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		issues.push(`${label} must be a positive integer`);
		return 0;
	}
	return value;
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function optionalPositiveInteger(value, label, issues) {
	if (value === null) return null;
	return requirePositiveInteger(value, label, issues);
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function optionalYear(value, label, issues) {
	if (value === null) return null;
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1900 || value > 2200) {
		issues.push(`${label} must be a four-digit year or null`);
		return null;
	}
	return value;
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function normalizeSha256(value, label, issues) {
	const text = requireText(value, label, issues)
		.replace(/^sha256:/i, '')
		.toLowerCase();
	if (text && !/^[a-f0-9]{64}$/.test(text)) issues.push(`${label} must be a SHA-256 hex digest`);
	return text;
}

/** @param {string[]} values @param {string} label @param {string[]} issues */
function uniqueValues(values, label, issues) {
	const seen = new Set();
	for (const value of values) {
		if (!value) continue;
		if (seen.has(value)) issues.push(`duplicate ${label}: ${value}`);
		seen.add(value);
	}
	return seen;
}

/** @param {unknown} value */
function normalized(value) {
	return String(value ?? '')
		.trim()
		.toLowerCase();
}

/** @param {unknown} value */
function slug(value) {
	return normalized(value)
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} error */
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

/** @param {any} a @param {any} b */
function compareNameRows(a, b) {
	return a.name.localeCompare(b.name);
}
