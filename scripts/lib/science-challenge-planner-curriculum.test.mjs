import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	assertSubstantiveCurriculumEvidence,
	substantiveCurriculumEvidenceBody,
	trueCurriculumTopicLeaves
} from './science-challenge-planner-curriculum.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(
	readFileSync(path.join(rootDir, 'data/curricula/curriculum-catalog.json'), 'utf8')
);
const physics = catalog.specifications.find(
	(specification) => specification.id === 'aqa-gcse-physics-8463-v1.1'
);
const componentById = new Map(physics.components.map((component) => [component.id, component]));
const forcesParent = componentById.get('aqa-gcse-physics-8463-v1.1:4-5-6-2');
const secondLawLeaf = componentById.get('aqa-gcse-physics-8463-v1.1:4-5-6-2-2');

test('planner treats only terminal topic nodes as curriculum leaves', () => {
	const leaves = trueCurriculumTopicLeaves(physics.components);
	const leafIds = new Set(leaves.map((component) => component.id));

	assert.equal(forcesParent.kind, 'topic');
	assert.equal(secondLawLeaf.kind, 'topic');
	assert.equal(leafIds.has(forcesParent.id), false);
	assert.equal(leafIds.has(secondLawLeaf.id), true);
	assert.equal(
		physics.components.some((component) => component.parentId === secondLawLeaf.id),
		false
	);
});

test('planner rejects heading-only parent evidence and accepts substantive leaf evidence', () => {
	const headingOnlyParentEvidence = [
		`${forcesParent.code} ${forcesParent.title}`,
		'Visit aqa.org.uk/8463 for the most up-to-date specification, resources, support and administration 55'
	].join('\n');
	assert.equal(substantiveCurriculumEvidenceBody(forcesParent, headingOnlyParentEvidence), '');
	assert.throws(
		() => assertSubstantiveCurriculumEvidence(forcesParent, headingOnlyParentEvidence),
		/no substantive source evidence beyond its heading/u
	);
	const wrappedHeadingOnlyParentEvidence = [
		`${forcesParent.code} Forces, accelerations and`,
		"Newton's Laws of motion",
		'Content Key opportunities for skills development'
	].join('\n');
	assert.equal(
		substantiveCurriculumEvidenceBody(forcesParent, wrappedHeadingOnlyParentEvidence),
		''
	);
	assert.throws(
		() => assertSubstantiveCurriculumEvidence(forcesParent, wrappedHeadingOnlyParentEvidence),
		/no substantive source evidence beyond its heading/u
	);

	const substantiveLeafEvidence = [
		`${secondLawLeaf.code} ${secondLawLeaf.title}`,
		'Content Key opportunities for skills development',
		'The acceleration of an object is proportional to the resultant force acting on it.',
		'For a fixed resultant force, increasing the mass decreases the acceleration of the object.'
	].join('\n');
	assert.match(
		assertSubstantiveCurriculumEvidence(secondLawLeaf, substantiveLeafEvidence),
		/resultant force acting on it/u
	);
});

test('planner fails closed when a true leaf extraction contains only its heading', () => {
	assert.throws(
		() =>
			assertSubstantiveCurriculumEvidence(
				secondLawLeaf,
				`${secondLawLeaf.code} ${secondLawLeaf.title}`
			),
		/no substantive source evidence beyond its heading/u
	);
});

test('planner fails closed on a broken curriculum parent graph', () => {
	const brokenComponents = physics.components.map((component) =>
		component.id === secondLawLeaf.id
			? { ...component, parentId: 'aqa-gcse-physics-8463-v1.1:missing-parent' }
			: component
	);
	assert.throws(
		() => trueCurriculumTopicLeaves(brokenComponents),
		/refers to missing parent aqa-gcse-physics-8463-v1\.1:missing-parent/u
	);
});
