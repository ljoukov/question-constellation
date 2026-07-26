import { canonicalHash } from './science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_FIELD,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY,
	validateScienceChallengeCurriculumRemapVerifierInput
} from './science-challenge-curriculum-remap-review.mjs';
import {
	SCIENCE_CHALLENGE_VERIFIER_PACKET_MANIFEST_SCHEMA,
	SCIENCE_CHALLENGE_VERIFIER_PACKET_SCHEMA
} from './science-challenge-verifier-packets.mjs';

export const SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SCHEMA =
	'science-challenge-curriculum-remap-durable-receipt/v1';
export const SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY =
	'curriculumRemapDurableReceipt';
export const SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY =
	'curriculumRemapDurableReceiptSha256';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CHALLENGE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMPONENT_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;
const RECEIPT_FIELDS = Object.freeze([
	'schemaVersion',
	'basePlanSha256',
	'effectivePlanSha256',
	'curriculumEvidenceSha256',
	'curriculumCatalogSha256',
	'effectiveCohortManifestSha256',
	'candidateCount',
	'candidateSetSha256',
	'remapManifestSetSha256',
	'recoverySetSha256',
	'verifierInputSha256',
	'packetManifestSha256',
	'proposalSetSha256',
	'decisionSetSha256',
	'packetSetSha256',
	'remaps',
	'receiptSha256'
]);
const REMAP_FIELDS = Object.freeze([
	'challengeId',
	'field',
	'from',
	'to',
	'fromTitle',
	'toTitle',
	'fromSourceTextSha256',
	'toSourceTextSha256',
	'ancestryChain',
	'proposalSha256',
	'targetCandidateSha256',
	'batchCandidateSha256',
	'baseReviewSha256',
	'manifestSha256',
	'assignmentId',
	'assignmentSha256',
	'packetSha256',
	'resultSha256',
	'decision',
	'decisionSha256'
]);
const ANCESTRY_FIELDS = Object.freeze(['componentId', 'title']);
const DECISION_FIELDS = Object.freeze(['challengeId', 'field', 'from', 'to', 'accepted']);
const FORBIDDEN_DURABLE_KEYS = new Set(['sourceText', 'substantiveExcerpt']);

export function buildScienceChallengeCurriculumRemapDurableReceipt({
	verifierInput,
	assignmentIndex,
	packetManifest,
	packets,
	assignmentResults,
	decisions
}) {
	const inputValidation = validateScienceChallengeCurriculumRemapVerifierInput(verifierInput);
	if (inputValidation.status !== 'passed') {
		throw new Error(
			`curriculum remap verifier input is invalid:\n- ${inputValidation.issues.join('\n- ')}`
		);
	}
	const derivation = deriveReceiptCore({
		verifierInput,
		assignmentIndex,
		packetManifest,
		packets,
		assignmentResults,
		decisions
	});
	if (derivation.issues.length) {
		throw new Error(
			`curriculum remap durable receipt inputs are invalid:\n- ${derivation.issues.join('\n- ')}`
		);
	}
	const receipt = {
		...derivation.core,
		receiptSha256: canonicalHash(derivation.core)
	};
	const validation = validateScienceChallengeCurriculumRemapDurableReceipt(receipt, {
		verifierInput,
		assignmentIndex,
		packetManifest,
		packets,
		assignmentResults,
		decisions
	});
	if (validation.status !== 'passed') {
		throw new Error(
			`curriculum remap durable receipt is invalid:\n- ${validation.issues.join('\n- ')}`
		);
	}
	return receipt;
}

export function validateScienceChallengeCurriculumRemapDurableReceipt(receipt, expected = {}) {
	const issues = [];
	if (!isRecord(receipt)) return failed(['must be an object.']);
	rejectUnknownOrMissingFields(receipt, RECEIPT_FIELDS, issues, 'receipt');
	if (receipt.schemaVersion !== SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SCHEMA) {
		issues.push(
			`receipt.schemaVersion must be ${SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SCHEMA}.`
		);
	}
	for (const field of RECEIPT_FIELDS.filter((field) => field.endsWith('Sha256'))) {
		if (!SHA256_PATTERN.test(String(receipt[field] ?? ''))) {
			issues.push(`receipt.${field} must be a lowercase SHA-256.`);
		}
	}
	if (!Number.isSafeInteger(receipt.candidateCount) || receipt.candidateCount <= 0) {
		issues.push('receipt.candidateCount must be a positive safe integer.');
	}
	if (!Array.isArray(receipt.remaps) || receipt.remaps.length === 0) {
		issues.push('receipt.remaps must contain at least one remap.');
	} else {
		const challengeIds = new Set();
		for (const [index, remap] of receipt.remaps.entries()) {
			validateDurableRemap(remap, index, issues);
			if (challengeIds.has(remap?.challengeId)) {
				issues.push(`receipt.remaps[${index}] duplicates a challenge id.`);
			}
			challengeIds.add(remap?.challengeId);
		}
		const reconstructedProposals = receipt.remaps.map((remap) => ({
			challengeId: remap.challengeId,
			field: remap.field,
			from: remap.from,
			to: remap.to,
			proposalSha256: remap.proposalSha256,
			basePlanSha256: receipt.basePlanSha256,
			effectivePlanSha256: receipt.effectivePlanSha256,
			curriculumEvidenceSha256: receipt.curriculumEvidenceSha256,
			targetCandidateSha256: remap.targetCandidateSha256,
			batchCandidateSha256: remap.batchCandidateSha256,
			baseReviewSha256: remap.baseReviewSha256,
			manifestSha256: remap.manifestSha256
		}));
		if (receipt.proposalSetSha256 !== canonicalHash(reconstructedProposals)) {
			issues.push('receipt.proposalSetSha256 differs from the exact projected proposals.');
		}
		if (
			receipt.decisionSetSha256 !== canonicalHash(receipt.remaps.map((remap) => remap.decision))
		) {
			issues.push('receipt.decisionSetSha256 differs from the exact projected decisions.');
		}
		if (
			receipt.packetSetSha256 !==
			canonicalHash(uniqueInOrder(receipt.remaps.map((remap) => remap.packetSha256)))
		) {
			issues.push('receipt.packetSetSha256 differs from the ordered remap packet hashes.');
		}
	}
	const receiptCore = selectFields(
		receipt,
		RECEIPT_FIELDS.filter((field) => field !== 'receiptSha256')
	);
	if (receipt.receiptSha256 !== canonicalHash(receiptCore)) {
		issues.push('receipt.receiptSha256 does not bind the exact durable receipt core.');
	}
	const leakPaths = findScienceChallengeCurriculumRemapDurableLeaks(receipt);
	for (const leakPath of leakPaths) {
		issues.push(`receipt contains forbidden source-rich field ${leakPath}.`);
	}

	if (
		expected.verifierInput ||
		expected.assignmentIndex ||
		expected.packetManifest ||
		expected.packets ||
		expected.assignmentResults ||
		expected.decisions
	) {
		if (
			!expected.verifierInput ||
			!expected.assignmentIndex ||
			!expected.packetManifest ||
			!expected.packets ||
			!expected.assignmentResults ||
			!expected.decisions
		) {
			issues.push('exact receipt replay requires every expected verifier artifact.');
		} else {
			const derivation = deriveReceiptCore(expected);
			issues.push(...derivation.issues.map((issue) => `expected replay: ${issue}`));
			if (
				derivation.issues.length === 0 &&
				canonicalHash(receiptCore) !== canonicalHash(derivation.core)
			) {
				issues.push('receipt differs from the exact sanitized projection of verifier evidence.');
			}
		}
	}
	return issues.length ? failed(issues) : passed();
}

export function findScienceChallengeCurriculumRemapDurableLeaks(value) {
	const leaks = [];
	visit(value, '$', leaks);
	return leaks;
}

function deriveReceiptCore({
	verifierInput,
	assignmentIndex,
	packetManifest,
	packets,
	assignmentResults,
	decisions
}) {
	const issues = [];
	if (!isRecord(assignmentIndex) || !Array.isArray(assignmentIndex.assignments)) {
		return {
			issues: ['assignmentIndex must contain assignment rows.'],
			core: null
		};
	}
	if (
		assignmentIndex.curriculumRemapVerifierInputSha256 !== canonicalHash(verifierInput) ||
		assignmentIndex.basePlanSha256 !== verifierInput.basePlanSha256 ||
		assignmentIndex.effectivePlanSha256 !== verifierInput.effectivePlanSha256 ||
		assignmentIndex.curriculumEvidenceSha256 !==
			verifierInput.proposals?.[0]?.curriculumEvidenceSha256 ||
		assignmentIndex.curriculumCatalogSha256 !== verifierInput.curriculumCatalogSha256 ||
		assignmentIndex.effectiveCohortManifestSha256 !== verifierInput.effectiveCohortManifestSha256 ||
		assignmentIndex.candidateSetSha256 !== verifierInput.candidateSetSha256 ||
		assignmentIndex.candidateCount !== verifierInput.candidateCount ||
		assignmentIndex.remapManifestSetSha256 !== verifierInput.remapManifestSetSha256 ||
		assignmentIndex.recoverySetSha256 !== verifierInput.recoverySetSha256
	) {
		issues.push('assignment index differs from the immutable verifier input/cohort bindings.');
	}
	if (
		!isRecord(packetManifest) ||
		packetManifest.schemaVersion !== SCIENCE_CHALLENGE_VERIFIER_PACKET_MANIFEST_SCHEMA ||
		packetManifest.assignmentIndexSha256 !== canonicalHash(assignmentIndex) ||
		!Array.isArray(packetManifest.packets)
	) {
		issues.push('packet manifest does not bind the exact assignment index.');
	}
	const packetArtifactByPath = new Map(
		Array.isArray(packets)
			? packets.map((artifact) => [artifact?.packetPath, artifact?.packet])
			: []
	);
	const packetByAssignmentId = new Map();
	for (const [packetIndex, manifestPacket] of (packetManifest?.packets ?? []).entries()) {
		const packet = packetArtifactByPath.get(manifestPacket?.packetPath);
		if (
			!isRecord(packet) ||
			packet.schemaVersion !== SCIENCE_CHALLENGE_VERIFIER_PACKET_SCHEMA ||
			canonicalHash(packet) !== manifestPacket?.packetSha256 ||
			packet.assignmentIndexSha256 !== canonicalHash(assignmentIndex) ||
			packet.curriculumRemapVerifierInputSha256 !== canonicalHash(verifierInput) ||
			!Array.isArray(packet.waves)
		) {
			issues.push(`packet manifest row ${packetIndex} does not bind its exact packet.`);
			continue;
		}
		for (const wave of packet.waves) {
			if (!wave?.assignmentId || packetByAssignmentId.has(wave.assignmentId)) {
				issues.push(
					`packet manifest row ${packetIndex} has duplicate or missing assignment waves.`
				);
				continue;
			}
			packetByAssignmentId.set(wave.assignmentId, {
				packetSha256: manifestPacket.packetSha256,
				wave
			});
		}
	}
	if (packetArtifactByPath.size !== (packetManifest?.packets?.length ?? 0)) {
		issues.push('packet artifacts differ from the packet manifest membership.');
	}
	const resultByAssignmentId = uniqueBy(
		assignmentResults,
		(result) => result?.assignmentId,
		'assignment result',
		issues
	);
	const decisionByChallengeId = uniqueBy(
		decisions,
		(decision) => decision?.challengeId,
		'curriculum remap decision',
		issues
	);
	const remaps = [];
	for (const proposal of verifierInput.proposals ?? []) {
		const matchingAssignments = assignmentIndex.assignments.filter((assignment) =>
			(assignment?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY] ?? []).some(
				(candidate) => candidate?.challengeId === proposal.challengeId
			)
		);
		if (matchingAssignments.length !== 1) {
			issues.push(`${proposal.challengeId} must belong to exactly one proposal assignment.`);
			continue;
		}
		const assignment = matchingAssignments[0];
		const assignedProposal = (
			assignment[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY] ?? []
		).find((candidate) => candidate.challengeId === proposal.challengeId);
		const display = (
			assignment[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY] ?? []
		).find((candidate) => candidate.challengeId === proposal.challengeId);
		const packetBinding = packetByAssignmentId.get(assignment.assignmentId);
		const packetProposal = (
			packetBinding?.wave?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY] ?? []
		).find((candidate) => candidate.challengeId === proposal.challengeId);
		const packetDisplay = (
			packetBinding?.wave?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY] ?? []
		).find((candidate) => candidate.challengeId === proposal.challengeId);
		const decision = decisionByChallengeId.get(proposal.challengeId);
		const result = resultByAssignmentId.get(assignment.assignmentId);
		if (
			canonicalHash(assignedProposal) !== canonicalHash(proposal) ||
			canonicalHash(packetProposal) !== canonicalHash(proposal) ||
			canonicalHash(packetDisplay) !== canonicalHash(display) ||
			packetBinding?.wave?.assignmentPath !== assignment.path ||
			packetBinding?.wave?.assignmentSha256 !== assignment.sha256 ||
			packetBinding?.wave?.curriculumRemapVerifierInputSha256 !== canonicalHash(verifierInput)
		) {
			issues.push(
				`${proposal.challengeId} proposal, assignment, or display evidence differs across input and packet.`
			);
			continue;
		}
		if (
			!isRecord(display) ||
			!isRecord(display.from) ||
			!isRecord(display.to) ||
			!Array.isArray(display.ancestryChain)
		) {
			issues.push(`${proposal.challengeId} reviewer display evidence is incomplete.`);
			continue;
		}
		if (
			!isRecord(decision) ||
			!['challengeId', 'field', 'from', 'to'].every(
				(field) => decision[field] === proposal[field]
			) ||
			typeof decision.accepted !== 'boolean' ||
			Object.keys(decision).length !== DECISION_FIELDS.length
		) {
			issues.push(`${proposal.challengeId} decision is missing, stale, or not exact.`);
			continue;
		}
		if (
			!isRecord(result) ||
			!SHA256_PATTERN.test(String(result.sha256 ?? '')) ||
			!SHA256_PATTERN.test(String(assignment.sha256 ?? '')) ||
			!SHA256_PATTERN.test(String(packetBinding?.packetSha256 ?? ''))
		) {
			issues.push(`${proposal.challengeId} assignment, packet, or result binding is invalid.`);
			continue;
		}
		remaps.push({
			challengeId: proposal.challengeId,
			field: proposal.field,
			from: proposal.from,
			to: proposal.to,
			fromTitle: display.from.title,
			toTitle: display.to.title,
			fromSourceTextSha256: display.from.sourceTextSha256,
			toSourceTextSha256: display.to.sourceTextSha256,
			ancestryChain: display.ancestryChain.map((component) =>
				selectFields(component, ANCESTRY_FIELDS)
			),
			proposalSha256: proposal.proposalSha256,
			targetCandidateSha256: proposal.targetCandidateSha256,
			batchCandidateSha256: proposal.batchCandidateSha256,
			baseReviewSha256: proposal.baseReviewSha256,
			manifestSha256: proposal.manifestSha256,
			assignmentId: assignment.assignmentId,
			assignmentSha256: assignment.sha256,
			packetSha256: packetBinding.packetSha256,
			resultSha256: result.sha256,
			decision: selectFields(decision, DECISION_FIELDS),
			decisionSha256: canonicalHash(selectFields(decision, DECISION_FIELDS))
		});
	}
	if (remaps.length !== (verifierInput.proposals?.length ?? 0)) {
		issues.push('durable remap projection is incomplete.');
	}
	if (decisionByChallengeId.size !== (verifierInput.proposals?.length ?? 0)) {
		issues.push('decision membership differs from proposal membership.');
	}
	const core = {
		schemaVersion: SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SCHEMA,
		basePlanSha256: verifierInput.basePlanSha256,
		effectivePlanSha256: verifierInput.effectivePlanSha256,
		curriculumEvidenceSha256: verifierInput.proposals?.[0]?.curriculumEvidenceSha256,
		curriculumCatalogSha256: verifierInput.curriculumCatalogSha256,
		effectiveCohortManifestSha256: verifierInput.effectiveCohortManifestSha256,
		candidateCount: verifierInput.candidateCount,
		candidateSetSha256: verifierInput.candidateSetSha256,
		remapManifestSetSha256: verifierInput.remapManifestSetSha256,
		recoverySetSha256: verifierInput.recoverySetSha256,
		verifierInputSha256: canonicalHash(verifierInput),
		packetManifestSha256: canonicalHash(packetManifest),
		proposalSetSha256: canonicalHash(verifierInput.proposals),
		decisionSetSha256: canonicalHash(remaps.map((remap) => remap.decision)),
		packetSetSha256: canonicalHash(uniqueInOrder(remaps.map((remap) => remap.packetSha256))),
		remaps
	};
	return { issues, core };
}

function validateDurableRemap(remap, index, issues) {
	const label = `receipt.remaps[${index}]`;
	if (!isRecord(remap)) {
		issues.push(`${label} must be an object.`);
		return;
	}
	rejectUnknownOrMissingFields(remap, REMAP_FIELDS, issues, label);
	if (!CHALLENGE_ID_PATTERN.test(String(remap.challengeId ?? ''))) {
		issues.push(`${label}.challengeId must be a canonical challenge id.`);
	}
	if (remap.field !== SCIENCE_CHALLENGE_CURRICULUM_REMAP_FIELD) {
		issues.push(`${label}.field must be ${SCIENCE_CHALLENGE_CURRICULUM_REMAP_FIELD}.`);
	}
	for (const field of ['from', 'to']) {
		if (!COMPONENT_ID_PATTERN.test(String(remap[field] ?? ''))) {
			issues.push(`${label}.${field} must be a canonical curriculum component id.`);
		}
	}
	for (const field of ['fromTitle', 'toTitle', 'assignmentId']) {
		if (!nonEmpty(remap[field])) issues.push(`${label}.${field} must be non-empty.`);
	}
	for (const field of REMAP_FIELDS.filter((field) => field.endsWith('Sha256'))) {
		if (!SHA256_PATTERN.test(String(remap[field] ?? ''))) {
			issues.push(`${label}.${field} must be a lowercase SHA-256.`);
		}
	}
	if (!Array.isArray(remap.ancestryChain) || remap.ancestryChain.length < 2) {
		issues.push(`${label}.ancestryChain must contain the from and to components.`);
	} else {
		for (const [ancestryIndex, component] of remap.ancestryChain.entries()) {
			const ancestryLabel = `${label}.ancestryChain[${ancestryIndex}]`;
			if (!isRecord(component)) {
				issues.push(`${ancestryLabel} must be an object.`);
				continue;
			}
			rejectUnknownOrMissingFields(component, ANCESTRY_FIELDS, issues, ancestryLabel);
			if (!COMPONENT_ID_PATTERN.test(String(component.componentId ?? ''))) {
				issues.push(`${ancestryLabel}.componentId must be canonical.`);
			}
			if (!nonEmpty(component.title)) issues.push(`${ancestryLabel}.title must be non-empty.`);
		}
		if (
			remap.ancestryChain[0]?.componentId !== remap.from ||
			remap.ancestryChain[0]?.title !== remap.fromTitle ||
			remap.ancestryChain.at(-1)?.componentId !== remap.to ||
			remap.ancestryChain.at(-1)?.title !== remap.toTitle
		) {
			issues.push(`${label}.ancestryChain endpoints differ from the remap components.`);
		}
	}
	if (!isRecord(remap.decision)) {
		issues.push(`${label}.decision must be an object.`);
	} else {
		rejectUnknownOrMissingFields(remap.decision, DECISION_FIELDS, issues, `${label}.decision`);
		if (
			!['challengeId', 'field', 'from', 'to'].every(
				(field) => remap.decision[field] === remap[field]
			) ||
			typeof remap.decision.accepted !== 'boolean'
		) {
			issues.push(`${label}.decision differs from the exact proposal identity.`);
		}
		if (remap.decisionSha256 !== canonicalHash(remap.decision)) {
			issues.push(`${label}.decisionSha256 does not bind the exact decision.`);
		}
	}
}

function uniqueBy(values, keyFor, label, issues) {
	const byKey = new Map();
	if (!Array.isArray(values)) {
		issues.push(`${label} values must be an array.`);
		return byKey;
	}
	for (const value of values) {
		const key = keyFor(value);
		if (!key || byKey.has(key)) {
			issues.push(`${label} values contain a missing or duplicate identity.`);
		} else {
			byKey.set(key, value);
		}
	}
	return byKey;
}

function uniqueInOrder(values) {
	return [...new Set(values)];
}

function visit(value, path, leaks) {
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) visit(item, `${path}[${index}]`, leaks);
		return;
	}
	if (!isRecord(value)) return;
	for (const [key, child] of Object.entries(value)) {
		const childPath = `${path}.${key}`;
		if (FORBIDDEN_DURABLE_KEYS.has(key)) leaks.push(childPath);
		visit(child, childPath, leaks);
	}
}

function rejectUnknownOrMissingFields(value, fields, issues, label) {
	const allowed = new Set(fields);
	for (const field of Object.keys(value)) {
		if (!allowed.has(field)) issues.push(`${label}.${field} is unknown.`);
	}
	for (const field of fields) {
		if (!Object.hasOwn(value, field)) issues.push(`${label}.${field} is required.`);
	}
}

function selectFields(value, fields) {
	return Object.fromEntries(fields.map((field) => [field, value?.[field]]));
}

function nonEmpty(value) {
	return typeof value === 'string' && value === value.trim() && value.length > 0;
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failed(issues) {
	return { status: 'failed', issues };
}

function passed() {
	return { status: 'passed', issues: [] };
}
