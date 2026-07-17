#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { validateStudyCardBundle } from './lib/study-card-artifact.mjs';

const rootDir = process.cwd();
const catalog = JSON.parse(
	readFileSync(path.join(rootDir, 'data/curricula/curriculum-catalog.json'), 'utf8')
);
const releaseRoot = path.join(rootDir, 'data/study-cards/releases');
const bundles = existsSync(releaseRoot)
	? readdirSync(releaseRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.flatMap((entry) => {
				const artifactPath = path.join(releaseRoot, entry.name, 'accepted-study-cards.json');
				return existsSync(artifactPath)
					? [validateStudyCardBundle(JSON.parse(readFileSync(artifactPath, 'utf8')))]
					: [];
			})
	: [];

const offeringGroups = new Map();
for (const offering of catalog.offerings) {
	if (offering.profileSubject === 'English Literature') continue;
	const key = `${offering.specificationId}|${offering.profileSubject}`;
	const rows = offeringGroups.get(key) ?? [];
	rows.push(offering);
	offeringGroups.set(key, rows);
}

const plans = [];
for (const [key, offerings] of offeringGroups) {
	const specification = catalog.specifications.find(
		(entry) => entry.id === offerings[0].specificationId
	);
	if (!specification) continue;
	const selectedRootIds = new Set(offerings.flatMap((offering) => offering.selectableComponentIds));
	if (!selectedRootIds.size) continue;
	const componentById = new Map(
		specification.components.map((component) => [component.id, component])
	);
	const isHigherOnly = (componentId) => {
		let current = componentById.get(componentId);
		while (current) {
			if (current.tier.length === 1 && current.tier[0] === 'Higher') return true;
			current = componentById.get(current.parentId);
		}
		return false;
	};
	const selectedRootFor = (componentId) => {
		let current = componentById.get(componentId);
		while (current) {
			if (selectedRootIds.has(current.id)) return current.id;
			current = componentById.get(current.parentId);
		}
		return null;
	};
	const eligibleComponents = specification.components.filter((component) => {
		if (!selectedRootFor(component.id)) return false;
		return component.kind === 'section' || component.kind === 'topic';
	});
	if (!eligibleComponents.length) continue;

	const offeringIds = new Set(offerings.map((offering) => offering.id));
	const coveredComponentIds = new Set(
		bundles.flatMap((bundle) =>
			bundle.cards.flatMap((card) =>
				card.targets
					.filter((target) => offeringIds.has(target.offeringId))
					.map((target) => target.curriculumComponentId)
			)
		)
	);
	const hasFoundation = offerings.some((offering) => offering.tier === 'Foundation');
	const hasHigher = offerings.some((offering) => offering.tier === 'Higher');
	const modes = hasFoundation && hasHigher ? ['shared', 'higher-only'] : ['all'];
	for (const mode of modes) {
		const applicable = eligibleComponents.filter((component) => {
			if (mode === 'higher-only') {
				return isHigherOnly(component.id);
			}
			if (mode === 'shared') return !isHigherOnly(component.id);
			return true;
		});
		const uncovered = applicable.filter((component) => !coveredComponentIds.has(component.id));
		const bySelectableRoot = [...selectedRootIds]
			.map((rootId) => {
				const root = componentById.get(rootId);
				const eligible = applicable.filter((component) => selectedRootFor(component.id) === rootId);
				const missing = uncovered.filter((component) => selectedRootFor(component.id) === rootId);
				return {
					rootId,
					code: root?.code ?? null,
					title: root?.title ?? null,
					eligible: eligible.length,
					covered: eligible.length - missing.length,
					uncovered: missing.length
				};
			})
			.filter((row) => row.eligible > 0);
		plans.push({
			key,
			specificationId: specification.id,
			subject: offerings[0].profileSubject,
			mode,
			offeringIds: offerings
				.filter((offering) => mode !== 'higher-only' || offering.tier === 'Higher')
				.map((offering) => offering.id),
			eligibleComponentCount: applicable.length,
			coveredComponentCount: applicable.length - uncovered.length,
			uncoveredComponentCount: uncovered.length,
			recommendedCardCount: uncovered.length,
			bySelectableRoot,
			uncoveredComponents: uncovered.map((component) => ({
				id: component.id,
				parentId: component.parentId,
				kind: component.kind,
				tier: component.tier,
				code: component.code,
				title: component.title,
				selectableRootId: selectedRootFor(component.id)
			}))
		});
	}
}

console.log(
	JSON.stringify(
		{
			generatedAt: new Date().toISOString(),
			definition:
				'One additive card for each uncovered official section or topic descendant; Higher-only rows are separate from Foundation/shared rows.',
			plans
		},
		null,
		2
	)
);
