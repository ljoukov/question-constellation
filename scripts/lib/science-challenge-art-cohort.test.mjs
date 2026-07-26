import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseArgs } from '../build-science-challenge-art-cohort.mjs';
import {
	SCIENCE_CHALLENGE_ART_COHORT_EXPECTATIONS,
	buildScienceChallengeArtCohort,
	publishScienceChallengeArtCohort,
	resolveScienceChallengeArtCohortOutput,
	scienceChallengeArtOwnerIdsSha256,
	validateScienceChallengeArtCohortManifest
} from './science-challenge-art-cohort.mjs';
import {
	SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS,
	SCIENCE_QUESTION_ART_MANIFEST_SCHEMA,
	SCIENCE_QUESTION_ART_SCHEMA,
	canonicalHash,
	scienceQuestionArtLocalPath,
	stableStringify
} from './science-challenge-release.mjs';

const fixture = makeProductionSizedFixture();
const manifest = buildScienceChallengeArtCohort(fixture);

test('builder carves the exact 179 plus 60 opening-pair cohort and changes only output paths', () => {
	assert.equal(manifest.schemaVersion, SCIENCE_QUESTION_ART_MANIFEST_SCHEMA);
	assert.equal(manifest.releaseId, 'science-179-v1');
	assert.equal(manifest.cohort.pairPolicy, 'one-pair-per-challenge');
	assert.equal(manifest.specs.length, 239);
	assert.equal(manifest.cohort.ownerCount, 239);
	assert.equal(manifest.cohort.pairCount, 239);
	assert.equal(manifest.cohort.fileCount, 478);
	assert.equal(manifest.cohort.acceptedNewOwnerCount, 179);
	assert.equal(manifest.cohort.existingReplacementOwnerCount, 60);
	assert.equal(new Set(manifest.cohort.owners.map((owner) => owner.challengeId)).size, 239);
	assert.equal(new Set(manifest.cohort.files.map((file) => file.localPath)).size, 478);
	assert.ok(manifest.specs.every((spec) => spec.context === 'opening'));

	for (const targetSpec of manifest.specs) {
		const sourceSpec = fixture.sourceArtManifest.specs.find(
			(spec) => spec.challengeId === targetSpec.challengeId && spec.context === 'opening'
		);
		assert.ok(sourceSpec);
		assert.deepEqual(targetSpec, {
			...sourceSpec,
			output: {
				darkPath: scienceQuestionArtLocalPath('science-179-v1', targetSpec.id, 'dark'),
				lightPath: scienceQuestionArtLocalPath('science-179-v1', targetSpec.id, 'light')
			}
		});
		const owner = manifest.cohort.owners.find(
			(candidate) => candidate.challengeId === targetSpec.challengeId
		);
		assert.equal(owner.sourceSpecSha256, canonicalHash(sourceSpec));
	}

	assert.equal(
		countExactString(
			{ ...manifest, cohort: { ...manifest.cohort, source: null } },
			'science-500-v1'
		),
		0
	);
	assert.equal(
		manifest.cohort.source.artManifestSha256,
		fixture.expectations.sourceArtManifestSha256
	);
	assert.equal(
		manifest.cohort.source.verificationSummarySha256,
		fixture.expectations.verificationSummarySha256
	);
	assert.deepEqual(validateScienceChallengeArtCohortManifest(manifest, fixture), {
		status: 'passed',
		issues: []
	});
});

test('builder rejects any drift in the frozen accepted, replacement, or combined owner sets', () => {
	const wrongReplacementIds = [...fixture.existingExpansionIds];
	wrongReplacementIds[0] = fixture.verificationSummary.reviews[0].id;
	assert.throws(
		() =>
			buildScienceChallengeArtCohort({
				...fixture,
				existingExpansionIds: wrongReplacementIds
			}),
		/Existing replacement ids differ|must be disjoint|Combined owner ids differ/
	);

	const changedVerification = structuredClone(fixture.verificationSummary);
	changedVerification.reviews[0].accepted = false;
	changedVerification.reviews[0].artBriefsSafe = false;
	changedVerification.reviews[0].issues = [
		{
			field: 'artBriefsSafe',
			category: 'safety',
			evidence: 'The acceptance result was changed.',
			repair: 'Restore the independently reviewed row.'
		}
	];
	assert.throws(
		() =>
			buildScienceChallengeArtCohort({
				...fixture,
				verificationSummary: changedVerification
			}),
		/Verification summary canonical SHA-256|exact 179 accepted/
	);

	const missingOpening = structuredClone(fixture.sourceArtManifest);
	const missingIndex = missingOpening.specs.findIndex(
		(spec) => spec.challengeId === fixture.existingExpansionIds[0] && spec.context === 'opening'
	);
	missingOpening.specs.splice(missingIndex, 1);
	assert.throws(
		() => buildScienceChallengeArtCohort({ ...fixture, sourceArtManifest: missingOpening }),
		/authoritative value|Expected 1000 art specs|exactly one authoritative opening/
	);
});

test('cohort validator rejects pair policy, lineage scope, path, ordering, and file tampering', () => {
	const mutations = [
		[
			(value) => {
				value.cohort.pairPolicy = 'opening-and-transfer';
			},
			/pairPolicy/
		],
		[
			(value) => {
				value.specs[0].scene = 'science-500-v1';
				value.cohort.targetSpecSetSha256 = canonicalHash(value.specs);
			},
			/source release id may appear only/
		],
		[
			(value) => {
				value.specs[0].output.darkPath = '/Users/example/private/dark.webp';
				value.cohort.owners[0].darkPath = value.specs[0].output.darkPath;
				value.cohort.files = value.cohort.owners.flatMap(ownerFiles);
				value.cohort.targetSpecSetSha256 = canonicalHash(value.specs);
				value.cohort.ownersSha256 = canonicalHash(value.cohort.owners);
				value.cohort.filesSha256 = canonicalHash(value.cohort.files);
			},
			/output.darkPath is invalid|absolute or user-specific path|exact release sibling path/
		],
		[
			(value) => {
				[value.cohort.owners[0], value.cohort.owners[1]] = [
					value.cohort.owners[1],
					value.cohort.owners[0]
				];
				value.cohort.ownersSha256 = canonicalHash(value.cohort.owners);
			},
			/ordered by unique challengeId/
		],
		[
			(value) => {
				value.cohort.files[1] = structuredClone(value.cohort.files[0]);
				value.cohort.filesSha256 = canonicalHash(value.cohort.files);
			},
			/differs from the owners/
		]
	];
	for (const [mutate, expected] of mutations) {
		const changed = structuredClone(manifest);
		mutate(changed);
		const validation = validateScienceChallengeArtCohortManifest(changed, fixture);
		assert.equal(validation.status, 'failed');
		assert.match(validation.issues.join('\n'), expected);
	}
});

test('publication is canonical, atomic, repository-confined, and refuses replacement', () => {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'science-art-cohort-')));
	try {
		const outputPath = 'tmp/science-179-v1/art-manifest.json';
		const result = publishScienceChallengeArtCohort({
			repositoryRoot: root,
			outputPath,
			manifest,
			expectations: fixture.expectations
		});
		assert.equal(result.status, 'passed');
		assert.equal(result.outputPath, outputPath);
		assert.equal(result.manifestSha256, canonicalHash(manifest));
		assert.equal(
			readFileSync(path.join(root, outputPath), 'utf8'),
			`${stableStringify(manifest)}\n`
		);
		assert.throws(
			() =>
				publishScienceChallengeArtCohort({
					repositoryRoot: root,
					outputPath,
					manifest,
					expectations: fixture.expectations
				}),
			/already exists and is immutable/
		);
		assert.throws(
			() => resolveScienceChallengeArtCohortOutput(root, '../outside.json'),
			/parent path segments/
		);
		assert.equal(existsSync(path.join(root, 'outside.json')), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('CLI parser is strict and keeps all file arguments repo-relative', () => {
	assert.deepEqual(
		parseArgs([
			'--source-art-manifest=source.json',
			'--verification-summary=verification.json',
			'--output=output.json',
			'--dry-run'
		]),
		{
			help: false,
			dryRun: true,
			sourceArtManifest: 'source.json',
			verificationSummary: 'verification.json',
			output: 'output.json'
		}
	);
	for (const [args, expected] of [
		[['--dry-run=false'], /does not accept a value/],
		[['--unknown=value'], /Unknown option/],
		[['value'], /Unexpected positional/],
		[
			[
				'--source-art-manifest=source.json',
				'--source-art-manifest=other.json',
				'--verification-summary=verification.json',
				'--output=output.json'
			],
			/Duplicate option/
		]
	]) {
		assert.throws(() => parseArgs(args), expected);
	}
});

function makeProductionSizedFixture() {
	const existingExpansionIds = makeIds('existing-owner', 60);
	const acceptedIds = makeIds('accepted-owner', 179);
	const rejectedIds = makeIds('rejected-owner', 229);
	const coreIds = makeIds('core-owner', 32);
	const allChallengeIds = [...coreIds, ...existingExpansionIds, ...acceptedIds, ...rejectedIds];
	assert.equal(allChallengeIds.length, 500);
	const specs = allChallengeIds.flatMap((challengeId, challengeIndex) => [
		makeArtSpec(challengeId, challengeIndex, 'opening'),
		makeArtSpec(challengeId, challengeIndex, 'transfer')
	]);
	const sourceArtManifest = {
		schemaVersion: SCIENCE_QUESTION_ART_MANIFEST_SCHEMA,
		releaseId: 'science-500-v1',
		width: 960,
		height: 540,
		specs
	};
	const reviews = [
		...acceptedIds.map((id) => makeReview(id, true)),
		...rejectedIds.map((id) => makeReview(id, false))
	];
	const verificationSummary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planId: 'science-500-v1',
		status: 'failed',
		reviewCount: 408,
		acceptedCount: 179,
		rejectedCount: 229,
		reviews,
		issues: []
	};
	const expectations = {
		...SCIENCE_CHALLENGE_ART_COHORT_EXPECTATIONS,
		sourceArtManifestSha256: canonicalHash(sourceArtManifest),
		verificationSummarySha256: canonicalHash(verificationSummary),
		acceptedNewOwnerIdsSha256: scienceChallengeArtOwnerIdsSha256(acceptedIds),
		existingReplacementOwnerIdsSha256: scienceChallengeArtOwnerIdsSha256(existingExpansionIds),
		ownerIdsSha256: scienceChallengeArtOwnerIdsSha256([...acceptedIds, ...existingExpansionIds])
	};
	return {
		sourceArtManifest,
		verificationSummary,
		existingExpansionIds,
		expectations
	};
}

function makeIds(prefix, count) {
	return Array.from(
		{ length: count },
		(_, index) => `${prefix}-${String(index + 1).padStart(3, '0')}`
	);
}

function makeArtSpec(challengeId, challengeIndex, context) {
	const contextIndex = context === 'opening' ? 0 : 1;
	const uniqueIndex = challengeIndex * 2 + contextIndex + 1;
	const id = `${challengeId}-${context}`;
	return {
		schemaVersion: SCIENCE_QUESTION_ART_SCHEMA,
		id,
		challengeId,
		subject: ['biology', 'chemistry', 'physics'][challengeIndex % 3],
		context,
		question: `Inspect science setup number ${uniqueIndex} and select the supported next step.`,
		scene: `A distinct unresolved laboratory scene numbered ${uniqueIndex} with neutral apparatus.`,
		visualAnchor: `A neutral apparatus arrangement marked by shape ${uniqueIndex}.`,
		altText: `An unresolved science apparatus arrangement for setup ${uniqueIndex}.`,
		approvedMeaning: `The illustration establishes the unresolved setup numbered ${uniqueIndex}.`,
		accuracyConstraints: [
			'Keep every piece of apparatus physically plausible.',
			'Keep the outcome unresolved and scientifically neutral.'
		],
		forbiddenDetails: [
			'No answer labels or explanatory text.',
			'No completed result or highlighted choice.'
		],
		output: {
			darkPath: scienceQuestionArtLocalPath('science-500-v1', id, 'dark'),
			lightPath: scienceQuestionArtLocalPath('science-500-v1', id, 'light')
		}
	};
}

function makeReview(id, accepted) {
	const review = Object.fromEntries(
		SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.map((field) => [field, true])
	);
	if (!accepted) review.artBriefsSafe = false;
	return {
		id,
		...review,
		checkedCalculations: [],
		issues: accepted
			? []
			: [
					{
						field: 'artBriefsSafe',
						category: 'safety',
						evidence: 'The art brief needs an independent repair.',
						repair: 'Repair and re-review the art brief.'
					}
				],
		accepted
	};
}

function ownerFiles(owner) {
	return ['dark', 'light'].map((theme) => ({
		id: `${owner.artId}-${theme}`,
		challengeId: owner.challengeId,
		ownerKind: owner.ownerKind,
		artId: owner.artId,
		theme,
		localPath: owner[`${theme}Path`]
	}));
}

function countExactString(value, expected) {
	if (typeof value === 'string') return value === expected ? 1 : 0;
	if (Array.isArray(value)) {
		return value.reduce((total, entry) => total + countExactString(entry, expected), 0);
	}
	if (value && typeof value === 'object') {
		return Object.values(value).reduce(
			(total, entry) => total + countExactString(entry, expected),
			0
		);
	}
	return 0;
}
