import assert from 'node:assert/strict';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	main,
	parseArgs,
	resolveArtEvidenceRoot
} from '../audit-science-challenge-catalog-art.mjs';
import {
	SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_SCHEMA,
	auditAcceptedFunctionalDiagramRequirements,
	buildRetainedStaticReviewAudit,
	buildScienceChallengeCatalogArtAudit,
	fingerprintScienceChallengeCatalogArtFiles,
	publishScienceChallengeCatalogArtAudit,
	validateScienceChallengeCatalogArtAudit
} from './science-challenge-catalog-art-audit.mjs';
import { SCIENCE_QUESTION_ART_DHASH_VARIANTS } from './science-question-art-perceptual.mjs';
import { canonicalHash, sha256, stableStringify } from './science-challenge-release.mjs';

test('builds one primary pair per accepted/authored challenge and normalizes static query/hash paths', () => {
	const fixture = makeFixture();
	const audit = buildFixtureAudit(fixture);

	assert.equal(audit.schemaVersion, SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_SCHEMA);
	assert.equal(audit.status, 'passed');
	assert.equal(audit.counts.acceptedChallengeDefinitions, 2);
	assert.equal(audit.counts.authoredChallengeDefinitions, 2);
	assert.equal(audit.counts.acceptedNewOwners, 2);
	assert.equal(audit.counts.existingReplacementOwners, 1);
	assert.equal(audit.counts.retainedStaticOwners, 1);
	assert.equal(audit.counts.primaryOwnerRecords, 4);
	assert.equal(audit.counts.fileRecords, 8);
	assert.equal(new Set(audit.owners.map((owner) => owner.challengeId)).size, 4);
	assert.equal(new Set(audit.files.map((file) => file.path)).size, 8);
	assert.ok(
		audit.files.every(
			(file) => !file.path.includes('?') && !file.path.includes('#') && !file.path.startsWith('/')
		)
	);
	assert.deepEqual(
		audit.owners.find((owner) => owner.challengeId === 'authored-static-001'),
		{
			challengeId: 'authored-static-001',
			ownerKind: 'authored-static',
			sourceKind: 'vite-authored-static',
			artId: 'authored-static-001',
			sourceBindingSha256: canonicalHash({
				challengeId: 'authored-static-001',
				darkPath: 'static/product/test/authored-static-001-dark.webp',
				lightPath: 'static/product/test/authored-static-001-light.webp'
			}),
			darkPath: 'static/product/test/authored-static-001-dark.webp',
			lightPath: 'static/product/test/authored-static-001-light.webp'
		}
	);
	assert.equal(audit.perceptualAudit.collisionCount, 0);
	assert.equal(audit.functionalDiagramAudit.unresolvedCount, 0);
	assert.deepEqual(
		validateScienceChallengeCatalogArtAudit(audit, {
			expectations: fixture.expectations
		}),
		{ status: 'passed', issues: [] }
	);
});

test('rejects cross-challenge path ownership reuse before hashing', () => {
	const fixture = makeFixture();
	const changed = structuredClone(fixture.artManifest);
	changed.cohort.owners[1].darkPath = changed.cohort.owners[0].darkPath;
	const changedDarkFile = changed.cohort.files.find(
		(file) => file.challengeId === changed.cohort.owners[1].challengeId && file.theme === 'dark'
	);
	changedDarkFile.localPath = changed.cohort.owners[1].darkPath;
	changed.cohort.ownersSha256 = canonicalHash(changed.cohort.owners);
	changed.cohort.filesSha256 = canonicalHash(changed.cohort.files);
	const expectations = {
		...fixture.expectations,
		artManifestSha256: canonicalHash(changed)
	};
	assert.throws(
		() =>
			buildScienceChallengeCatalogArtAudit({
				...fixture.inputs,
				artManifest: changed,
				expectations,
				fingerprintFiles: fakeFingerprints
			}),
		/Art path is reused across/
	);
});

test('perceptual collisions fail only across different challenge owners, not pair siblings', () => {
	const fixture = makeFixture();
	const audit = buildScienceChallengeCatalogArtAudit({
		...fixture.inputs,
		expectations: fixture.expectations,
		fingerprintFiles: ({ fileRecords }) =>
			fileRecords.map((record, index) => ({
				...record,
				sha256: String(index + 1).padStart(64, '0'),
				dHashes: fingerprints('0000000000000000')
			}))
	});
	assert.equal(audit.status, 'failed');
	assert.equal(audit.perceptualAudit.collisionCount, 24);
	assert.ok(
		audit.perceptualAudit.collisions.every(
			(collision) => collision.leftChallengeId !== collision.rightChallengeId
		)
	);
	assert.deepEqual(
		validateScienceChallengeCatalogArtAudit(audit, {
			expectations: fixture.expectations,
			requirePassed: false
		}),
		{ status: 'passed', issues: [] }
	);
	assert.match(
		validateScienceChallengeCatalogArtAudit(audit, {
			expectations: fixture.expectations
		}).issues.join('\n'),
		/zero cross-challenge collisions/
	);
});

test('validator binds exact inputs and recomputes owner cohorts and diagram resolution', () => {
	const fixture = makeFixture();
	const audit = buildFixtureAudit(fixture);

	const changedInput = structuredClone(audit);
	changedInput.inputs.acceptedSubset.challengeEntriesSha256 = 'f'.repeat(64);
	assert.match(
		validateScienceChallengeCatalogArtAudit(changedInput, {
			expectations: fixture.expectations,
			requirePassed: false
		}).issues.join('\n'),
		/exact accepted challenge evidence/
	);

	const changedCohort = structuredClone(audit);
	const changedOwner = changedCohort.owners.find((owner) => owner.ownerKind === 'accepted-new');
	changedOwner.ownerKind = 'existing-expansion-replacement';
	for (const file of changedCohort.files.filter(
		(candidate) => candidate.challengeId === changedOwner.challengeId
	)) {
		file.ownerKind = changedOwner.ownerKind;
	}
	changedCohort.hashes.ownerRecordsSha256 = canonicalHash(changedCohort.owners);
	changedCohort.hashes.fileRecordsSha256 = canonicalHash(changedCohort.files);
	assert.match(
		validateScienceChallengeCatalogArtAudit(changedCohort, {
			expectations: fixture.expectations,
			requirePassed: false
		}).issues.join('\n'),
		/accepted-new rows; expected 2/
	);

	const inventedResolution = structuredClone(audit);
	inventedResolution.functionalDiagramAudit = {
		scannedDefinitionCount: 2,
		requirementCount: 1,
		resolvedCount: 1,
		unresolvedCount: 0,
		status: 'passed',
		requirements: [
			{
				challengeId: 'accepted-new-001',
				field: 'previewQuestion',
				visualKind: 'table',
				requirementKind: 'external-visual-reference',
				resolution: 'invented-resolution',
				reason: 'This must not be accepted as a resolved functional visual.'
			}
		]
	};
	inventedResolution.counts.functionalDiagramRequirements = 1;
	inventedResolution.hashes.functionalDiagramRequirementsSha256 = canonicalHash(
		inventedResolution.functionalDiagramAudit.requirements
	);
	assert.match(
		validateScienceChallengeCatalogArtAudit(inventedResolution, {
			expectations: fixture.expectations,
			requirePassed: false
		}).issues.join('\n'),
		/Functional diagram requirement is malformed/
	);
});

test('reports only genuine functional visual dependencies and resolves an encoded table', () => {
	const audit = auditAcceptedFunctionalDiagramRequirements([
		{
			id: 'self-contained',
			previewQuestion:
				'An image size is 20 mm. A circuit contains a 6 V battery and two series resistors. Calculate the current.',
			transferPromptLead: 'Explain the result from the values in the sentence.'
		},
		{
			id: 'resolved-table',
			previewQuestion: 'Use the table below to compare the samples.',
			questionPresentation: {
				lead: 'The following table gives both measurements.',
				task: 'Use the table to choose the supported conclusion.',
				table: {
					columns: ['Sample', 'Mass'],
					rows: [
						['A', '2 g'],
						['B', '4 g']
					]
				}
			}
		},
		{
			id: 'unseen-diagram',
			transferPromptLead: 'Use the diagram shown below to identify the component.'
		},
		{
			id: 'drawing-task',
			previewQuestion: 'Draw a graph of temperature against time.'
		}
	]);

	assert.equal(audit.scannedDefinitionCount, 4);
	assert.equal(audit.requirementCount, 5);
	assert.equal(audit.resolvedCount, 3);
	assert.equal(audit.unresolvedCount, 2);
	assert.equal(audit.status, 'failed');
	assert.deepEqual(
		audit.requirements
			.filter((requirement) => requirement.resolution === 'unresolved-external')
			.map(({ challengeId, visualKind, requirementKind }) => ({
				challengeId,
				visualKind,
				requirementKind
			})),
		[
			{
				challengeId: 'drawing-task',
				visualKind: 'drawing',
				requirementKind: 'functional-drawing-request'
			},
			{
				challengeId: 'unseen-diagram',
				visualKind: 'diagram',
				requirementKind: 'external-visual-reference'
			}
		]
	);
	assert.equal(
		audit.requirements.some((requirement) => requirement.challengeId === 'self-contained'),
		false
	);
});

test('fingerprints complete bytes and six deterministic dHash transforms', () => {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'catalog-art-fingerprint-')));
	try {
		mkdirSync(path.join(root, 'images'));
		const darkBytes = pgmBytes(false);
		const lightBytes = pgmBytes(true);
		writeFileSync(path.join(root, 'images/dark.pgm'), darkBytes);
		writeFileSync(path.join(root, 'images/light.pgm'), lightBytes);
		const records = fingerprintScienceChallengeCatalogArtFiles({
			repositoryRoot: root,
			fileRecords: [
				{
					id: 'owner-dark',
					challengeId: 'owner',
					ownerKind: 'authored-static',
					artId: 'owner',
					theme: 'dark',
					path: 'images/dark.pgm'
				},
				{
					id: 'owner-light',
					challengeId: 'owner',
					ownerKind: 'authored-static',
					artId: 'owner',
					theme: 'light',
					path: 'images/light.pgm'
				}
			],
			batchSize: 2
		});
		assert.equal(records.length, 2);
		assert.equal(records[0].sha256, sha256(darkBytes));
		assert.equal(records[1].sha256, sha256(lightBytes));
		assert.deepEqual(Object.keys(records[0].dHashes), [...SCIENCE_QUESTION_ART_DHASH_VARIANTS]);
		assert.ok(
			records.every((record) =>
				Object.values(record.dHashes).every((value) => /^[a-f0-9]{16}$/u.test(value))
			)
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('retained-static gate binds accepted review rows to the current question and exact source bytes', () => {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'retained-static-review-')));
	try {
		const challengeId = 'authored-static-001';
		const artId = `${challengeId}-opening`;
		const releaseId = 'retained-static-fixture-v1';
		const darkPath = 'static/product/test/authored-static-001-dark.webp';
		const lightPath = 'static/product/test/authored-static-001-light.webp';
		const darkReviewPath = `tmp/science-challenges/${releaseId}/art-assets/${artId}-dark-v1.webp`;
		const lightReviewPath = `tmp/science-challenges/${releaseId}/art-assets/${artId}-light-v1.webp`;
		for (const [relative, bytes] of [
			[darkPath, Buffer.from('dark-source')],
			[lightPath, Buffer.from('light-source')],
			[darkReviewPath, Buffer.from('dark-source')],
			[lightReviewPath, Buffer.from('light-source')]
		]) {
			mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
			writeFileSync(path.join(root, relative), bytes);
		}
		const question = 'A learner compares two unlabelled metal samples.';
		const spec = {
			schemaVersion: 'science-question-art/v1',
			id: artId,
			challengeId,
			context: 'opening',
			subject: 'chemistry',
			question,
			scene: 'Two unlabelled silver-grey metal samples.',
			visualAnchor: 'Two unlabelled metal samples.',
			altText: 'Two unlabelled silver-grey metal samples.',
			approvedMeaning: 'Two unresolved comparison samples are visible.',
			accuracyConstraints: ['Keep both samples unlabelled.', 'Show no test result.'],
			forbiddenDetails: ['No answer label.', 'No completed test.'],
			output: {
				darkPath: darkReviewPath,
				lightPath: lightReviewPath
			}
		};
		const binding = {
			challengeId,
			artId,
			darkSourcePath: darkPath,
			darkSourceSha256: sha256(Buffer.from('dark-source')),
			darkReviewPath,
			lightSourcePath: lightPath,
			lightSourceSha256: sha256(Buffer.from('light-source')),
			lightReviewPath
		};
		const manifest = {
			schemaVersion: 'science-question-art-manifest/v1',
			releaseId,
			width: 960,
			height: 540,
			cohort: {
				pairPolicy: 'one-pair-per-challenge',
				sourceKind: 'vite-authored-static',
				ownerCount: 1,
				sourceBindingsSha256: canonicalHash([binding]),
				sourceBindings: [binding]
			},
			specs: [spec]
		};
		const reviewRow = {
			id: artId,
			accepted: true,
			disposition: 'retain-with-annotation',
			issues: [
				{
					category: 'quality',
					severity: 'minor',
					description: 'A harmless background edge is slightly uneven.',
					annotation: 'Retained with a minor background-edge annotation.',
					regenerationInstruction: ''
				}
			]
		};
		const result = buildRetainedStaticReviewAudit({
			repositoryRoot: root,
			required: true,
			retainedStaticIds: [challengeId],
			staticOwnerRecords: [
				{
					challengeId,
					darkPath,
					lightPath
				}
			],
			fileRecords: [
				{
					challengeId,
					ownerKind: 'authored-static',
					theme: 'dark',
					sha256: binding.darkSourceSha256
				},
				{
					challengeId,
					ownerKind: 'authored-static',
					theme: 'light',
					sha256: binding.lightSourceSha256
				}
			],
			authoredDefinitions: [{ id: challengeId, previewQuestion: question }],
			retainedStaticManifest: manifest,
			retainedStaticReview: { schemaVersion: 'fixture-review' },
			validateRetainedStaticReview: () => ({
				status: 'passed',
				issues: [],
				rawReviews: [reviewRow]
			})
		});
		assert.equal(result.status, 'passed');
		assert.equal(result.annotatedAcceptedCount, 1);
		assert.deepEqual(result.pairs[0].annotations, [
			{
				category: 'quality',
				description: 'A harmless background edge is slightly uneven.',
				annotation: 'Retained with a minor background-edge annotation.'
			}
		]);

		writeFileSync(path.join(root, darkReviewPath), Buffer.from('changed-review-copy'));
		assert.throws(
			() =>
				buildRetainedStaticReviewAudit({
					repositoryRoot: root,
					required: true,
					retainedStaticIds: [challengeId],
					staticOwnerRecords: [{ challengeId, darkPath, lightPath }],
					fileRecords: [
						{
							challengeId,
							ownerKind: 'authored-static',
							theme: 'dark',
							sha256: binding.darkSourceSha256
						},
						{
							challengeId,
							ownerKind: 'authored-static',
							theme: 'light',
							sha256: binding.lightSourceSha256
						}
					],
					authoredDefinitions: [{ id: challengeId, previewQuestion: question }],
					retainedStaticManifest: manifest,
					retainedStaticReview: { schemaVersion: 'fixture-review' },
					validateRetainedStaticReview: () => ({
						status: 'passed',
						issues: [],
						rawReviews: [reviewRow]
					})
				}),
			/review copy differs/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('publishes canonical JSON atomically and refuses replacement', () => {
	const fixture = makeFixture();
	const audit = buildFixtureAudit(fixture);
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'catalog-art-publish-')));
	try {
		const outputPath = 'tmp/science-179-v1/catalog-art-audit.json';
		const result = publishScienceChallengeCatalogArtAudit({
			repositoryRoot: root,
			outputPath,
			audit,
			expectations: fixture.expectations
		});
		assert.equal(result.status, 'passed');
		assert.equal(result.auditSha256, canonicalHash(audit));
		assert.equal(readFileSync(path.join(root, outputPath), 'utf8'), `${stableStringify(audit)}\n`);
		assert.throws(
			() =>
				publishScienceChallengeCatalogArtAudit({
					repositoryRoot: root,
					outputPath,
					audit,
					expectations: fixture.expectations
				}),
			/already exists and is immutable/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('CLI keeps art evidence rooted separately, reports no host paths and dry-run never publishes', async () => {
	assert.deepEqual(parseArgs(['--dry-run']), {
		help: false,
		dryRun: true,
		acceptedSubset:
			'tmp/science-challenges/science-179-v1/accepted-subset-evidence/accepted-subset.json',
		artEvidenceRoot: '.',
		artManifest: 'tmp/science-challenges/science-179-v1/compiled/art-manifest.json',
		retainedStaticManifest:
			'tmp/science-challenges/science-179-v1-retained-static-final-v1/art-manifest.json',
		retainedStaticReview:
			'tmp/science-challenges/science-179-v1-retained-static-final-v1/art-review/review-summary.json',
		output: 'tmp/science-challenges/science-179-v1/catalog-art-audit.json'
	});
	for (const [args, expected] of [
		[['--dry-run=false'], /does not accept a value/],
		[['--unknown=value'], /Unknown option/],
		[['value'], /Unexpected positional/],
		[['--output=one.json', '--output=two.json'], /Duplicate option/]
	]) {
		assert.throws(() => parseArgs(args), expected);
	}

	const fixture = makeFixture();
	const audit = buildFixtureAudit(fixture);
	const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'catalog-art-cli-')));
	mkdirSync(path.join(parent, 'current'));
	mkdirSync(path.join(parent, 'evidence'));
	const root = realpathSync(path.join(parent, 'current'));
	const evidenceRoot = realpathSync(path.join(parent, 'evidence'));
	const originalLog = console.log;
	let published = false;
	const logs = [];
	const readRoots = [];
	console.log = (message) => logs.push(String(message));
	try {
		assert.equal(resolveArtEvidenceRoot(root, '../evidence'), evidenceRoot);
		await main(['--dry-run', '--art-evidence-root=../evidence'], root, {
			readRepoJson: (inputRoot, _relativePath, label) => {
				readRoots.push({ inputRoot, label });
				if (label === 'accepted subset') return fixture.acceptedSubset;
				if (label === 'art manifest') return fixture.artManifest;
				return {};
			},
			loadAuthoredCatalogAndVisuals: async () => ({
				definitions: fixture.authoredDefinitions,
				visuals: fixture.authoredVisuals
			}),
			buildScienceChallengeCatalogArtAudit: () => audit,
			publishScienceChallengeCatalogArtAudit: () => {
				published = true;
			}
		});
		assert.equal(published, false);
		assert.deepEqual(readRoots, [
			{ inputRoot: root, label: 'accepted subset' },
			{ inputRoot: evidenceRoot, label: 'art manifest' },
			{ inputRoot: root, label: 'retained static art manifest' },
			{ inputRoot: root, label: 'retained static art review' }
		]);
		assert.equal(logs.length, 1);
		assert.equal(logs[0].includes(parent), false);
		assert.equal(logs[0].includes('../evidence'), false);
		assert.equal(existsSync(path.join(root, 'tmp')), false);
	} finally {
		console.log = originalLog;
		rmSync(parent, { recursive: true, force: true });
	}
});

function makeFixture() {
	const acceptedSubset = {
		schemaVersion: 'science-challenge-accepted-subset/v1',
		releaseId: 'fixture-release',
		challenges: [makeAcceptedEntry('accepted-new-002'), makeAcceptedEntry('accepted-new-001')]
	};
	const authoredDefinitions = [
		makeDefinition('authored-replacement-001'),
		makeDefinition('authored-static-001')
	];
	const authoredVisuals = [
		{
			challengeId: 'authored-replacement-001',
			visual: {
				cardArt: {
					src: '/product/test/old-replacement-light.webp?rev=old',
					darkSrc: '/product/test/old-replacement-dark.webp?rev=old',
					alt: 'A neutral replacement-scene fixture.'
				}
			}
		},
		{
			challengeId: 'authored-static-001',
			visual: {
				cardArt: {
					src: '/product/test/authored-static-001-light.webp?rev=7#ignored',
					darkSrc: '/product/test/authored-static-001-dark.webp?rev=7#ignored',
					alt: 'A neutral calculation workspace with unlabelled equipment.'
				}
			}
		}
	];
	const ownerRows = [
		makeManifestOwner('accepted-new-001', 'accepted-new'),
		makeManifestOwner('accepted-new-002', 'accepted-new'),
		makeManifestOwner('authored-replacement-001', 'existing-expansion-replacement')
	];
	const fileRows = ownerRows.flatMap((owner) =>
		['dark', 'light'].map((theme) => ({
			id: `${owner.artId}-${theme}`,
			challengeId: owner.challengeId,
			ownerKind: owner.ownerKind,
			artId: owner.artId,
			theme,
			localPath: owner[`${theme}Path`]
		}))
	);
	const artManifest = {
		schemaVersion: 'science-question-art-manifest/v1',
		releaseId: 'fixture-release',
		width: 960,
		height: 540,
		cohort: {
			pairPolicy: 'one-pair-per-challenge',
			ownersSha256: canonicalHash(ownerRows),
			filesSha256: canonicalHash(fileRows),
			owners: ownerRows,
			files: fileRows
		},
		specs: ownerRows.map(makeManifestSpec)
	};
	const expectations = {
		releaseId: 'fixture-release',
		acceptedSubsetSchema: 'science-challenge-accepted-subset/v1',
		acceptedChallengeCount: 2,
		acceptedChallengeEntriesSha256: canonicalHash(acceptedSubset.challenges),
		acceptedChallengeIdsSha256: canonicalHash(
			acceptedSubset.challenges.map((entry) => entry.definition.id)
		),
		acceptedChallengeSortedIdsSha256: canonicalHash(
			acceptedSubset.challenges
				.map((entry) => entry.definition.id)
				.sort((left, right) => left.localeCompare(right))
		),
		artManifestSha256: canonicalHash(artManifest),
		manifestOwnerCount: 3,
		acceptedNewOwnerCount: 2,
		existingReplacementOwnerCount: 1,
		authoredChallengeCount: 2,
		authoredDefinitionsSha256: canonicalHash(authoredDefinitions),
		retainedStaticOwnerCount: 1,
		finalOwnerCount: 4,
		finalFileCount: 8,
		requireFrozenArtManifest: false,
		requireRetainedStaticReview: false,
		requiredStaticMappings: {
			'authored-static-001': {
				darkPath: 'static/product/test/authored-static-001-dark.webp',
				lightPath: 'static/product/test/authored-static-001-light.webp'
			}
		}
	};
	return {
		acceptedSubset,
		artManifest,
		authoredDefinitions,
		authoredVisuals,
		expectations,
		inputs: {
			repositoryRoot: process.cwd(),
			acceptedSubset,
			acceptedSubsetPath: 'tmp/fixture/accepted-subset.json',
			artManifest,
			artManifestPath: 'tmp/fixture/art-manifest.json',
			authoredDefinitions,
			authoredVisuals
		}
	};
}

function buildFixtureAudit(fixture) {
	return buildScienceChallengeCatalogArtAudit({
		...fixture.inputs,
		expectations: fixture.expectations,
		fingerprintFiles: fakeFingerprints
	});
}

function fakeFingerprints({ fileRecords }) {
	const hashByOwner = new Map([
		['accepted-new-001', '0000000000000000'],
		['accepted-new-002', 'ffffffffffffffff'],
		['authored-replacement-001', 'aaaaaaaaaaaaaaaa'],
		['authored-static-001', '5555555555555555']
	]);
	return fileRecords.map((record, index) => ({
		...record,
		sha256: (index + 1).toString(16).padStart(64, '0'),
		dHashes: fingerprints(hashByOwner.get(record.challengeId))
	}));
}

function fingerprints(value) {
	return Object.fromEntries(SCIENCE_QUESTION_ART_DHASH_VARIANTS.map((variant) => [variant, value]));
}

function makeAcceptedEntry(id) {
	return {
		definition: makeDefinition(id),
		grounding: { id: `${id}-grounding` },
		art: { opening: { id: `${id}-opening` } }
	};
}

function makeDefinition(id) {
	return {
		id,
		previewQuestion: 'Use the supplied values to calculate the result.',
		staticAnswers: {
			a: 'The first calculation is complete.',
			b: 'The second calculation is complete.'
		},
		diagnosisPrompt: 'Which calculation is valid?',
		diagnosisChoices: [],
		repairPrompt: 'Which repair is valid?',
		repairChoices: [],
		transferPromptLead: 'Apply the same relationship to the new values.',
		transferChoices: []
	};
}

function makeManifestOwner(challengeId, ownerKind) {
	const artId = `${challengeId}-opening`;
	return {
		challengeId,
		ownerKind,
		artId,
		context: 'opening',
		sourceSpecSha256: canonicalHash({ challengeId, artId }),
		darkPath: `tmp/fixture/assets/${artId}-dark-v1.webp`,
		lightPath: `tmp/fixture/assets/${artId}-light-v1.webp`
	};
}

function makeManifestSpec(owner) {
	return {
		schemaVersion: 'science-question-art/v1',
		id: owner.artId,
		challengeId: owner.challengeId,
		context: 'opening',
		subject: 'biology',
		question: 'Use the supplied values to calculate the result.',
		scene: `A neutral calculation workspace unique to ${owner.challengeId}.`,
		visualAnchor: `A sealed fixture object unique to ${owner.challengeId}.`,
		altText: `A neutral calculation workspace for ${owner.challengeId}.`,
		approvedMeaning: 'The unresolved starting situation is visible.',
		accuracyConstraints: ['Keep the equipment intact.', 'Keep the result unresolved.'],
		forbiddenDetails: ['No answer or result.', 'No labels or equations.'],
		output: {
			darkPath: owner.darkPath,
			lightPath: owner.lightPath
		}
	};
}

function pgmBytes(reverse) {
	const pixels = Buffer.from(
		Array.from({ length: 72 }, (_, index) => {
			const value = (index * 37 + Math.floor(index / 9) * 19) % 256;
			return reverse ? 255 - value : value;
		})
	);
	return Buffer.concat([Buffer.from('P5\n9 8\n255\n', 'ascii'), pixels]);
}
