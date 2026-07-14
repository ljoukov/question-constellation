import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	buildCurriculumImportSnapshot,
	validateCurriculumCatalog
} from './lib/curriculum-catalog.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
	await readFile(path.join(repoRoot, 'data/curricula/source-manifest.json'), 'utf8')
);
const catalog = JSON.parse(
	await readFile(path.join(repoRoot, 'data/curricula/curriculum-catalog.json'), 'utf8')
);
const errors = [];

function assert(condition, message) {
	if (!condition) errors.push(message);
}

function pdfPageCount(filePath) {
	const output = execFileSync('pdfinfo', [filePath], { encoding: 'utf8' });
	return Number(output.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
}

assert(manifest.schemaVersion === '1', 'source manifest schemaVersion must be "1"');
assert(
	Array.isArray(manifest.sources) && manifest.sources.length === 10,
	'source manifest must contain 10 official specification files'
);

const sourceIds = new Set();
for (const source of manifest.sources ?? []) {
	assert(!sourceIds.has(source.id), `duplicate source id ${source.id}`);
	sourceIds.add(source.id);
	assert(
		/^https:\/\/(?:www\.)?aqa\.org\.uk\//.test(source.landingUrl) ||
			/^https:\/\/(?:www\.)?ocr\.org\.uk\//.test(source.landingUrl),
		`${source.id}: landing URL is not on the official board domain`
	);
	assert(source.pdfUrl.startsWith('https://'), `${source.id}: PDF URL must use HTTPS`);
	assert(
		source.board === 'AQA'
			? /^(?:https:\/\/cdn\.sanity\.io\/files\/p28bar15\/green\/|https:\/\/(?:www\.)?aqa\.org\.uk\/)/.test(
					source.pdfUrl
				)
			: /^https:\/\/(?:www\.)?ocr\.org\.uk\//.test(source.pdfUrl),
		`${source.id}: PDF URL is not an approved official asset URL`
	);
	assert(/^[a-f0-9]{64}$/.test(source.sha256 ?? ''), `${source.id}: missing sha256`);
	assert(
		/^\d{4}-\d{2}-\d{2}$/.test(source.versionDate ?? ''),
		`${source.id}: versionDate must be a normalized ISO date`
	);
	assert(
		source.versionDatePrecision === 'day' || source.versionDatePrecision === 'month',
		`${source.id}: versionDatePrecision must state whether the source gives a day or month`
	);
	if (source.versionDatePrecision === 'month') {
		assert(
			source.versionDate.endsWith('-01'),
			`${source.id}: month-precision versionDate must use the first day as its normalized value`
		);
	}
	assert(
		Number.isInteger(source.pageCount) && source.pageCount > 0,
		`${source.id}: invalid page count`
	);
	const filePath = path.join(repoRoot, source.localPath);
	try {
		await access(filePath);
		const buffer = await readFile(filePath);
		assert(
			buffer.subarray(0, 5).equals(Buffer.from('%PDF-')),
			`${source.id}: local file is not a PDF`
		);
		assert(
			createHash('sha256').update(buffer).digest('hex') === source.sha256,
			`${source.id}: local hash does not match manifest`
		);
		assert(
			pdfPageCount(filePath) === source.pageCount,
			`${source.id}: local page count does not match manifest`
		);
	} catch (error) {
		errors.push(`${source.id}: cannot validate local file (${error.message})`);
	}
}

assert(catalog.schemaVersion === '1', 'catalog schemaVersion must be "1"');
assert(
	Array.isArray(catalog.specifications) && catalog.specifications.length === 10,
	'catalog must contain 10 specification versions'
);
assert(Array.isArray(catalog.offerings), 'catalog offerings must be an array');
assert(catalog.offerings?.length === 17, 'catalog must contain the 17 supported course offerings');

const expectedCodes = new Set([
	'8461',
	'8462',
	'8463',
	'8464',
	'8525',
	'8035',
	'8145',
	'J351',
	'J352'
]);
const seenCodes = new Set();
const allComponentIds = new Set();
const specificationById = new Map();

for (const specification of catalog.specifications ?? []) {
	assert(sourceIds.has(specification.id), `${specification.id}: no matching source manifest row`);
	assert(
		!specificationById.has(specification.id),
		`duplicate specification id ${specification.id}`
	);
	specificationById.set(specification.id, specification);
	seenCodes.add(specification.specificationCode);
	const source = manifest.sources.find((entry) => entry.id === specification.id);
	for (const key of [
		'board',
		'qualification',
		'specificationCode',
		'version',
		'landingUrl',
		'pdfUrl',
		'localPath',
		'sha256',
		'pageCount'
	]) {
		assert(
			specification[key] === source?.[key],
			`${specification.id}: ${key} differs from source manifest`
		);
	}
	assert(
		Array.isArray(specification.profileSubjects),
		`${specification.id}: profileSubjects must be an array`
	);
	assert(
		Array.isArray(specification.components) && specification.components.length > 0,
		`${specification.id}: components must be nonempty`
	);
	const ids = new Set();
	const codes = new Set();
	const specRefOwners = new Map();
	const examCodeOwners = new Map();
	for (const component of specification.components ?? []) {
		assert(!ids.has(component.id), `${specification.id}: duplicate component id ${component.id}`);
		assert(!allComponentIds.has(component.id), `global duplicate component id ${component.id}`);
		assert(
			Array.isArray(component.tier) &&
				component.tier.every((tier) => tier === 'Foundation' || tier === 'Higher'),
			`${component.id}: tier must be an array of official tier names`
		);
		assert(
			!codes.has(component.code),
			`${specification.id}: duplicate component code ${component.code}`
		);
		ids.add(component.id);
		codes.add(component.code);
		allComponentIds.add(component.id);
		assert(
			typeof component.title === 'string' && component.title.trim().length > 0,
			`${component.id}: empty title`
		);
		assert(
			Number.isInteger(component.depth) && component.depth >= 0,
			`${component.id}: invalid depth`
		);
		assert(
			Number.isInteger(component.displayOrder) && component.displayOrder >= 0,
			`${component.id}: invalid display order`
		);
		assert(
			component.sourcePageStart === null ||
				(Number.isInteger(component.sourcePageStart) &&
					component.sourcePageStart >= 1 &&
					component.sourcePageStart <= specification.pageCount),
			`${component.id}: invalid sourcePageStart`
		);
		assert(
			component.sourcePageEnd === null ||
				(Number.isInteger(component.sourcePageEnd) &&
					component.sourcePageEnd >= component.sourcePageStart &&
					component.sourcePageEnd <= specification.pageCount),
			`${component.id}: invalid sourcePageEnd`
		);
		assert(
			component.metadata &&
				typeof component.metadata === 'object' &&
				!Array.isArray(component.metadata),
			`${component.id}: metadata must be an object`
		);
		if (component.metadata.specRefs !== undefined)
			assert(
				Array.isArray(component.metadata.specRefs) &&
					component.metadata.specRefs.every(
						(value) => typeof value === 'string' && value.length > 0
					),
				`${component.id}: specRefs must be nonempty strings`
			);
		for (const specRef of component.metadata.specRefs ?? []) {
			const owner = specRefOwners.get(specRef);
			assert(
				!owner || owner === component.id,
				`${component.id}: trusted specRef ${specRef} is also owned by ${owner}`
			);
			specRefOwners.set(specRef, component.id);
		}
		if (component.metadata.examComponentCodes !== undefined)
			assert(
				Array.isArray(component.metadata.examComponentCodes) &&
					component.metadata.examComponentCodes.every(
						(value) => typeof value === 'string' && value.length > 0
					),
				`${component.id}: examComponentCodes must be nonempty strings`
			);
		for (const examCode of component.metadata.examComponentCodes ?? []) {
			const owner = examCodeOwners.get(examCode);
			assert(
				!owner || owner === component.id,
				`${component.id}: trusted examComponentCode ${examCode} is also owned by ${owner}`
			);
			examCodeOwners.set(examCode, component.id);
		}
		if (component.kind === 'option_group') {
			assert(
				Number.isInteger(component.metadata.selectionMin),
				`${component.id}: option group missing selectionMin`
			);
			assert(
				Number.isInteger(component.metadata.selectionMax),
				`${component.id}: option group missing selectionMax`
			);
			assert(
				component.metadata.selectionMin <= component.metadata.selectionMax,
				`${component.id}: invalid selection constraints`
			);
		}
		if (component.optionGroupId)
			assert(component.selectable, `${component.id}: constrained option must be selectable`);
		if (component.kind === 'option') {
			assert(Boolean(component.optionGroupId), `${component.id}: option is missing optionGroupId`);
		}
	}
	for (const component of specification.components ?? []) {
		if (component.parentId === null) {
			assert(component.depth === 0, `${component.id}: only the root may have no parent`);
			continue;
		}
		const parent = specification.components.find((entry) => entry.id === component.parentId);
		assert(Boolean(parent), `${component.id}: missing parent ${component.parentId}`);
		if (parent)
			assert(component.depth === parent.depth + 1, `${component.id}: depth does not follow parent`);
		if (component.optionGroupId) {
			const group = specification.components.find((entry) => entry.id === component.optionGroupId);
			assert(
				Boolean(group) && group.kind === 'option_group',
				`${component.id}: invalid optionGroupId`
			);
			assert(
				component.parentId === component.optionGroupId,
				`${component.id}: constrained option must be a direct child of its group`
			);
		}
	}
	assert(
		specification.components.some((component) => component.selectable),
		`${specification.id}: no learner-selectable components`
	);
	if (specification.status === 'legacy') {
		assert(
			specification.profileSubjects.length === 0,
			`${specification.id}: legacy specification must not be a current profile offering`
		);
	}
}

for (const code of expectedCodes)
	assert(seenCodes.has(code), `catalog is missing specification code ${code}`);

function isDescendant(specification, componentId, rootId) {
	const byId = new Map(specification.components.map((component) => [component.id, component]));
	let current = byId.get(componentId);
	while (current) {
		if (current.id === rootId) return true;
		current = current.parentId ? byId.get(current.parentId) : null;
	}
	return false;
}

const offeringIds = new Set();
for (const offering of catalog.offerings ?? []) {
	assert(!offeringIds.has(offering.id), `duplicate offering id ${offering.id}`);
	offeringIds.add(offering.id);
	const specification = specificationById.get(offering.specificationId);
	assert(Boolean(specification), `${offering.id}: missing specification`);
	assert(
		offering.tier === 'Foundation' || offering.tier === 'Higher',
		`${offering.id}: tier must match persisted profile contract`
	);
	assert(
		Array.isArray(offering.selectableComponentIds) && offering.selectableComponentIds.length > 0,
		`${offering.id}: selectableComponentIds must be nonempty`
	);
	if (!specification) continue;
	const root = specification.components.find(
		(component) => component.id === offering.rootComponentId
	);
	assert(Boolean(root), `${offering.id}: missing root component`);
	for (const id of offering.selectableComponentIds ?? []) {
		const component = specification.components.find((entry) => entry.id === id);
		assert(Boolean(component), `${offering.id}: missing selectable component ${id}`);
		assert(component?.selectable, `${offering.id}: ${id} is not learner-selectable`);
		assert(
			isDescendant(specification, id, offering.rootComponentId),
			`${offering.id}: ${id} is outside the offering root`
		);
	}
}

const offeringTuples = new Set();
for (const offering of catalog.offerings ?? []) {
	const tuple = [
		offering.board,
		offering.qualification,
		offering.profileSubject,
		offering.course,
		offering.tier
	].join('|');
	assert(!offeringTuples.has(tuple), `duplicate profile offering tuple ${tuple}`);
	offeringTuples.add(tuple);
	if (offering.tier === 'Foundation') {
		assert(!offering.isDefault, `${offering.id}: Foundation must not be a current default`);
	} else {
		assert(offering.isDefault, `${offering.id}: current Higher offering must be a default`);
	}
	assert(
		specificationById.get(offering.specificationId)?.status !== 'legacy',
		`${offering.id}: legacy specification must not have an offering`
	);
}

const profileSubjects = new Set(catalog.offerings.map((offering) => offering.profileSubject));
for (const subject of [
	'Biology',
	'Chemistry',
	'Physics',
	'Computer Science',
	'Geography',
	'History',
	'English Language',
	'English Literature'
]) {
	assert(profileSubjects.has(subject), `no offering for profile subject ${subject}`);
}

let importSnapshot = null;
try {
	importSnapshot = buildCurriculumImportSnapshot(
		validateCurriculumCatalog(catalog, { rootDir: repoRoot })
	);
} catch (error) {
	errors.push(`runtime curriculum snapshot could not be built (${error.message})`);
}

for (const offering of importSnapshot?.offerings ?? []) {
	const specification = specificationById.get(offering.specificationId);
	if (!specification) continue;
	const componentsById = new Map(
		specification.components.map((component) => [component.id, component])
	);
	const ordinaryIds = offering.selectableComponentIds.filter(
		(componentId) => !componentsById.get(componentId)?.optionGroupId
	);
	const optionGroupIds = new Set(
		offering.selectableComponentIds
			.map((componentId) => componentsById.get(componentId)?.optionGroupId)
			.filter(Boolean)
	);
	const curriculumGroups = offering.selectionTree.groups.filter(
		(group) => group.kind === 'curriculum'
	);
	const optionGroups = offering.selectionTree.groups.filter(
		(group) => group.kind === 'option_group'
	);

	assert(
		offering.selectionTree.groups.every(
			(group) => group.kind === 'curriculum' || group.kind === 'option_group'
		),
		`${offering.id}: selection groups must be curriculum or genuine option groups`
	);
	assert(
		offering.selectionTree.groups.every(
			(group) => !/\bpaper\b|\bcomponent\s+\d/i.test(group.title)
		),
		`${offering.id}: persistent curriculum scope must not be labelled by exam papers`
	);
	assert(
		offering.selectionTree.groups
			.flatMap((group) => group.components)
			.every((component) => !Object.hasOwn(component, 'paper')),
		`${offering.id}: selection-tree components must not expose paper metadata`
	);

	if (ordinaryIds.length) {
		assert(
			curriculumGroups.length === 1,
			`${offering.id}: ordinary specification content must use one curriculum group`
		);
		assert(
			['Chapters', 'Topics', 'Course content'].includes(curriculumGroups[0]?.title),
			`${offering.id}: ordinary group must use a neutral specification-content title`
		);
		assert(
			JSON.stringify(
				(curriculumGroups[0]?.components ?? []).map((component) => component.id).sort()
			) === JSON.stringify([...ordinaryIds].sort()),
			`${offering.id}: curriculum group must contain every ordinary selectable component exactly once`
		);
	} else {
		assert(
			curriculumGroups.length === 0,
			`${offering.id}: empty ordinary content must not create a curriculum group`
		);
	}

	assert(
		optionGroups.length === optionGroupIds.size,
		`${offering.id}: every genuine option group must remain distinct`
	);
	for (const groupId of optionGroupIds) {
		const sourceGroup = componentsById.get(groupId);
		const snapshotGroup = optionGroups.find((group) => group.id === groupId);
		assert(Boolean(snapshotGroup), `${offering.id}: missing option group ${groupId}`);
		assert(
			snapshotGroup?.title === sourceGroup?.title,
			`${offering.id}: option group ${groupId} must retain its official title`
		);
		assert(
			snapshotGroup?.selectionMin === sourceGroup?.metadata.selectionMin &&
				snapshotGroup?.selectionMax === sourceGroup?.metadata.selectionMax,
			`${offering.id}: option group ${groupId} must retain its selection constraints`
		);
	}
}

const history = specificationById.get('aqa-gcse-history-8145-v1.3');
for (const [code, count] of [
	['3.2.1', 4],
	['3.2.2', 5],
	['3.3.1', 3],
	['3.3.2', 4]
]) {
	const group = history?.components.find((component) => component.code === code);
	assert(Boolean(group), `History option group ${code} is missing`);
	assert(
		history?.components.filter((component) => component.optionGroupId === group?.id).length ===
			count,
		`History option group ${code} should contain ${count} choices`
	);
}

const literature = specificationById.get('ocr-gcse-english-literature-j352-v3.0');
for (const [code, count] of [
	['01.modern', 6],
	['01.nineteenth-century', 6],
	['02.poetry', 3],
	['02.shakespeare', 4]
]) {
	const group = literature?.components.find((component) => component.code === code);
	assert(Boolean(group), `English Literature option group ${code} is missing`);
	assert(
		literature?.components.filter((component) => component.optionGroupId === group?.id).length ===
			count,
		`English Literature option group ${code} should contain ${count} choices`
	);
}

if (errors.length) {
	console.error(`Official curriculum validation failed with ${errors.length} issue(s):`);
	for (const error of errors) console.error(`- ${error}`);
	process.exitCode = 1;
} else {
	console.log(
		`Official curriculum validation passed: ${manifest.sources.length} source PDFs, ${catalog.specifications.length} specification versions, ${catalog.specifications.reduce((sum, specification) => sum + specification.components.length, 0)} components, ${catalog.offerings.length} offerings.`
	);
}
