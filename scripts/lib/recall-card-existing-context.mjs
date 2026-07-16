import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
	recallCards as staticRecallCards,
	recallCurriculumTopics
} from '../../src/lib/recall/aqaScienceRecall.ts';
import { recallVisualCueById } from '../../src/lib/recall/visualCues.js';

/** @typedef {Record<string, any>} AnyRecord */

/** @type {Readonly<Record<string, {offeringId:string, specificationId:string}>>} */
const STATIC_SEPARATE_HIGHER_SCOPE = Object.freeze({
	Biology: {
		offeringId: 'aqa-gcse-biology-8461-v1.0:higher',
		specificationId: 'aqa-gcse-biology-8461-v1.0'
	},
	Chemistry: {
		offeringId: 'aqa-gcse-chemistry-8462-v1.1:higher',
		specificationId: 'aqa-gcse-chemistry-8462-v1.1'
	},
	Physics: {
		offeringId: 'aqa-gcse-physics-8463-v1.1:higher',
		specificationId: 'aqa-gcse-physics-8463-v1.1'
	}
});

/**
 * Build a deterministic additive-generation identity snapshot. Published D1
 * state is still the importer's final authority; this local index prevents the
 * generator from casually reusing an existing stable id/concept or proposing
 * an exact card already present in a durable reviewed bundle.
 *
 * @param {{rootDir:string, subject:string, topicComponentId:string, offeringIds:string[]}} input
 */
export function loadExistingRecallCardContext({ rootDir, subject, topicComponentId, offeringIds }) {
	const generatedRoot = path.join(rootDir, 'data/recall/generated');
	const artifactCards = [];
	if (existsSync(generatedRoot)) {
		const entries = readdirSync(generatedRoot, { withFileTypes: true }).sort((left, right) =>
			left.name.localeCompare(right.name)
		);
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const acceptedPath = path.join(generatedRoot, entry.name, 'accepted-cards.json');
			if (!existsSync(acceptedPath)) continue;
			const artifactPath = path.relative(rootDir, acceptedPath);
			let artifact;
			try {
				artifact = JSON.parse(readFileSync(acceptedPath, 'utf8'));
			} catch (error) {
				throw new Error(
					`Cannot build additive recall context: ${artifactPath} is not valid JSON (${error instanceof Error ? error.message : String(error)}).`
				);
			}
			const cards = validateContextArtifact(artifact, artifactPath, entry.name);
			for (const card of cards) {
				artifactCards.push({
					id: text(card.id),
					conceptKey: text(card.conceptKey),
					subject: text(card.subject),
					front: text(card.front),
					back: text(card.back),
					targets: card.targets,
					artifactPath
				});
			}
		}
	}
	assertConsistentArtifactIdentities(artifactCards);

	const reservedIds = [
		...new Set(
			[...Object.keys(recallVisualCueById), ...artifactCards.map((card) => card.id)].filter(Boolean)
		)
	].sort();
	const reservedConceptKeys = [
		...new Set(
			artifactCards
				.filter((card) => card.subject === subject)
				.map((card) => card.conceptKey)
				.filter(Boolean)
		)
	].sort();
	const selectedOfferings = new Set(offeringIds);
	const targetCardByIdentity = new Map();
	for (const card of [
		...artifactCards,
		...staticTargetCards(subject, topicComponentId, selectedOfferings)
	]) {
		if (card.subject !== subject) continue;
		const targetMatches = card.targets.some(
			/** @param {any} target */
			(target) =>
				target &&
				typeof target === 'object' &&
				selectedOfferings.has(target.offeringId) &&
				target.topicComponentId === topicComponentId
		);
		if (!targetMatches || !card.front || !card.back) continue;
		const identity = `${normalize(card.front)}\u0000${normalize(card.back)}`;
		if (!targetCardByIdentity.has(identity)) {
			targetCardByIdentity.set(identity, {
				id: card.id,
				conceptKey: card.conceptKey,
				front: card.front,
				back: card.back,
				artifactPath: card.artifactPath
			});
		}
	}

	return {
		mode: 'additive',
		reservedIds,
		reservedConceptKeys,
		existingTargetCards: [...targetCardByIdentity.values()].sort((left, right) =>
			left.id.localeCompare(right.id)
		)
	};
}

/**
 * The model may suggest any text, but additive compilation must fail before
 * review if it reuses a stable identity or exact existing target card.
 *
 * @param {{cards:Array<Record<string,any>>}} candidates
 * @param {{reservedIds:string[],reservedConceptKeys:string[],existingTargetCards:Array<Record<string,string>>}} context
 */
export function assertAdditiveRecallCandidates(candidates, context) {
	const reservedIds = new Set(context.reservedIds);
	const reservedConceptKeys = new Set(context.reservedConceptKeys);
	const existingContent = new Set(
		context.existingTargetCards.map(
			(card) => `${normalize(card.front)}\u0000${normalize(card.back)}`
		)
	);
	const issues = [];
	const candidateContent = new Map();
	for (const card of candidates.cards) {
		if (reservedIds.has(card.id)) issues.push(`${card.id} reuses a reserved card id`);
		if (reservedConceptKeys.has(card.conceptKey)) {
			issues.push(`${card.id} reuses reserved concept key ${card.conceptKey}`);
		}
		const contentIdentity = `${normalize(card.front)}\u0000${normalize(card.back)}`;
		if (existingContent.has(contentIdentity)) {
			issues.push(`${card.id} duplicates an existing target card`);
		}
		const duplicateCandidateId = candidateContent.get(contentIdentity);
		if (duplicateCandidateId) {
			issues.push(`${card.id} duplicates candidate content from ${duplicateCandidateId}`);
		} else {
			candidateContent.set(contentIdentity, card.id);
		}
	}
	if (issues.length > 0) {
		throw new Error(
			`Additive recall generation conflicts with existing identities:\n- ${issues.join('\n- ')}`
		);
	}
}

/** @param {unknown} artifact @param {string} artifactPath @param {string} directoryName */
function validateContextArtifact(artifact, artifactPath, directoryName) {
	if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
		throw new Error(`Cannot build additive recall context: ${artifactPath} must be an object.`);
	}
	const artifactRecord = /** @type {AnyRecord} */ (artifact);
	if (
		!artifactRecord.run ||
		typeof artifactRecord.run !== 'object' ||
		artifactRecord.run.id !== directoryName
	) {
		throw new Error(
			`Cannot build additive recall context: ${artifactPath} run.id must match ${directoryName}.`
		);
	}
	if (!Array.isArray(artifactRecord.cards) || artifactRecord.cards.length === 0) {
		throw new Error(
			`Cannot build additive recall context: ${artifactPath} must contain at least one accepted card.`
		);
	}
	for (const [index, card] of artifactRecord.cards.entries()) {
		const label = `${artifactPath} cards[${index}]`;
		if (!card || typeof card !== 'object' || Array.isArray(card)) {
			throw new Error(`Cannot build additive recall context: ${label} must be an object.`);
		}
		for (const field of ['id', 'conceptKey', 'subject', 'front', 'back']) {
			if (!text(card[field])) {
				throw new Error(`Cannot build additive recall context: ${label}.${field} is required.`);
			}
		}
		if (!['Biology', 'Chemistry', 'Physics'].includes(card.subject)) {
			throw new Error(`Cannot build additive recall context: ${label}.subject is unsupported.`);
		}
		if (!Array.isArray(card.targets) || card.targets.length === 0) {
			throw new Error(`Cannot build additive recall context: ${label}.targets is required.`);
		}
		for (const [targetIndex, target] of card.targets.entries()) {
			if (
				!target ||
				typeof target !== 'object' ||
				Array.isArray(target) ||
				!text(target.offeringId) ||
				!text(target.topicComponentId)
			) {
				throw new Error(
					`Cannot build additive recall context: ${label}.targets[${targetIndex}] is incomplete.`
				);
			}
		}
	}
	return artifactRecord.cards;
}

/** @param {Array<Record<string, any>>} artifactCards */
function assertConsistentArtifactIdentities(artifactCards) {
	const byId = new Map();
	const byConcept = new Map();
	for (const card of artifactCards) {
		const idOwner = byId.get(card.id);
		if (idOwner && (idOwner.subject !== card.subject || idOwner.conceptKey !== card.conceptKey)) {
			throw new Error(
				`Cannot build additive recall context: card id ${card.id} maps to divergent identities in ${idOwner.artifactPath} and ${card.artifactPath}.`
			);
		}
		if (!idOwner) byId.set(card.id, card);

		const conceptIdentity = `${card.subject}:${card.conceptKey}`;
		const conceptOwner = byConcept.get(conceptIdentity);
		if (conceptOwner && conceptOwner.id !== card.id) {
			throw new Error(
				`Cannot build additive recall context: concept ${conceptIdentity} maps to divergent card ids ${conceptOwner.id} and ${card.id}.`
			);
		}
		if (!conceptOwner) byConcept.set(conceptIdentity, card);
	}
}

/** @param {string} subject @param {string} topicComponentId @param {Set<string>} selectedOfferings */
function staticTargetCards(subject, topicComponentId, selectedOfferings) {
	const scope = STATIC_SEPARATE_HIGHER_SCOPE[subject];
	if (!scope || !selectedOfferings.has(scope.offeringId)) return [];
	return staticRecallCards.flatMap((card) => {
		if (card.subject !== subject) return [];
		const topic = recallCurriculumTopics.find((candidate) => candidate.id === card.topicId);
		if (!topic) {
			throw new Error(`Cannot build additive recall context: static card ${card.id} has no topic.`);
		}
		const staticTopicComponentId = `${scope.specificationId}:${topic.specRef.replaceAll('.', '-')}`;
		if (staticTopicComponentId !== topicComponentId) return [];
		return [
			{
				id: card.id,
				conceptKey: '',
				subject: card.subject,
				front: card.front,
				back: card.back,
				targets: [
					{
						offeringId: scope.offeringId,
						topicComponentId: staticTopicComponentId
					}
				],
				artifactPath: 'src/lib/recall/aqaScienceRecall.ts'
			}
		];
	});
}

/** @param {unknown} value */
function text(value) {
	return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} value */
function normalize(value) {
	return String(value ?? '')
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}
