import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { validateCurriculumCatalog } from './curriculum-catalog.mjs';
import {
	RECALL_MAPPING_SOURCE,
	normalizeEvidenceText,
	sha256,
	stableStringify
} from './recall-card-bundle.mjs';

/** @typedef {Record<string, any>} AnyRecord */

const SCIENCE_SUBJECTS = new Set(['Biology', 'Chemistry', 'Physics']);

/**
 * Load one exact official curriculum component and its PDF pages. The loader
 * owns all database IDs later used by the compiler; the model never invents a
 * specification, component, offering, page range, or source hash.
 *
 * @param {{
 *  rootDir?: string, catalogPath?: string, specificationId: string,
 *  componentId: string, subject?: string, offeringIds?: string[],
 *  primaryOfferingId?: string, extractPdfPages?: typeof extractOfficialPdfPages
 * }} input
 */
export function loadOfficialRecallEvidence({
	rootDir = process.cwd(),
	catalogPath = 'data/curricula/curriculum-catalog.json',
	specificationId,
	componentId,
	subject,
	offeringIds = [],
	primaryOfferingId,
	extractPdfPages = extractOfficialPdfPages
}) {
	const absoluteCatalogPath = path.resolve(rootDir, catalogPath);
	const catalog = validateCurriculumCatalog(JSON.parse(readFileSync(absoluteCatalogPath, 'utf8')), {
		rootDir
	});
	const specification = catalog.specifications.find((row) => row.id === specificationId);
	if (!specification) throw new Error(`Unknown curriculum specification: ${specificationId}`);
	const component = specification.components.find((row) => row.id === componentId);
	if (!component) throw new Error(`Unknown component ${componentId} in ${specificationId}`);
	if (!Number.isInteger(component.sourcePageStart) || !Number.isInteger(component.sourcePageEnd)) {
		throw new Error(`Component ${componentId} has no exact official page range.`);
	}
	const pageText = extractPdfPages({
		pdfPath: path.resolve(rootDir, specification.localPath),
		pageStart: Number(component.sourcePageStart),
		pageEnd: Number(component.sourcePageEnd)
	});
	return resolveOfficialRecallEvidence({
		catalog,
		catalogPath: path.relative(rootDir, absoluteCatalogPath),
		specificationId,
		componentId,
		subject,
		offeringIds,
		primaryOfferingId,
		pageText
	});
}

/**
 * Pure evidence resolver used by tests and by the filesystem loader above.
 *
 * @param {{
 *  catalog:any, catalogPath:string, specificationId:string, componentId:string,
 *  subject?:string, offeringIds?:string[], primaryOfferingId?:string, pageText:string
 * }} input
 */
export function resolveOfficialRecallEvidence({
	catalog,
	catalogPath,
	specificationId,
	componentId,
	subject,
	offeringIds = [],
	primaryOfferingId,
	pageText
}) {
	const specifications = /** @type {AnyRecord[]} */ (catalog.specifications);
	const catalogOfferings = /** @type {AnyRecord[]} */ (catalog.offerings);
	const specification = specifications.find((row) => row.id === specificationId);
	if (!specification) throw new Error(`Unknown curriculum specification: ${specificationId}`);
	const specificationComponents = /** @type {AnyRecord[]} */ (specification.components);
	const componentsById = new Map(specificationComponents.map((row) => [row.id, row]));
	const component = componentsById.get(componentId);
	if (!component) throw new Error(`Unknown component ${componentId} in ${specificationId}`);
	if (!['topic', 'section'].includes(component.kind)) {
		throw new Error(
			`Recall generation requires a focused topic or section component, not ${component.kind}.`
		);
	}
	const pageStart = component.sourcePageStart;
	const pageEnd = component.sourcePageEnd;
	if (!Number.isInteger(pageStart) || !Number.isInteger(pageEnd) || pageEnd < pageStart) {
		throw new Error(`Component ${componentId} has an invalid official page range.`);
	}
	if (pageEnd - pageStart + 1 > 4) {
		throw new Error(
			`Component ${componentId} spans more than four pages; select a narrower official topic.`
		);
	}
	const normalizedPageText = normalizeEvidenceText(pageText);
	if (normalizedPageText.length < 80) {
		throw new Error(`Official PDF pages ${pageStart}-${pageEnd} did not yield enough source text.`);
	}

	const resolvedSubject = resolveScienceSubject(specification, component, subject);
	const topicComponent = nearestSelectableAncestor(component, componentsById);
	if (!topicComponent) {
		throw new Error(`Component ${componentId} has no selectable curriculum ancestor.`);
	}
	const compatibleOfferings = catalogOfferings
		.filter(
			(offering) =>
				offering.specificationId === specification.id &&
				offering.profileSubject === resolvedSubject &&
				isDescendantOf(component, offering.rootComponentId, componentsById) &&
				componentAppliesToTier(component, offering.tier)
		)
		.sort((a, b) => a.id.localeCompare(b.id));
	if (compatibleOfferings.length === 0) {
		throw new Error(`No curriculum offering covers ${componentId} for ${resolvedSubject}.`);
	}
	if (!offeringIds.length) {
		throw new Error(
			'Recall generation requires at least one explicit --offering-id; tier scope is never inferred.'
		);
	}
	const selectedOfferings = offeringIds.map((id) => {
		const offering = compatibleOfferings.find((row) => row.id === id);
		if (!offering) throw new Error(`Offering ${id} does not cover ${componentId}.`);
		return offering;
	});
	if (new Set(selectedOfferings.map((row) => row.id)).size !== selectedOfferings.length) {
		throw new Error('Offering selection contains duplicates.');
	}
	if (selectedOfferings.length > 1 && !primaryOfferingId) {
		throw new Error('--primary-offering-id is required when more than one offering is selected.');
	}
	if (
		selectedOfferings.some((offering) => offering.tier === 'Foundation') &&
		/\b(?:HT\s+only|higher\s+tier\s+only|higher\s+tier\s+students?)\b/i.test(pageText)
	) {
		throw new Error(
			`Official pages ${pageStart}-${pageEnd} contain Higher-tier-only material and cannot target Foundation.`
		);
	}
	const primary = primaryOfferingId
		? selectedOfferings.find((row) => row.id === primaryOfferingId)
		: selectedOfferings[0];
	if (!primary) {
		throw new Error(`Primary offering ${primaryOfferingId} is not in the selected offering set.`);
	}
	const targets = selectedOfferings.map((offering) => ({
		offeringId: offering.id,
		curriculumComponentId: component.id,
		topicComponentId: topicComponent.id,
		isPrimary: offering.id === primary.id,
		confidence: 1,
		reviewed: true,
		mappingSource: RECALL_MAPPING_SOURCE
	}));

	const publicSpecification = {
		id: specification.id,
		board: specification.board,
		qualification: specification.qualification,
		subject: specification.subject,
		course: specification.course,
		specificationCode: specification.specificationCode,
		version: specification.version,
		title: specification.title,
		landingUrl: specification.landingUrl,
		pdfUrl: specification.pdfUrl,
		localPath: specification.localPath,
		sha256: specification.sha256
	};
	const publicComponent = summarizeComponent(component);
	const publicTopicComponent = summarizeComponent(topicComponent);
	const fingerprint = sha256(
		stableStringify({
			catalogSchemaVersion: catalog.schemaVersion,
			specification: publicSpecification,
			component: publicComponent,
			topicComponent: publicTopicComponent,
			pageStart,
			pageEnd,
			pageText: normalizedPageText,
			targets
		})
	);
	return {
		catalogSchemaVersion: catalog.schemaVersion,
		catalogPath,
		specification: publicSpecification,
		component: publicComponent,
		topicComponent: publicTopicComponent,
		subject: resolvedSubject,
		pageStart,
		pageEnd,
		pageText,
		normalizedPageText,
		targets,
		fingerprint
	};
}

/**
 * Extract physical PDF pages without mutating the cached official source.
 * Catalog page ranges are physical PDF page numbers, matching pdftotext -f/-l.
 * `-raw` follows the PDF's authored reading order more closely than `-layout`.
 * That matters for two-column specifications: layout extraction can splice
 * skills-development notes into the middle of a content sentence, making a
 * genuinely verbatim evidence excerpt impossible to audit as one span.
 *
 * @param {{pdfPath:string, pageStart:number, pageEnd:number}} input
 */
export function extractOfficialPdfPages({ pdfPath, pageStart, pageEnd }) {
	try {
		return execFileSync(
			'pdftotext',
			['-f', String(pageStart), '-l', String(pageEnd), '-raw', '-nopgbrk', pdfPath, '-'],
			{ encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
		);
	} catch (error) {
		throw new Error(
			`Could not extract official PDF pages ${pageStart}-${pageEnd}: ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error }
		);
	}
}

/** @param {any} specification @param {any} component @param {string|undefined} requested */
function resolveScienceSubject(specification, component, requested) {
	const inferred = SCIENCE_SUBJECTS.has(specification.subject)
		? specification.subject
		: component.subjectArea;
	if (!SCIENCE_SUBJECTS.has(inferred)) {
		throw new Error(`${component.id} is not an AQA GCSE Biology, Chemistry or Physics component.`);
	}
	if (specification.board !== 'AQA' || specification.qualification !== 'GCSE') {
		throw new Error('Recall generation currently supports only official AQA GCSE science.');
	}
	if (requested && requested !== inferred) {
		throw new Error(`Requested subject ${requested} does not match component subject ${inferred}.`);
	}
	return inferred;
}

/** @param {any} component @param {Map<string,any>} componentsById */
function nearestSelectableAncestor(component, componentsById) {
	let current = component;
	while (current) {
		if (current.selectable) return current;
		current = current.parentId ? componentsById.get(current.parentId) : null;
	}
	return null;
}

/** @param {any} component @param {string} ancestorId @param {Map<string,any>} componentsById */
function isDescendantOf(component, ancestorId, componentsById) {
	let current = component;
	while (current) {
		if (current.id === ancestorId) return true;
		current = current.parentId ? componentsById.get(current.parentId) : null;
	}
	return false;
}

/** @param {any} component @param {string} tier */
function componentAppliesToTier(component, tier) {
	return (
		!Array.isArray(component.tier) || component.tier.length === 0 || component.tier.includes(tier)
	);
}

/** @param {any} component */
function summarizeComponent(component) {
	return {
		id: component.id,
		parentId: component.parentId,
		code: component.code,
		title: component.title,
		kind: component.kind,
		subjectArea: component.subjectArea,
		tier: component.tier,
		sourcePageStart: component.sourcePageStart,
		sourcePageEnd: component.sourcePageEnd
	};
}
