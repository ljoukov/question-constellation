import assert from 'node:assert/strict';
import test from 'node:test';

import {
	SCIENCE_CHALLENGE_PLAN_SCHEMA,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	SCIENCE_CHALLENGE_RELEASE_SCHEMA,
	SCIENCE_QUESTION_ART_DELIVERY_SCHEMA,
	SCIENCE_QUESTION_ART_SCHEMA,
	SCIENCE_QUESTION_ART_MANIFEST_SCHEMA,
	canonicalHash,
	challengeBatchOutputSchema,
	normalizeGeneratedChallengeBatch,
	scienceQuestionArtLocalPath,
	scienceQuestionArtPublicPath,
	scienceQuestionArtR2Key,
	stableStringify,
	validateChallengePlan,
	validateGeneratedChallenge,
	validateGeneratedChallengeCollection,
	validateIndependentArtReviewRow,
	validateIndependentContentReviewRow,
	validateQuestionArt,
	validateQuestionArtDeliveryManifest,
	validateQuestionArtManifest,
	validateRelease
} from './science-challenge-release.mjs';

const SOURCE_HASH = '1'.repeat(64);
const SPECIFICATION_HASH = '2'.repeat(64);

test('canonical JSON and hashes do not depend on object insertion order', () => {
	const left = { zebra: 1, alpha: { two: 2, one: 1 }, rows: [{ beta: 2, alpha: 1 }] };
	const right = { rows: [{ alpha: 1, beta: 2 }], alpha: { one: 1, two: 2 }, zebra: 1 };

	assert.equal(stableStringify(left), stableStringify(right));
	assert.equal(canonicalHash(left), canonicalHash(right));
});

test('structured authoring constrains subject art themes to the release vocabulary', () => {
	const schema = challengeBatchOutputSchema(1);
	assert.deepEqual(
		schema.properties.challenges.items.properties.definition.properties.subjectArtTheme.enum,
		[
			'cells-practical',
			'biochemistry',
			'inheritance-reproduction',
			'regulation-immunity',
			'particles-bonding',
			'reactions-energy',
			'practical-analysis',
			'materials-industry',
			'forces-motion',
			'electricity-magnetism',
			'thermal-particles',
			'radiation-measurement'
		]
	);
});

test('structured-output null placeholders normalize without mutating the raw model response', () => {
	const raw = {
		challenges: [
			{ definition: { id: 'without-data', questionPresentation: null } },
			{
				definition: {
					id: 'with-copy',
					questionPresentation: { lead: 'A result is given.', task: 'Explain it.', table: null }
				}
			}
		]
	};
	const normalized = normalizeGeneratedChallengeBatch(raw);
	assert.equal(raw.challenges[0].definition.questionPresentation, null);
	assert.equal(raw.challenges[1].definition.questionPresentation.table, null);
	assert.equal('questionPresentation' in normalized.challenges[0].definition, false);
	assert.equal('table' in normalized.challenges[1].definition.questionPresentation, false);
});

test('a fully bound challenge and release pass deterministic validation', () => {
	const row = makePlanRow();
	const entry = makeEntry();
	const result = validateGeneratedChallenge(entry, {
		planRow: row,
		sourceQuestion: { id: row.calibrationQuestionId, contentSha256: SOURCE_HASH },
		curriculum: {
			id: row.curriculumComponentId,
			specificationId: row.specificationId,
			specificationSha256: SPECIFICATION_HASH
		}
	});
	assert.deepEqual(result, { status: 'passed', issues: [] });

	const release = makeRelease([entry]);
	assert.deepEqual(validateRelease(release, { expectedCount: 1 }), {
		status: 'passed',
		issues: []
	});
});

test('plan validation binds the current catalogue, unique calibrators, curriculum, and source hashes', () => {
	const row = makePlanRow();
	const plan = makePlan([row]);
	const context = {
		sourceSnapshot: { questions: [{ id: row.calibrationQuestionId, contentSha256: SOURCE_HASH }] },
		curriculumEvidence: { components: [{ componentId: row.curriculumComponentId }] }
	};
	assert.equal(validateChallengePlan(plan, context).status, 'passed');

	const retiredCount = structuredClone(plan);
	retiredCount.targetFinalQuestionContextCount = 999;
	assert.match(
		validateChallengePlan(retiredCount, context).issues.join('\n'),
		/not part of the current plan schema/
	);

	const wrongSource = structuredClone(plan);
	wrongSource.rows[0].calibrationQuestionSha256 = '3'.repeat(64);
	assert.match(
		validateChallengePlan(wrongSource, context).issues.join('\n'),
		/calibrationQuestionSha256 differs/
	);
});

test('generated challenge validation fails closed on malformed and stale provenance', () => {
	assert.doesNotThrow(() => validateGeneratedChallenge({ definition: {}, grounding: {}, art: {} }));
	assert.equal(
		validateGeneratedChallenge({ definition: {}, grounding: {}, art: {} }).status,
		'failed'
	);

	const stale = makeEntry();
	stale.definition.sourceQuestionId = 'different-paper-question';
	const staleResult = validateGeneratedChallenge(stale, { planRow: makePlanRow() });
	assert.equal(staleResult.status, 'failed');
	assert.match(staleResult.issues.join('\n'), /sourceQuestionId/);

	const nonBoolean = makeEntry();
	nonBoolean.definition.repairChoices[1].correct = 'false';
	const choiceResult = validateGeneratedChallenge(nonBoolean);
	assert.equal(choiceResult.status, 'failed');
	assert.match(choiceResult.issues.join('\n'), /correct must be boolean/);
});

test('runtime question presentation nulls and incomplete table cells are rejected', () => {
	const nullPresentation = makeEntry();
	nullPresentation.definition.questionPresentation = null;
	assert.match(
		validateGeneratedChallenge(nullPresentation).issues.join('\n'),
		/questionPresentation must be omitted/
	);

	const incompleteTable = makeEntry();
	incompleteTable.definition.questionPresentation = {
		lead: 'Measurements from two samples are shown.',
		task: 'Compare the samples using the measurements.',
		table: {
			caption: 'Sample measurements',
			columns: ['Sample', 'Mass'],
			rows: [['A', '']]
		}
	};
	assert.match(
		validateGeneratedChallenge(incompleteTable).issues.join('\n'),
		/2-8 complete two-cell rows/
	);
});

test('question contexts reject missing diagram dependencies and drawing tasks', () => {
	const missingDiagram = makeEntry();
	missingDiagram.definition.transferPromptLead =
		'A diagram shows a bacterial cell beside liver and mesophyll cells. Which set gives three differences?';
	assert.match(
		validateGeneratedChallenge(missingDiagram).issues.join('\n'),
		/refers to unseen visual evidence/
	);

	const drawingTask = makeEntry();
	drawingTask.definition.transferPromptLead =
		'Draw a circuit diagram showing a cell, a switch and two lamps connected in parallel.';
	assert.match(
		validateGeneratedChallenge(drawingTask).issues.join('\n'),
		/asks the learner to draw/
	);

	const nestedMissingDiagram = makeEntry();
	nestedMissingDiagram.definition.diagnosisChoices[0].feedback =
		'The diagram above does not support that diagnosis.';
	assert.match(
		validateGeneratedChallenge(nestedMissingDiagram).issues.join('\n'),
		/definition\.diagnosisChoices\[0\]\.feedback refers to unseen visual evidence/
	);

	const nestedDrawingTask = makeEntry();
	nestedDrawingTask.definition.repairChoices[0].feedback = 'Now draw a graph to check the repair.';
	assert.match(
		validateGeneratedChallenge(nestedDrawingTask).issues.join('\n'),
		/definition\.repairChoices\[0\]\.feedback asks the learner to draw/
	);
});

test('learner-facing copy keeps mark allocations structural at every nesting depth', () => {
	for (const allocation of ['[3 marks]', '(3 marks)', '3 marks', 'three marks', 'six mark']) {
		const topLevel = makeEntry();
		topLevel.definition.previewQuestion += ` ${allocation}`;
		assert.match(
			validateGeneratedChallenge(topLevel).issues.join('\n'),
			/definition\.previewQuestion includes an inline mark allocation/,
			allocation
		);
	}

	const nested = makeEntry();
	nested.definition.transferChoices[0].feedback = 'Credit this link. [1 mark]';
	assert.match(
		validateGeneratedChallenge(nested).issues.join('\n'),
		/definition\.transferChoices\[0\]\.feedback includes an inline mark allocation/
	);
});

test('learner-facing copy rejects internal product jargon while allowing the internal mechanic', () => {
	for (const jargon of [
		'answer chain',
		'missing link',
		'repair chain',
		'close the gap',
		'practise this step',
		'constellation'
	]) {
		const entry = makeEntry();
		entry.definition.hook = `This public prompt accidentally exposes the internal ${jargon} terminology.`;
		assert.match(
			validateGeneratedChallenge(entry).issues.join('\n'),
			/definition\.hook includes internal product jargon/,
			jargon
		);
	}

	const clean = makeEntry();
	assert.equal(clean.definition.mechanic, 'missing-link');
	assert.doesNotMatch(
		validateGeneratedChallenge(clean).issues.join('\n'),
		/definition\.mechanic includes internal product jargon/
	);
});

test('recursive visual checks do not mistake optics terms or closed-circuit prose for missing art', () => {
	const entry = makeEntry();
	entry.definition.metaDescription =
		'Calculate image height from object height and magnification in this focused GCSE Biology challenge without relying on an unseen figure.';
	entry.definition.repairSuccess =
		'The repaired explanation now includes a complete circuit and a source of potential difference.';
	entry.definition.transferChoices[0].feedback =
		'This puts object height above image height and therefore reverses the required ratio.';
	const issues = validateGeneratedChallenge(entry).issues.join('\n');
	assert.doesNotMatch(issues, /refers to unseen visual evidence/);
	assert.doesNotMatch(issues, /asks the learner to draw/);
});

test('visible art fields fail when they repeat concepts that uniquely signal the correct choice', () => {
	const fixtures = [
		{
			name: 'immune-cell models',
			prompt: 'A person with uncontrolled HIV later develops a serious infection.',
			correct:
				'HIV attacks immune cells, damaging the immune system until it cannot control the infection.',
			wrong: [
				'HIV produces bacterial toxins that turn the infection into cancer.',
				'HIV stays in the stomach so skin cannot block pathogens.'
			],
			art: 'Translucent immune-cell teaching models beside a sealed blood tube.'
		},
		{
			name: 'towels and changing room',
			prompt: 'A fungal skin infection spreads by direct contact in a sports centre.',
			correct: 'Stop people sharing towels and clean changing-room surfaces frequently.',
			wrong: [
				'Treat the drinking water and repair waste-water pipes.',
				'Open windows and ask everyone to cover coughs.'
			],
			art: 'Separate folded towels beside a closed cleaning cupboard in a changing room.'
		},
		{
			name: 'fair seed method',
			prompt: 'A class investigates gravity using germinated beans in dishes.',
			correct:
				'Use several seeds, keep light and temperature the same, then record root direction.',
			wrong: [
				'Use one seed and record only its final direction.',
				'Warm one set, cool the other and compare root length.'
			],
			art: 'Several seed dishes in matching racks under the same even light.'
		},
		{
			name: 'rooting powder',
			prompt: 'A nursery wants stem cuttings to develop roots before planting.',
			correct: 'Dip the cut bases in auxin rooting powder to promote root growth.',
			wrong: [
				'Expose the cut bases to ethene to increase root length.',
				'Apply gibberellin to the cut bases to stop growth.'
			],
			art: 'Fresh stem cuttings beside a shallow dish of rooting powder.'
		},
		{
			name: 'folded protein',
			prompt: 'A mutation changes coding DNA for an enzyme.',
			correct: 'The amino acid order may change, so the protein may fold differently.',
			wrong: [
				'Any base change stops protein synthesis completely.',
				'The DNA strand itself becomes the enzyme.'
			],
			art: 'A sealed DNA vial beside a folded-protein sculpture.'
		}
	];
	for (const fixture of fixtures) {
		const definition = makeArtLeakDefinition(fixture.prompt, fixture.correct, fixture.wrong);
		const art = makeArt(definition.id, 'transfer', fixture.art);
		art.visualAnchor = fixture.art;
		art.altText = fixture.art;
		const issues = validateQuestionArt(art, 'transfer', definition, []);
		assert.match(
			issues.join('\n'),
			/visible fields may reveal the correct choice through answer-unique concepts/,
			fixture.name
		);
	}
});

test('answer-leakage comparison does not join concepts across separate art fields', () => {
	const definition = makeArtLeakDefinition(
		'A plotting compass is placed beside the south pole of a bar magnet.',
		'The compass needle is a small magnet that aligns with the magnetic field.',
		[
			'The south pole attracts any metal needle that is close.',
			'Gravity pulls the needle horizontally towards geographic north.'
		]
	);
	const art = makeArt(definition.id, 'transfer', 'A plotting compass beside a bar magnet.');
	art.visualAnchor = 'A freely pivoted plotting compass beside an unmarked bar magnet.';
	art.altText = 'A small brass plotting compass rests on green felt.';
	assert.doesNotMatch(
		validateQuestionArt(art, 'transfer', definition, []).join('\n'),
		/visible fields may reveal/
	);

	const promptGroundedDefinition = makeArtLeakDefinition(
		'A farm will fit sealed covers so methane can be collected instead of released.',
		'Capturing methane reduces its release, but sealed covers and collection equipment cost money.',
		[
			'Capturing methane removes every farm emission and has no resource cost.',
			'Capturing methane increases its release but makes the footprint smaller.'
		]
	);
	const promptGroundedArt = makeArt(
		promptGroundedDefinition.id,
		'transfer',
		'A covered slurry store with a closed collection pipe.'
	);
	assert.doesNotMatch(
		validateQuestionArt(promptGroundedArt, 'transfer', promptGroundedDefinition, []).join('\n'),
		/visible fields may reveal/
	);
});

test('collection validation catches same-component context reuse and exact global titles', () => {
	const first = {
		definition: {
			id: 'biology-cell-specialisation-01',
			title: 'How do sperm cells reach an egg?',
			previewQuestion:
				'A sperm cell must travel through fluid to reach an egg. It has a tail and many mitochondria. Explain how both structures help it reach the egg.',
			transferPromptLead:
				'A root hair cell absorbs minerals from dilute soil. Explain how its structure supports this process.'
		},
		grounding: { curriculumComponentId: 'biology-cell-specialisation' }
	};
	const second = {
		definition: {
			id: 'biology-cell-specialisation-02',
			title: 'How do sperm cells reach an egg?',
			previewQuestion:
				'A sperm cell must swim to reach an egg. It has a tail and many mitochondria. Explain how these structures help the sperm cell reach the egg.',
			transferPromptLead:
				'A palisade cell receives bright light. Explain how its structure supports photosynthesis.'
		},
		grounding: { curriculumComponentId: 'biology-cell-specialisation' }
	};
	const result = validateGeneratedChallengeCollection([first, second]);
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /definition\.title duplicates/);
	assert.match(
		result.issues.join('\n'),
		/biology-cell-specialisation-02:opening is too similar to biology-cell-specialisation-01:opening/
	);
});

test('collection similarity gate catches known formula and rule sentence skeleton reuse', () => {
	const entries = [
		contextFixture(
			'physics-current-01',
			'physics-current',
			'A heated glove element has a potential difference of 9.0 V across it and a current of 0.30 A through it. Complete the calculation using V = IR.',
			'Explain why a fuse melts when the current is too high.'
		),
		contextFixture(
			'physics-current-02',
			'physics-current',
			'A seed mat has a resistance of 30 Ω and a potential difference of 12 V across it. Calculate the current through the mat using V = IR.',
			'Describe how an ammeter is connected in a simple test circuit.'
		),
		contextFixture(
			'physics-fleming-01',
			'physics-fleming',
			'A conductor carries conventional current north in a magnetic field pointing east. Use Fleming’s left-hand rule to state the force direction.',
			'Explain how increasing current changes the motor-effect force.'
		),
		contextFixture(
			'physics-fleming-02',
			'physics-fleming',
			'Conventional current in a conductor flows north while the magnetic field acts east. Which application of Fleming’s left-hand rule gives the force direction?',
			'Describe how reversing the field changes the motor-effect force.'
		)
	];
	const issues = validateGeneratedChallengeCollection(entries).issues.join('\n');
	assert.match(issues, /physics-current-02:opening is too similar to physics-current-01:opening/);
	assert.match(issues, /physics-fleming-02:opening is too similar to physics-fleming-01:opening/);
});

test('collection context comparison permits genuinely distinct tasks and ignores cross-topic vocabulary', () => {
	const first = {
		definition: {
			id: 'first',
			title: 'How does the first process work?',
			previewQuestion: 'Calculate the density of a slate block from its measured mass and volume.',
			transferPromptLead: 'Explain why a liquid pushes perpendicular to a flat aquarium window.'
		},
		grounding: { curriculumComponentId: 'physics-density' }
	};
	const second = {
		definition: {
			id: 'second',
			title: 'Why does the second result change?',
			previewQuestion:
				'Describe how a displacement can be used to find the volume of an irregular pebble.',
			transferPromptLead:
				'Choose suitable equipment for measuring the mass of a small metal component.'
		},
		grounding: { curriculumComponentId: 'physics-density' }
	};
	const sameWordsElsewhere = structuredClone(first);
	sameWordsElsewhere.definition.id = 'third';
	sameWordsElsewhere.definition.title = 'How is density used elsewhere?';
	sameWordsElsewhere.grounding.curriculumComponentId = 'physics-pressure';
	assert.deepEqual(validateGeneratedChallengeCollection([first, second, sameWordsElsewhere]), {
		status: 'passed',
		issues: []
	});
});

test('collection title uniqueness includes the existing public catalogue', () => {
	const entry = {
		definition: {
			id: 'new-challenge',
			title: 'Why did the atomic model change?',
			previewQuestion: 'Explain why a scientific model may change after new experimental evidence.',
			transferPromptLead: 'Choose the evidence that would justify revising a scientific model.'
		},
		grounding: { curriculumComponentId: 'chemistry-atomic-model' }
	};
	assert.match(
		validateGeneratedChallengeCollection([entry], {
			existingDefinitions: [{ id: 'existing-challenge', title: 'Why did the atomic model change?' }]
		}).issues.join('\n'),
		/duplicates existing-challenge/
	);
});

test('release validation enforces globally unique question contexts and illustration scenes', () => {
	const first = makeEntry(1);
	const second = makeEntry(2);
	second.definition.previewQuestion = `${first.definition.transferPromptLead.replace(/\?$/, '')}.`;
	second.art.opening.scene = first.art.transfer.scene;
	const result = validateRelease(makeRelease([first, second]), { expectedCount: 2 });
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /duplicates question context/);
	assert.match(result.issues.join('\n'), /reuses an illustration scene/);
});

test('art manifest validation enforces the 1:1 context map and two unique output assets per context', () => {
	const entry = makeEntry();
	const manifest = makeArtManifest(entry);
	assert.deepEqual(validateQuestionArtManifest(manifest, { expectedCount: 2 }), {
		status: 'passed',
		issues: []
	});

	const stale = structuredClone(manifest);
	stale.specs[1].question = stale.specs[0].question;
	stale.specs[1].output.lightPath = stale.specs[0].output.lightPath;
	const result = validateQuestionArtManifest(stale, { expectedCount: 1_000 });
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /Expected 1000 art specs/);
	assert.match(result.issues.join('\n'), /duplicates a question context/);
	assert.match(result.issues.join('\n'), /output.lightPath is invalid|duplicates output path/);
});

test('art manifest validation requires one light/dark pair per challenge in any complete release', () => {
	const manifest = makeArtManifest(makeEntry());
	manifest.cohort = { pairPolicy: 'one-pair-per-challenge' };
	manifest.specs = manifest.specs.filter((spec) => spec.context === 'opening');

	assert.deepEqual(validateQuestionArtManifest(manifest, { expectedCount: 1 }), {
		status: 'passed',
		issues: []
	});

	const invalid = structuredClone(manifest);
	invalid.specs[0].context = 'transfer';
	const result = validateQuestionArtManifest(invalid, { expectedCount: 1 });
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /context must be transfer|exactly one opening art spec/);
});

test('R2 delivery manifests bind reviewed bytes to immutable release-scoped public paths', () => {
	const artManifest = makeArtManifest(makeEntry());
	const inventory = artManifest.specs.map((spec, specIndex) => ({
		id: spec.id,
		darkSha256: String(specIndex + 1).repeat(64),
		lightSha256: String(specIndex + 3).repeat(64)
	}));
	const objects = artManifest.specs.flatMap((spec, specIndex) =>
		['dark', 'light'].map((theme) => {
			const assetSha256 =
				theme === 'dark' ? inventory[specIndex].darkSha256 : inventory[specIndex].lightSha256;
			return {
				id: `${spec.id}-${theme}`,
				artId: spec.id,
				challengeId: spec.challengeId,
				subject: spec.subject,
				context: spec.context,
				theme,
				localPath: spec.output[`${theme}Path`],
				r2Key: scienceQuestionArtR2Key(artManifest.releaseId, spec.id, theme, assetSha256),
				publicPath: scienceQuestionArtPublicPath(
					artManifest.releaseId,
					spec.id,
					theme,
					assetSha256
				),
				sha256: assetSha256,
				size: 42,
				contentType: 'image/webp',
				cacheControl: 'public, max-age=31536000, immutable'
			};
		})
	);
	const delivery = {
		schemaVersion: SCIENCE_QUESTION_ART_DELIVERY_SCHEMA,
		releaseId: artManifest.releaseId,
		bucket: 'question-constellation',
		sourceManifestSha256: canonicalHash(artManifest),
		assetInventorySha256: canonicalHash(inventory),
		objectCount: objects.length,
		objects
	};
	assert.deepEqual(
		validateQuestionArtDeliveryManifest(delivery, {
			artManifest,
			expectedCount: 4
		}),
		{ status: 'passed', issues: [] }
	);

	const mutable = structuredClone(delivery);
	mutable.objects[0].r2Key = 'images/challenges/science-fixture-v1/mutable.webp';
	assert.match(
		validateQuestionArtDeliveryManifest(mutable, { artManifest }).issues.join('\n'),
		/r2Key is invalid/
	);
});

test('accepted releases require exact review bindings and expected hard counts', () => {
	const accepted = makeRelease([makeEntry()], 'accepted');
	accepted.release.contentVerificationSha256 = null;
	accepted.release.artReviewSha256 = null;
	accepted.release.artPerceptualAuditSha256 = null;
	accepted.release.provenanceArchiveSha256 = null;
	accepted.release.runtimeSha256 = null;
	accepted.release.shortRecallBundleSha256 = null;
	accepted.release.shortRecallReviewSha256 = null;
	const result = validateRelease(accepted, { expectedCount: 2 });
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /contentVerificationSha256/);
	assert.match(result.issues.join('\n'), /artReviewSha256/);
	assert.match(result.issues.join('\n'), /artPerceptualAuditSha256/);
	assert.match(result.issues.join('\n'), /provenanceArchiveSha256/);
	assert.match(result.issues.join('\n'), /runtimeSha256/);
	assert.match(result.issues.join('\n'), /shortRecallBundleSha256/);
	assert.match(result.issues.join('\n'), /shortRecallReviewSha256/);
	assert.match(result.issues.join('\n'), /Expected 2 challenges, found 1/);
});

test('short-recall review bindings are optional for candidates and lowercase hashes when present', () => {
	const omitted = makeRelease([makeEntry()]);
	delete omitted.release.shortRecallBundleSha256;
	delete omitted.release.shortRecallReviewSha256;
	assert.equal(validateRelease(omitted, { expectedCount: 1 }).status, 'passed');

	const nullable = makeRelease([makeEntry()]);
	nullable.release.shortRecallBundleSha256 = null;
	nullable.release.shortRecallReviewSha256 = null;
	assert.equal(validateRelease(nullable, { expectedCount: 1 }).status, 'passed');

	const malformed = makeRelease([makeEntry()]);
	malformed.release.shortRecallBundleSha256 = 'A'.repeat(64);
	malformed.release.shortRecallReviewSha256 = '';
	const issues = validateRelease(malformed, { expectedCount: 1 }).issues.join('\n');
	assert.match(issues, /shortRecallBundleSha256 must be a lowercase SHA-256 hash/);
	assert.match(issues, /shortRecallReviewSha256 must be a lowercase SHA-256 hash/);
});

test('release validation binds coverage and generation lineage', () => {
	const release = makeRelease([makeEntry()]);
	release.coverage.generatedRounds = 2;
	release.lineage.content = [];
	const result = validateRelease(release, { expectedCount: 1 });
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /coverage\.generatedRounds/);
	assert.match(result.issues.join('\n'), /lineage\.content/);
	assert.match(result.issues.join('\n'), /coverageSha256/);
	assert.match(result.issues.join('\n'), /lineageSha256/);
});

test('release validation rejects stale authoring prompt versions', () => {
	const release = makeRelease([makeEntry()]);
	release.release.promptVersion = 'science-challenge-authoring-v2';
	assert.match(
		validateRelease(release, { expectedCount: 1 }).issues.join('\n'),
		/release\.promptVersion must be science-challenge-authoring-v3/
	);
});

test('candidate lineage accepts an exact review-rebase successor and selected B0 source', () => {
	const release = makeRelease([makeEntry()]);
	bindReviewRebaseLineage(release, { includeSource: true });

	assert.deepEqual(validateRelease(release, { expectedCount: 1 }), {
		status: 'passed',
		issues: []
	});
	assert.equal('contentParentLineageSha256' in release.release, false);
});

test('review-rebase parent and selected-source lineage fail closed', async (t) => {
	const fixture = () => {
		const release = makeRelease([makeEntry()]);
		bindReviewRebaseLineage(release, { includeSource: true });
		return release;
	};
	const cases = [
		{
			name: 'partial parent chain',
			mutate(value) {
				delete value.lineage.effectiveCohort.parentChain.mutableTargetSetSha256;
			},
			expected: /exact review-rebase successor fields|mutableTargetSetSha256/
		},
		{
			name: 'extra parent chain field',
			mutate(value) {
				value.lineage.effectiveCohort.parentChain.unreviewed = '0'.repeat(64);
			},
			expected: /exact review-rebase successor fields/
		},
		{
			name: 'wrong parent kind',
			mutate(value) {
				value.lineage.effectiveCohort.parentChain.kind = 'legacy-successor';
			},
			expected: /kind must be review-rebase-successor/
		},
		{
			name: 'parent hash is not lowercase',
			mutate(value) {
				value.lineage.effectiveCohort.parentChain.reviewRebaseId = 'A'.repeat(64);
			},
			expected: /reviewRebaseId must be a lowercase SHA-256/
		},
		{
			name: 'selected source has no parent',
			mutate(value) {
				delete value.lineage.effectiveCohort.parentChain;
			},
			expected: /differs from the effective-cohort review-rebase parent chain/
		},
		{
			name: 'selected source competes with run summaries',
			mutate(value) {
				value.lineage.content[0].runSummaries = makeRelease([
					makeEntry()
				]).lineage.content[0].runSummaries;
			},
			expected: /mutually exclusive with run summaries/
		},
		{
			name: 'selected source adds an unbound field',
			mutate(value) {
				value.lineage.content[0].reviewRebaseSource.unreviewed = true;
			},
			expected: /exact review-rebase selection fields/
		},
		{
			name: 'selected source points at another output',
			mutate(value) {
				value.lineage.content[0].reviewRebaseSource.outputCandidateSha256 = 'f'.repeat(64);
			},
			expected: /output hashes differ/
		},
		{
			name: 'selected source parent hash is stale',
			mutate(value) {
				value.lineage.content[0].reviewRebaseSource.parentRepairSha256 = 'f'.repeat(64);
			},
			expected: /differs from the effective-cohort review-rebase parent chain/
		},
		{
			name: 'selected validation uses unsupported thinking',
			mutate(value) {
				value.lineage.content[0].reviewRebaseSource.sourceValidations[0].thinkingLevel = 'medium';
			},
			expected: /thinkingLevel must be high or max/
		},
		{
			name: 'selected validation omits the base source',
			mutate(value) {
				value.lineage.content[0].reviewRebaseSource.sourceValidations[0].challengeId =
					'biology-cells-01';
			},
			expected: /exactly one base source/
		},
		{
			name: 'selected base validation is rebound',
			mutate(value) {
				value.lineage.content[0].reviewRebaseSource.sourceValidations[0].validationSha256 =
					'f'.repeat(64);
			},
			expected: /differs from the selected base source hashes/
		}
	];

	for (const entry of cases) {
		await t.test(entry.name, () => {
			const release = fixture();
			entry.mutate(release);
			rebindReleaseLineage(release);
			assert.match(
				validateRelease(release, { expectedCount: 1 }).issues.join('\n'),
				entry.expected
			);
		});
	}
});

test('accepted content-parent metadata is required exactly for review-rebase ancestry', () => {
	const accepted = makeRelease([makeEntry()], 'accepted');
	const parentChain = bindReviewRebaseLineage(accepted);
	let issues = validateRelease(accepted, { expectedCount: 1 }).issues.join('\n');
	assert.match(issues, /contentParentLineageSha256 must equal the canonical hash/);

	accepted.release.contentParentLineageSha256 = canonicalHash(parentChain);
	issues = validateRelease(accepted, { expectedCount: 1 }).issues.join('\n');
	assert.doesNotMatch(issues, /contentParentLineageSha256/);

	accepted.release.contentParentLineageSha256 = 'f'.repeat(64);
	issues = validateRelease(accepted, { expectedCount: 1 }).issues.join('\n');
	assert.match(issues, /contentParentLineageSha256 must equal the canonical hash/);

	const ordinary = makeRelease([makeEntry()], 'accepted');
	ordinary.release.contentParentLineageSha256 = canonicalHash(parentChain);
	assert.match(
		validateRelease(ordinary, { expectedCount: 1 }).issues.join('\n'),
		/contentParentLineageSha256 is forbidden without review-rebase ancestry/
	);
	ordinary.release.contentParentLineageSha256 = null;
	assert.match(
		validateRelease(ordinary, { expectedCount: 1 }).issues.join('\n'),
		/contentParentLineageSha256 is forbidden without review-rebase ancestry/
	);

	const candidate = makeRelease([makeEntry()]);
	bindReviewRebaseLineage(candidate);
	candidate.release.contentParentLineageSha256 = canonicalHash(
		candidate.lineage.effectiveCohort.parentChain
	);
	assert.match(
		validateRelease(candidate, { expectedCount: 1 }).issues.join('\n'),
		/candidate release must not bind contentParentLineageSha256/
	);
	candidate.release.contentParentLineageSha256 = null;
	assert.match(
		validateRelease(candidate, { expectedCount: 1 }).issues.join('\n'),
		/candidate release must not bind contentParentLineageSha256/
	);
});

test('content lineage binds the accepted candidate and fail-closes repaired runs without evidence', () => {
	const stale = makeRelease([makeEntry()]);
	stale.lineage.content[0].runSummaries[0].candidateSha256 = '1'.repeat(64);
	stale.release.lineageSha256 = canonicalHash(stale.lineage);
	stale.release.contentGenerationLineageSha256 = canonicalHash(stale.lineage.content);
	assert.match(
		validateRelease(stale, { expectedCount: 1 }).issues.join('\n'),
		/no run bound to its accepted candidate/
	);

	const unevidencedRepair = makeRelease([makeEntry()]);
	const run = unevidencedRepair.lineage.content[0].runSummaries[0];
	run.kind = 'independent-verification-repair';
	run.repairEvidence = null;
	unevidencedRepair.release.lineageSha256 = canonicalHash(unevidencedRepair.lineage);
	unevidencedRepair.release.contentGenerationLineageSha256 = canonicalHash(
		unevidencedRepair.lineage.content
	);
	assert.match(
		validateRelease(unevidencedRepair, { expectedCount: 1 }).issues.join('\n'),
		/invalid authoring run provenance/
	);

	const toolUsing = makeRelease([makeEntry()]);
	toolUsing.lineage.content[0].runSummaries[0].toolFree = false;
	toolUsing.release.lineageSha256 = canonicalHash(toolUsing.lineage);
	toolUsing.release.contentGenerationLineageSha256 = canonicalHash(toolUsing.lineage.content);
	const toolUsingIssues = validateRelease(toolUsing, { expectedCount: 1 }).issues.join('\n');
	assert.match(toolUsingIssues, /invalid authoring run provenance/);
	assert.match(toolUsingIssues, /no run bound to its accepted candidate/);
});

test('content lineage accepts only one complete verifier-directed descendant remap', () => {
	const release = makeRelease([makeEntry()]);
	const shard = release.lineage.content[0];
	shard.candidatePath =
		'tmp/science-fixture/verification-repair-aaaaaaaaaaaa-descendant-remap/candidate.json';
	shard.candidateSha256 = 'd'.repeat(64);
	shard.validationPath =
		'tmp/science-fixture/verification-repair-aaaaaaaaaaaa-descendant-remap/validation.json';
	shard.validationSha256 = 'e'.repeat(64);
	shard.runSummaries = [];
	shard.descendantRemap = {
		schemaVersion: 'science-challenge-verifier-directed-descendant-remap-evidence/v1',
		disposition: 'deterministic-verifier-directed-descendant-remap',
		manifestPath:
			'tmp/science-fixture/verification-repair-aaaaaaaaaaaa-descendant-remap/manifest.json',
		manifestSha256: '1'.repeat(64),
		manifestFileSha256: '2'.repeat(64),
		candidatePath: shard.candidatePath,
		candidateSha256: shard.candidateSha256,
		candidateFileSha256: '3'.repeat(64),
		validationPath: shard.validationPath,
		validationSha256: shard.validationSha256,
		validationFileSha256: '4'.repeat(64),
		effectivePlanPath:
			'tmp/science-fixture/verification-repair-aaaaaaaaaaaa-descendant-remap/effective-plan.json',
		effectivePlanSha256: '5'.repeat(64),
		effectivePlanFileSha256: '6'.repeat(64),
		provenancePath:
			'tmp/science-fixture/verification-repair-aaaaaaaaaaaa-descendant-remap/provenance.json',
		provenanceSha256: '7'.repeat(64),
		provenanceFileSha256: '8'.repeat(64),
		basePlanSha256: '9'.repeat(64),
		remapSha256: 'a'.repeat(64),
		sourceAttempt: { attempt: 3, status: 'failed' },
		sourceAttemptStatus: 'failed',
		execution: {
			executionId: 'b'.repeat(64),
			identity: { objectiveId: 'c'.repeat(64) },
			claims: Array.from({ length: 4 }, (_, index) => ({
				attempt: index + 1,
				path: `tmp/science-fixture/claims/attempt-${index + 1}.json`,
				sha256: String(index + 1).repeat(64),
				fileSha256: String(index + 5).repeat(64)
			}))
		}
	};
	release.lineage.descendantRemaps = [shard.descendantRemap];
	release.lineage.curriculumRemapVerifierInput = {
		sha256: 'd'.repeat(64),
		basePlanSha256: shard.descendantRemap.basePlanSha256,
		effectivePlanSha256: shard.descendantRemap.effectivePlanSha256,
		proposalSetSha256: 'e'.repeat(64),
		manifestSetSha256: '0'.repeat(64),
		decisionSetSha256: null
	};
	Object.assign(release.release, {
		basePlanSha256: shard.descendantRemap.basePlanSha256,
		effectivePlanSha256: shard.descendantRemap.effectivePlanSha256,
		curriculumCatalogSha256: 'f'.repeat(64),
		curriculumRemapVerifierInputSha256: release.lineage.curriculumRemapVerifierInput.sha256,
		descendantRemapManifestSetSha256:
			release.lineage.curriculumRemapVerifierInput.manifestSetSha256,
		curriculumRemapDecisionSetSha256: null
	});
	bindCandidateEffectiveCohort(release, {
		basePlanSha256: shard.descendantRemap.basePlanSha256,
		effectivePlanSha256: shard.descendantRemap.effectivePlanSha256,
		remapManifestSetSha256: release.lineage.curriculumRemapVerifierInput.manifestSetSha256,
		difficultyAdjustmentCount: 0,
		difficultyAdjustmentManifestSetSha256: '5'.repeat(64),
		recoverySetSha256: '2'.repeat(64)
	});
	rebindReleaseLineage(release);
	assert.equal(
		validateRelease(release, { expectedCount: 1 }).status,
		'passed',
		validateRelease(release, { expectedCount: 1 }).issues.join('\n')
	);

	const composed = structuredClone(release);
	const composedEffectivePlanSha256 = '1'.repeat(64);
	composed.lineage.curriculumRemapVerifierInput.effectivePlanSha256 = composedEffectivePlanSha256;
	bindCandidateEffectiveCohort(composed, {
		basePlanSha256: shard.descendantRemap.basePlanSha256,
		effectivePlanSha256: composedEffectivePlanSha256,
		remapManifestSetSha256: composed.lineage.curriculumRemapVerifierInput.manifestSetSha256,
		difficultyAdjustmentCount: 0,
		difficultyAdjustmentManifestSetSha256: '5'.repeat(64),
		recoverySetSha256: '2'.repeat(64)
	});
	rebindReleaseLineage(composed);
	assert.equal(
		validateRelease(composed, { expectedCount: 1 }).status,
		'passed',
		validateRelease(composed, { expectedCount: 1 }).issues.join('\n')
	);

	const competing = structuredClone(release);
	competing.lineage.content[0].salvage = {};
	rebindReleaseLineage(competing);
	assert.match(
		validateRelease(competing, { expectedCount: 1 }).issues.join('\n'),
		/cannot combine multiple exceptional recovery provenances/
	);

	const falseDecisionBinding = structuredClone(release);
	falseDecisionBinding.release.curriculumRemapDecisionSetSha256 = '1'.repeat(64);
	assert.match(
		validateRelease(falseDecisionBinding, { expectedCount: 1 }).issues.join('\n'),
		/candidate descendant-remap hashes are incomplete or inconsistent/
	);
});

test('candidate difficulty adjustment lineage carries no pre-review decision', () => {
	const release = makeRelease([makeEntry()]);
	const shard = release.lineage.content[0];
	shard.candidatePath =
		'tmp/science-fixture/verification-repair-aaaaaaaaaaaa-difficulty-plan-adjustment/candidate.json';
	shard.candidateSha256 = 'd'.repeat(64);
	shard.validationPath =
		'tmp/science-fixture/verification-repair-aaaaaaaaaaaa-difficulty-plan-adjustment/validation.json';
	shard.validationSha256 = 'e'.repeat(64);
	shard.runSummaries = [];
	shard.difficultyPlanAdjustment = {
		schemaVersion: 'science-challenge-verifier-directed-difficulty-plan-adjustment-evidence/v1',
		disposition: 'deterministic-verifier-directed-difficulty-plan-adjustment',
		manifestPath:
			'tmp/science-fixture/verification-repair-aaaaaaaaaaaa-difficulty-plan-adjustment/manifest.json',
		manifestSha256: '1'.repeat(64),
		manifestFileSha256: '2'.repeat(64),
		candidatePath: shard.candidatePath,
		candidateSha256: shard.candidateSha256,
		candidateFileSha256: '3'.repeat(64),
		validationPath: shard.validationPath,
		validationSha256: shard.validationSha256,
		validationFileSha256: '4'.repeat(64),
		effectivePlanPath:
			'tmp/science-fixture/verification-repair-aaaaaaaaaaaa-difficulty-plan-adjustment/effective-plan.json',
		effectivePlanSha256: '5'.repeat(64),
		effectivePlanFileSha256: '6'.repeat(64),
		provenancePath:
			'tmp/science-fixture/verification-repair-aaaaaaaaaaaa-difficulty-plan-adjustment/provenance.json',
		provenanceSha256: '7'.repeat(64),
		provenanceFileSha256: '8'.repeat(64),
		basePlanSha256: '9'.repeat(64),
		adjustmentSha256: 'a'.repeat(64),
		sourceAttempt: { attempt: 4, status: 'failed' },
		sourceAttemptStatus: 'failed',
		execution: {
			executionId: 'b'.repeat(64),
			identity: { objectiveId: 'c'.repeat(64) },
			claims: Array.from({ length: 4 }, (_, index) => ({
				attempt: index + 1,
				path: `tmp/science-fixture/claims/attempt-${index + 1}.json`,
				sha256: String(index + 1).repeat(64),
				fileSha256: String(index + 5).repeat(64)
			}))
		}
	};
	release.lineage.difficultyPlanAdjustments = [shard.difficultyPlanAdjustment];
	release.lineage.difficultyPlanAdjustment = {
		verifierInputSha256: 'd'.repeat(64),
		adjustmentManifestSetSha256: 'e'.repeat(64),
		recoverySetSha256: 'f'.repeat(64),
		acceptedDecisionCount: null,
		decisionSetSha256: null
	};
	Object.assign(release.release, {
		difficultyPlanAdjustmentVerifierInputSha256:
			release.lineage.difficultyPlanAdjustment.verifierInputSha256,
		difficultyAdjustmentManifestSetSha256:
			release.lineage.difficultyPlanAdjustment.adjustmentManifestSetSha256,
		recoverySetSha256: release.lineage.difficultyPlanAdjustment.recoverySetSha256,
		difficultyPlanAdjustmentDecisionCount: null,
		difficultyPlanAdjustmentDecisionSetSha256: null
	});
	bindCandidateEffectiveCohort(release, {
		basePlanSha256: shard.difficultyPlanAdjustment.basePlanSha256,
		effectivePlanSha256: shard.difficultyPlanAdjustment.effectivePlanSha256,
		remapManifestSetSha256: '0'.repeat(64),
		difficultyAdjustmentCount: 1,
		difficultyAdjustmentManifestSetSha256:
			release.lineage.difficultyPlanAdjustment.adjustmentManifestSetSha256,
		recoverySetSha256: release.lineage.difficultyPlanAdjustment.recoverySetSha256
	});
	rebindReleaseLineage(release);
	assert.equal(
		validateRelease(release, { expectedCount: 1 }).status,
		'passed',
		validateRelease(release, { expectedCount: 1 }).issues.join('\n')
	);

	const forgedDecision = structuredClone(release);
	forgedDecision.lineage.difficultyPlanAdjustment.acceptedDecisionCount = 0;
	rebindReleaseLineage(forgedDecision);
	assert.match(
		validateRelease(forgedDecision, { expectedCount: 1 }).issues.join('\n'),
		/release difficulty-plan adjustment bindings differ from lineage/
	);
});

test('content lineage rejects the removed multipart continuation field', () => {
	const release = makeRelease([makeEntry()]);
	release.lineage.content[0].continuation = {};
	rebindReleaseLineage(release);
	assert.match(
		validateRelease(release, { expectedCount: 1 }).issues.join('\n'),
		/lineage\.content\[0\]\.continuation is not part of the release lineage schema/
	);
});

test('content lineage accepts only structurally complete exhausted multipart salvage evidence', () => {
	const release = makeRelease([makeEntry()]);
	const shard = release.lineage.content[0];
	const salvageRoot = 'tmp/science-fixture/verification-repair-aaaaaaaaaaaa-multipart-plan-salvage';
	shard.candidatePath = `${salvageRoot}/candidate.json`;
	shard.candidateSha256 = 'd'.repeat(64);
	shard.validationPath = `${salvageRoot}/validation.json`;
	shard.validationSha256 = 'e'.repeat(64);
	shard.runSummaries = [];
	const sourceRows = Array.from({ length: 8 }, (_, index) => `biology-row-${index + 1}`);
	const sourceParts = [
		makeMultipartLineagePart(1, sourceRows.slice(0, 4), 'chatgpt-gpt-5.6-sol-2026-07-23'),
		makeMultipartLineagePart(2, sourceRows.slice(4), 'chatgpt-gpt-5.6-sol-2026-07-23')
	].map((part) => ({
		...part,
		responseMode: 'structured-json',
		transportVersion: 'science-challenge-llm-direct-json/v1',
		providerSchemaApplied: true
	}));
	const objectiveId = '1'.repeat(64);
	const executionId = '2'.repeat(64);
	shard.salvage = {
		schemaVersion: 'science-challenge-multipart-plan-salvage-evidence/v2',
		salvagePathway: 'merged-candidate-plan-difficulty',
		manifestPath: `${salvageRoot}/manifest.json`,
		manifestSha256: '3'.repeat(64),
		manifestFileSha256: '4'.repeat(64),
		candidatePath: shard.candidatePath,
		candidateSha256: shard.candidateSha256,
		candidateFileSha256: '5'.repeat(64),
		validationPath: shard.validationPath,
		validationSha256: shard.validationSha256,
		validationFileSha256: '6'.repeat(64),
		execution: {
			executionId,
			identity: {
				schemaVersion: 'science-challenge-verification-repair-execution/v2',
				planSha256: '7'.repeat(64),
				verificationSha256: '8'.repeat(64),
				priorCandidateSetSha256: '9'.repeat(64),
				objectiveId,
				model: 'chatgpt-gpt-5.6-sol',
				transport: 'llm-direct',
				responseMode: 'structured-json',
				thinkingLevel: 'max',
				directPartSize: 4,
				executionId
			},
			objectivePath: 'tmp/science-fixture/objective.json',
			objectiveSha256: 'a'.repeat(64),
			objectiveByteSha256: 'b'.repeat(64),
			claims: Array.from({ length: 4 }, (_, index) => ({
				attempt: index + 1,
				path: `tmp/science-fixture/claims/attempt-${index + 1}/claim.json`,
				sha256: String(index + 3).repeat(64),
				byteSha256: String(index + 4).repeat(64)
			}))
		},
		sourceAttempt: {
			attempt: 4,
			status: 'failed',
			runSummaryPath: 'tmp/science-fixture/attempt-04/run-summary.json',
			runSummarySha256: 'c'.repeat(64),
			runSummaryFileSha256: 'd'.repeat(64),
			validationPath: 'tmp/science-fixture/attempt-04/validation.json',
			validationSha256: 'e'.repeat(64),
			validationFileSha256: 'f'.repeat(64),
			eventLogPath: 'tmp/science-fixture/attempt-04/events.jsonl',
			eventLogSha256: '0'.repeat(64),
			lastMessagePath: 'tmp/science-fixture/attempt-04/last-message.json',
			lastMessageSha256: '1'.repeat(64),
			promptPath: 'tmp/science-fixture/prompt-attempt-4.txt',
			promptSha256: '2'.repeat(64),
			candidatePath: 'tmp/science-fixture/attempt-04/candidate.json',
			candidateSha256: '3'.repeat(64),
			candidateFileSha256: '4'.repeat(64),
			parts: sourceParts,
			responseMode: 'structured-json',
			providerSchemaApplied: true
		},
		repairEvidence: {
			verificationSummaryPath: 'tmp/science-fixture/verification-summary.json',
			verificationSummarySha256: '5'.repeat(64),
			verificationSummaryFileSha256: '6'.repeat(64),
			priorCandidatePath: 'tmp/science-fixture/prior-candidate.json',
			priorCandidateSha256: '7'.repeat(64),
			priorCandidateFileSha256: '8'.repeat(64),
			priorValidationPath: 'tmp/science-fixture/prior-validation.json',
			priorValidationSha256: '9'.repeat(64),
			priorValidationFileSha256: 'a'.repeat(64)
		},
		corrections: [
			{
				kind: 'definition.difficulty',
				path: 'challenges[0].definition.difficulty',
				absoluteRowIndex: 0,
				from: 'starter',
				to: 'standard',
				sourceChallengeSha256: 'b'.repeat(64),
				recoveredChallengeSha256: 'c'.repeat(64)
			}
		],
		salvageSourceSha256: 'd'.repeat(64)
	};
	const eligibleSource = {
		attempt: 4,
		runSummarySha256: shard.salvage.sourceAttempt.runSummarySha256,
		sourceValidationSha256: shard.salvage.sourceAttempt.validationSha256,
		sourceCandidateSha256: shard.salvage.sourceAttempt.candidateSha256,
		salvagePathway: shard.salvage.salvagePathway,
		salvageSourceSha256: shard.salvage.salvageSourceSha256,
		correctionsSha256: canonicalHash(shard.salvage.corrections),
		recoveredCandidateSha256: shard.salvage.candidateSha256,
		deterministicValidationSha256: 'e'.repeat(64),
		repairValidationSha256: 'f'.repeat(64)
	};
	shard.salvage.sourceSelection = {
		schemaVersion: 'science-challenge-multipart-plan-salvage-source-selection/v1',
		policy: 'sole-helper-approved-source',
		eligibleSources: [eligibleSource],
		eligibleSourcesSha256: canonicalHash([eligibleSource]),
		selectedAttempt: 4,
		selectedCandidateSha256: shard.salvage.candidateSha256,
		approval: null
	};
	shard.salvage.sourceSelectionSha256 = canonicalHash(shard.salvage.sourceSelection);
	rebindReleaseLineage(release);
	assert.equal(
		validateRelease(release, { expectedCount: 1 }).status,
		'passed',
		validateRelease(release, { expectedCount: 1 }).issues.join('\n')
	);

	const failedMerge = structuredClone(release);
	const failedMergeSalvage = failedMerge.lineage.content[0].salvage;
	failedMergeSalvage.salvagePathway = 'failed-merge-id-and-difficulty';
	failedMergeSalvage.sourceAttempt.candidatePath = null;
	failedMergeSalvage.sourceAttempt.candidateSha256 = null;
	failedMergeSalvage.sourceAttempt.candidateFileSha256 = null;
	failedMergeSalvage.corrections = [
		{
			kind: 'definition.id',
			path: 'challenges[0].definition.id',
			partId: 'part-01',
			rowIndex: 1,
			absoluteRowIndex: 0,
			from: 'biology-cell-transportt-01',
			to: 'biology-cell-transport-01',
			editDistance: 1,
			sourceChallengeSha256: 'b'.repeat(64)
		},
		{
			kind: 'definition.difficulty',
			path: 'challenges[1].definition.difficulty',
			partId: 'part-01',
			rowIndex: 2,
			absoluteRowIndex: 1,
			from: 'starter',
			to: 'standard',
			sourceChallengeSha256: 'c'.repeat(64)
		}
	];
	rebindMultipartSalvageSourceSelection(failedMergeSalvage);
	rebindReleaseLineage(failedMerge);
	assert.equal(
		validateRelease(failedMerge, { expectedCount: 1 }).status,
		'passed',
		validateRelease(failedMerge, { expectedCount: 1 }).issues.join('\n')
	);

	const removedPathway = structuredClone(release);
	removedPathway.lineage.content[0].salvage.salvagePathway =
		'raw-question-presentation-null-default';
	rebindReleaseLineage(removedPathway);
	assert.match(
		validateRelease(removedPathway, { expectedCount: 1 }).issues.join('\n'),
		/invalid exhausted multipart plan salvage provenance/
	);

	const explicitSelection = structuredClone(release);
	const explicitShard = explicitSelection.lineage.content[0];
	const explicitSalvage = explicitShard.salvage;
	const selectedSource = explicitSalvage.sourceSelection.eligibleSources[0];
	const competingSource = {
		...selectedSource,
		attempt: 3,
		runSummarySha256: '0'.repeat(64),
		sourceValidationSha256: '1'.repeat(64),
		sourceCandidateSha256: null,
		salvageSourceSha256: '2'.repeat(64),
		correctionsSha256: '3'.repeat(64),
		recoveredCandidateSha256: '4'.repeat(64),
		deterministicValidationSha256: '5'.repeat(64),
		repairValidationSha256: '6'.repeat(64)
	};
	const eligibleSources = [competingSource, selectedSource];
	explicitSalvage.sourceSelection = {
		schemaVersion: 'science-challenge-multipart-plan-salvage-source-selection/v1',
		policy: 'explicit-terminal-attempt-for-fresh-full-cohort-verification',
		eligibleSources,
		eligibleSourcesSha256: canonicalHash(eligibleSources),
		selectedAttempt: 4,
		selectedCandidateSha256: explicitSalvage.candidateSha256,
		approval: {
			schemaVersion: 'science-challenge-multipart-plan-salvage-source-approval/v1',
			decision: 'select-terminal-attempt-for-fresh-full-cohort-verification',
			shardId: explicitShard.shardId,
			repairSha256: explicitSalvage.execution.identity.verificationSha256,
			objectiveId: explicitSalvage.execution.identity.objectiveId,
			executionId: explicitSalvage.execution.identity.executionId,
			eligibleSourcesSha256: canonicalHash(eligibleSources),
			selectedAttempt: 4,
			selectedCandidateSha256: explicitSalvage.candidateSha256
		}
	};
	explicitSalvage.sourceSelectionSha256 = canonicalHash(explicitSalvage.sourceSelection);
	rebindReleaseLineage(explicitSelection);
	assert.equal(
		validateRelease(explicitSelection, { expectedCount: 1 }).status,
		'passed',
		validateRelease(explicitSelection, { expectedCount: 1 }).issues.join('\n')
	);

	for (const mutate of [
		(value) => {
			value.lineage.content[0].salvage.execution.claims.pop();
		},
		(value) => {
			value.lineage.content[0].salvage.candidateSha256 = 'f'.repeat(64);
		},
		(value) => {
			value.lineage.content[0].salvage.corrections[0].kind = 'definition.title';
		},
		(value) => {
			value.lineage.content[0].salvage.sourceSelection.selectedAttempt = 3;
		},
		(value) => {
			value.lineage.content[0].salvage.sourceAttempt.attempt = 3;
		},
		(value) => {
			value.lineage.content[0].salvage.sourceSelection.eligibleSources[0].runSummarySha256 =
				'a'.repeat(64);
			value.lineage.content[0].salvage.sourceSelection.eligibleSourcesSha256 = canonicalHash(
				value.lineage.content[0].salvage.sourceSelection.eligibleSources
			);
			value.lineage.content[0].salvage.sourceSelectionSha256 = canonicalHash(
				value.lineage.content[0].salvage.sourceSelection
			);
		}
	]) {
		const tampered = structuredClone(release);
		mutate(tampered);
		rebindReleaseLineage(tampered);
		const issues = validateRelease(tampered, { expectedCount: 1 }).issues.join('\n');
		assert.match(issues, /invalid exhausted multipart plan salvage provenance/);
		assert.match(issues, /no run bound to its accepted candidate/);
	}
});

test('content lineage accepts direct JSON evidence and rejects incomplete or mismatched transport provenance', () => {
	const release = makeRelease([makeEntry()]);
	const run = release.lineage.content[0].runSummaries[0];
	Object.assign(run, {
		transport: 'llm-direct',
		responseMode: 'structured-json',
		providerSchemaApplied: true,
		transportVersion: 'science-challenge-llm-direct-json/v1',
		provider: 'chatgpt',
		model: 'chatgpt-gpt-5.6-sol',
		modelVersion: 'chatgpt-gpt-5.6-sol-2026-07-23',
		requestPath: 'tmp/science-fixture/attempt-01/request.json',
		requestSha256: 'a'.repeat(64),
		thoughtsPath: 'tmp/science-fixture/attempt-01/thoughts.txt',
		thoughtsSha256: 'b'.repeat(64),
		resultMetadataPath: 'tmp/science-fixture/attempt-01/result-metadata.json',
		resultMetadataSha256: 'c'.repeat(64)
	});
	rebindReleaseLineage(release);
	assert.equal(validateRelease(release, { expectedCount: 1 }).status, 'passed');

	for (const [field, value] of [
		['provider', 'openai'],
		['model', 'gpt-5.6-sol'],
		['thinkingLevel', 'high'],
		['transportVersion', 'science-challenge-llm-direct-json/v0'],
		['requestSha256', null],
		['thoughtsPath', null],
		['resultMetadataSha256', 'not-a-hash']
	]) {
		const tampered = structuredClone(release);
		tampered.lineage.content[0].runSummaries[0][field] = value;
		rebindReleaseLineage(tampered);
		assert.match(
			validateRelease(tampered, { expectedCount: 1 }).issues.join('\n'),
			/invalid authoring run provenance/,
			field
		);
	}
});

test('content lineage accepts prompt JSON only for its exact response mode and transport version', () => {
	const release = makeRelease([makeEntry()]);
	const run = release.lineage.content[0].runSummaries[0];
	Object.assign(run, {
		transport: 'llm-direct',
		responseMode: 'prompt-json',
		providerSchemaApplied: false,
		transportVersion: 'science-challenge-llm-direct-prompt-json/v1',
		provider: 'chatgpt',
		model: 'chatgpt-gpt-5.6-sol',
		modelVersion: 'chatgpt-gpt-5.6-sol-2026-07-23',
		requestPath: 'tmp/science-fixture/attempt-01/request.json',
		requestSha256: 'a'.repeat(64),
		thoughtsPath: 'tmp/science-fixture/attempt-01/thoughts.txt',
		thoughtsSha256: 'b'.repeat(64),
		resultMetadataPath: 'tmp/science-fixture/attempt-01/result-metadata.json',
		resultMetadataSha256: 'c'.repeat(64)
	});
	rebindReleaseLineage(release);
	assert.equal(
		validateRelease(release, { expectedCount: 1 }).status,
		'passed',
		validateRelease(release, { expectedCount: 1 }).issues.join('\n')
	);
	const high = structuredClone(release);
	high.lineage.content[0].runSummaries[0].thinkingLevel = 'high';
	rebindReleaseLineage(high);
	assert.equal(
		validateRelease(high, { expectedCount: 1 }).status,
		'passed',
		validateRelease(high, { expectedCount: 1 }).issues.join('\n')
	);

	for (const [field, value] of [
		['responseMode', 'structured-json'],
		['responseMode', null],
		['transportVersion', 'science-challenge-llm-direct-json/v1'],
		['transportVersion', 'science-challenge-llm-direct-prompt-json/v2'],
		['thinkingLevel', 'xhigh'],
		['thinkingLevel', 'medium'],
		['thinkingLevel', 'low']
	]) {
		const relabeled = structuredClone(release);
		relabeled.lineage.content[0].runSummaries[0][field] = value;
		rebindReleaseLineage(relabeled);
		assert.match(
			validateRelease(relabeled, { expectedCount: 1 }).issues.join('\n'),
			/invalid authoring run provenance/,
			`${field}=${value}`
		);
	}
});

test('content lineage accepts only complete ordered multipart direct evidence', () => {
	const release = makeRelease([makeEntry()]);
	const run = release.lineage.content[0].runSummaries[0];
	const rowIds = Array.from({ length: 8 }, (_, index) => `biology-row-${index + 1}`);
	const modelVersion = 'chatgpt-gpt-5.6-sol-2026-07-23';
	Object.assign(run, {
		transport: 'llm-direct',
		responseMode: 'structured-json',
		providerSchemaApplied: true,
		transportVersion: 'science-challenge-llm-direct-json-multipart/v1',
		provider: 'chatgpt',
		model: 'chatgpt-gpt-5.6-sol',
		modelVersion: null,
		modelVersions: [modelVersion],
		directPartSize: 4,
		rowIds,
		usage: { promptTokens: 80, responseTokens: 40 },
		requestPath: null,
		requestSha256: null,
		thoughtsPath: null,
		thoughtsSha256: null,
		resultMetadataPath: null,
		resultMetadataSha256: null,
		parts: [
			makeMultipartLineagePart(1, rowIds.slice(0, 4), modelVersion),
			makeMultipartLineagePart(2, rowIds.slice(4), modelVersion)
		]
	});
	rebindReleaseLineage(release);
	assert.equal(
		validateRelease(release, { expectedCount: 1 }).status,
		'passed',
		validateRelease(release, { expectedCount: 1 }).issues.join('\n')
	);

	for (const mutate of [
		(value) => value.lineage.content[0].runSummaries[0].parts.reverse(),
		(value) => value.lineage.content[0].runSummaries[0].parts.pop(),
		(value) => {
			value.lineage.content[0].runSummaries[0].parts[0].promptPath =
				'tmp/science-fixture/attempt-01/parts/part-02/prompt.txt';
		},
		(value) => {
			value.lineage.content[0].runSummaries[0].transportVersion =
				'science-challenge-llm-direct-json-multipart/v2';
		},
		(value) => {
			const run = value.lineage.content[0].runSummaries[0];
			run.thinkingLevel = 'high';
			for (const part of run.parts) part.thinkingLevel = 'high';
		}
	]) {
		const tampered = structuredClone(release);
		mutate(tampered);
		rebindReleaseLineage(tampered);
		assert.match(
			validateRelease(tampered, { expectedCount: 1 }).issues.join('\n'),
			/invalid authoring run provenance|invalid or reordered multipart evidence/
		);
	}
});

test('prompt JSON multipart lineage requires an exact root and child mode/version tuple', () => {
	const release = makeRelease([makeEntry()]);
	const run = release.lineage.content[0].runSummaries[0];
	const rowIds = Array.from({ length: 8 }, (_, index) => `biology-row-${index + 1}`);
	const modelVersion = 'chatgpt-gpt-5.6-sol-2026-07-23';
	const parts = [
		makeMultipartLineagePart(1, rowIds.slice(0, 4), modelVersion),
		makeMultipartLineagePart(2, rowIds.slice(4), modelVersion)
	].map((part) => ({
		...part,
		responseMode: 'prompt-json',
		transportVersion: 'science-challenge-llm-direct-prompt-json/v1',
		providerSchemaApplied: false
	}));
	Object.assign(run, {
		transport: 'llm-direct',
		responseMode: 'prompt-json',
		providerSchemaApplied: false,
		transportVersion: 'science-challenge-llm-direct-prompt-json-multipart/v1',
		provider: 'chatgpt',
		model: 'chatgpt-gpt-5.6-sol',
		modelVersion: null,
		modelVersions: [modelVersion],
		directPartSize: 4,
		rowIds,
		usage: { promptTokens: 80, responseTokens: 40 },
		requestPath: null,
		requestSha256: null,
		thoughtsPath: null,
		thoughtsSha256: null,
		resultMetadataPath: null,
		resultMetadataSha256: null,
		parts
	});
	rebindReleaseLineage(release);
	assert.equal(
		validateRelease(release, { expectedCount: 1 }).status,
		'passed',
		validateRelease(release, { expectedCount: 1 }).issues.join('\n')
	);
	const high = structuredClone(release);
	const highRun = high.lineage.content[0].runSummaries[0];
	highRun.thinkingLevel = 'high';
	for (const part of highRun.parts) part.thinkingLevel = 'high';
	rebindReleaseLineage(high);
	assert.equal(
		validateRelease(high, { expectedCount: 1 }).status,
		'passed',
		validateRelease(high, { expectedCount: 1 }).issues.join('\n')
	);

	for (const mutate of [
		(value) => {
			value.lineage.content[0].runSummaries[0].responseMode = 'structured-json';
		},
		(value) => {
			value.lineage.content[0].runSummaries[0].transportVersion =
				'science-challenge-llm-direct-json-multipart/v1';
		},
		(value) => {
			value.lineage.content[0].runSummaries[0].parts[0].responseMode = 'structured-json';
		},
		(value) => {
			value.lineage.content[0].runSummaries[0].parts[0].transportVersion =
				'science-challenge-llm-direct-json/v1';
		},
		(value) => {
			value.lineage.content[0].runSummaries[0].thinkingLevel = 'high';
		},
		(value) => {
			const run = value.lineage.content[0].runSummaries[0];
			run.thinkingLevel = 'xhigh';
			for (const part of run.parts) part.thinkingLevel = 'xhigh';
		},
		(value) => {
			const run = value.lineage.content[0].runSummaries[0];
			run.thinkingLevel = 'medium';
			for (const part of run.parts) part.thinkingLevel = 'medium';
		},
		(value) => {
			const run = value.lineage.content[0].runSummaries[0];
			run.thinkingLevel = 'low';
			for (const part of run.parts) part.thinkingLevel = 'low';
		}
	]) {
		const relabeled = structuredClone(release);
		mutate(relabeled);
		rebindReleaseLineage(relabeled);
		assert.match(
			validateRelease(relabeled, { expectedCount: 1 }).issues.join('\n'),
			/invalid authoring run provenance|invalid or reordered multipart evidence/
		);
	}
});

test('accepted art lineage requires prompts, masters and normalized output evidence', () => {
	const release = makeRelease([makeEntry()], 'accepted');
	release.lineage.art = Array.from({ length: 2 }, (_, index) => makeArtLineageItem(index));
	release.release.lineageSha256 = canonicalHash(release.lineage);
	release.release.artGenerationLineageSha256 = canonicalHash(release.lineage.art);
	assert.equal(validateRelease(release, { expectedCount: 1 }).status, 'passed');

	delete release.lineage.art[0].matchingJobs[0].generationArtifacts.darkPrompt;
	release.release.lineageSha256 = canonicalHash(release.lineage);
	release.release.artGenerationLineageSha256 = canonicalHash(release.lineage.art);
	assert.match(
		validateRelease(release, { expectedCount: 1 }).issues.join('\n'),
		/invalid image-generation job provenance/
	);
});

test('shared independent-review hard gates reject hand-edited acceptance flags', () => {
	const contentReview = {
		id: 'biology-cell-transport-01',
		accepted: true,
		curriculumGrounded: true,
		paperCalibrated: true,
		scientificallyCorrect: true,
		contextsDistinct: true,
		selfContained: true,
		flowCoherent: true,
		choicesFair: true,
		difficultyCalibrated: true,
		learnerCopyClean: true,
		artBriefsSafe: true,
		heroTeaserSafe: true,
		checkedCalculations: [],
		issues: []
	};
	assert.equal(validateIndependentContentReviewRow(contentReview).status, 'passed');
	contentReview.scientificallyCorrect = false;
	assert.match(
		validateIndependentContentReviewRow(contentReview).issues.join('\n'),
		/accepted violates/
	);

	const artReview = {
		id: 'biology-cell-transport-01-opening',
		accepted: true,
		disposition: 'accept',
		score: 18,
		scientificallyAccurate: true,
		exactlyRelevant: true,
		briefConsistentWithQuestion: true,
		visibleNotationMatchesQuestion: true,
		answerNeutral: true,
		textClean: true,
		themeConsistent: true,
		visuallyPolished: true,
		mobileSafe: true,
		accessibleAlt: true,
		visibleTakeaway: 'A root hair cell and solution are visible.',
		issues: []
	};
	assert.equal(validateIndependentArtReviewRow(artReview).status, 'passed');
	artReview.disposition = 'retain-with-annotation';
	artReview.issues = [
		{
			category: 'quality',
			severity: 'minor',
			description: 'A nonessential shadow edge is slightly uneven.',
			annotation: 'Retained: minor uneven shadow on a nonessential background edge.',
			regenerationInstruction: ''
		}
	];
	assert.equal(validateIndependentArtReviewRow(artReview).status, 'passed');
	artReview.disposition = 'accept';
	assert.match(
		validateIndependentArtReviewRow(artReview).issues.join('\n'),
		/disposition violates/
	);
	artReview.disposition = 'retain-with-annotation';
	artReview.issues = [];
	artReview.score = 17;
	assert.match(validateIndependentArtReviewRow(artReview).issues.join('\n'), /accepted violates/);
});

test('question-authority validation rejects a conventional allele substitution', () => {
	const art = {
		schemaVersion: SCIENCE_QUESTION_ART_SCHEMA,
		id: 'biology-recessive-inheritance-opening',
		context: 'opening',
		scene: 'A Punnett square for Aa × Aa with four genotype outcomes.',
		visualAnchor: 'A four-cell genetic cross.',
		altText: 'A Punnett square for Aa × Aa.',
		approvedMeaning: 'A heterozygous genetic cross is visible.',
		accuracyConstraints: ['Use the exact parental genotypes.', 'Show four distinct outcomes.'],
		forbiddenDetails: ['No probability label.', 'No phenotype caption.']
	};
	const issues = [];
	validateQuestionArt(
		art,
		'opening',
		{
			id: 'biology-recessive-inheritance',
			previewQuestion:
				'A recessive condition uses allele r. Two heterozygous parents, Rr and Rr, have a child.'
		},
		issues
	);
	assert.match(issues.join('\n'), /introduces allele\/genotype symbol A\/a/);
});

test('question-authority validation does not let an embedded art question override current learner copy', () => {
	const art = {
		schemaVersion: SCIENCE_QUESTION_ART_SCHEMA,
		id: 'biology-recessive-inheritance-opening',
		context: 'opening',
		question: 'Two heterozygous parents, Aa and Aa, have a child.',
		scene: 'A blank four-cell genetic cross.',
		visualAnchor: 'A blank Punnett square.',
		altText: 'A blank Punnett square.',
		approvedMeaning: 'A blank Aa × Aa genetic cross is ready to complete.',
		accuracyConstraints: ['Use the exact parental genotypes.', 'Leave every outcome blank.'],
		forbiddenDetails: ['No probability label.', 'No phenotype caption.']
	};
	const issues = validateQuestionArt(
		art,
		'opening',
		{
			id: 'biology-recessive-inheritance',
			previewQuestion:
				'A recessive condition uses allele r. Two heterozygous parents, Rr and Rr, have a child.'
		},
		[]
	);
	assert.match(
		issues.join('\n'),
		/question must match the current learner-facing opening question/
	);
	assert.match(issues.join('\n'), /introduces allele\/genotype symbol A\/a/);
});

function makePlan(rows) {
	return {
		schemaVersion: SCIENCE_CHALLENGE_PLAN_SCHEMA,
		planId: 'science-fixture-v1',
		createdOn: '2026-07-21',
		baseCatalogContentSha256: 'f'.repeat(64),
		baseCatalogRecordCount: 1,
		rows
	};
}

function makePlanRow() {
	return {
		id: 'biology-cell-transport-01',
		subject: 'biology',
		specificationId: 'aqa-gcse-biology-8461-v1-0',
		specificationSha256: SPECIFICATION_HASH,
		chapterId: 'biology-chapter-cell-biology',
		chapterCode: '4.1',
		chapterTitle: 'Cell biology',
		curriculumComponentId: 'biology-topic-cell-transport',
		calibrationQuestionId: 'paper-question-001',
		calibrationQuestionSha256: SOURCE_HASH,
		difficulty: 'standard',
		taskShape: 'explanation',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		shard: 'science-001'
	};
}

function makeEntry(index = 1) {
	const id = `biology-cell-transport-${String(index).padStart(2, '0')}`;
	const suffix = index === 1 ? 'root hair cells' : `root hair cell sample ${index}`;
	return {
		definition: {
			id,
			slug: `why-water-enters-${suffix.replaceAll(' ', '-')}`,
			subject: 'biology',
			subjectArtTheme: 'cells-practical',
			title: `Why does water enter ${suffix}?`,
			topic: 'Cell transport',
			hook: 'Concentration alone does not explain which way water moves.',
			arc: 'connect-cause-to-effect',
			mechanic: 'missing-link',
			difficulty: 'standard',
			marks: 3,
			estimatedMinutes: 4,
			previewQuestion: `Explain why water enters ${suffix} when the surrounding soil solution is dilute.`,
			metaDescription:
				'Practise a calibrated GCSE Biology challenge about cell transport, compare pupil reasoning, improve one weak answer, and apply it again.',
			sourceQuestionId: 'paper-question-001',
			lastReviewed: '2026-07-21',
			version: 1,
			staticAnswers: {
				a: 'Water enters because the soil has more water molecules than the cell.',
				b: 'Water enters by osmosis down a water potential gradient through the membrane.'
			},
			strongerAnswer: 'b',
			weakAnswer: 'a',
			weakAnswerKind: 'incomplete',
			showdownExplanation:
				'The stronger answer names osmosis, the gradient and the partially permeable membrane.',
			commandWordLesson: 'Explain means connect the direction of movement to the mechanism.',
			diagnosisPrompt: 'Which scientific link is missing from the weaker answer?',
			diagnosisChoices: makeChoices('osmosis through the membrane'),
			repairPrompt: 'Which phrase repairs the weaker answer most precisely?',
			repairChoices: makeChoices('down a water potential gradient'),
			freeTextKeywordGroups: [
				['osmosis'],
				['water potential', 'gradient'],
				['partially permeable', 'membrane']
			],
			repairSuccess: 'The repaired answer now names the mechanism and explains its direction.',
			transferPromptLead: `A potato cylinder gains mass in a dilute solution. Explain the movement of water into potato cells for sample ${index}.`,
			transferChoices: makeChoices('osmosis into the cells'),
			transferExplanation:
				'Water enters by osmosis from higher to lower water potential through cell membranes.',
			memoryHandle: 'Name the process → compare potentials → state direction → name the membrane'
		},
		grounding: {
			curriculumComponentId: 'biology-topic-cell-transport',
			specificationId: 'aqa-gcse-biology-8461-v1-0',
			specificationSha256: SPECIFICATION_HASH,
			calibrationQuestionId: 'paper-question-001',
			calibrationQuestionSha256: SOURCE_HASH
		},
		art: {
			opening: makeArt(id, 'opening', `Root hair cell setup ${index}`),
			transfer: makeArt(id, 'transfer', `Potato cylinder setup ${index}`)
		}
	};
}

function makeChoices(correctText) {
	return [
		{
			id: 'surface-area',
			text: 'It has more surface area',
			feedback: 'This does not name the transport mechanism.',
			correct: false
		},
		{
			id: 'water-potential',
			text: correctText,
			feedback: 'This states the decisive scientific link.',
			correct: true
		},
		{
			id: 'active-transport',
			text: 'It uses active transport',
			feedback: 'Water does not move by active transport.',
			correct: false
		}
	];
}

function makeArtLeakDefinition(prompt, correct, wrong) {
	return {
		id: 'biology-answer-neutrality-01',
		transferPromptLead: prompt,
		transferChoices: [
			{ id: 'correct', text: correct, feedback: 'Correct.', correct: true },
			{ id: 'wrong-a', text: wrong[0], feedback: 'Try again.', correct: false },
			{ id: 'wrong-b', text: wrong[1], feedback: 'Try again.', correct: false }
		]
	};
}

function contextFixture(id, curriculumComponentId, previewQuestion, transferPromptLead) {
	return {
		definition: {
			id,
			title: `How does ${id} work?`,
			previewQuestion,
			transferPromptLead
		},
		grounding: { curriculumComponentId }
	};
}

function makeArt(challengeId, context, scene) {
	return {
		schemaVersion: SCIENCE_QUESTION_ART_SCHEMA,
		id: `${challengeId}-${context}`,
		context,
		scene,
		visualAnchor: `${scene} with one central biological specimen`,
		altText: `${scene} arranged as a text-free biological still life.`,
		approvedMeaning: 'The starting biological situation is visible without showing the outcome.',
		accuracyConstraints: [
			'Show intact biological material.',
			'Keep all apparatus scientifically plausible.'
		],
		forbiddenDetails: ['Do not show the final result.', 'Do not add labels or equations.']
	};
}

function makeArtLineageItem(index) {
	const id = `biology-context-${String(index).padStart(4, '0')}`;
	const artifact = (name) => ({
		path: `tmp/science-fixture/art/${id}/${name}`,
		sha256: '7'.repeat(64),
		size: 42
	});
	return {
		id,
		specSha256: '4'.repeat(64),
		outputs: {
			dark: { path: `${id}-dark.webp`, sha256: '5'.repeat(64), width: 960, height: 540 },
			light: { path: `${id}-light.webp`, sha256: '6'.repeat(64), width: 960, height: 540 }
		},
		matchingJobs: [
			{
				path: `tmp/science-fixture/art/${id}/job.json`,
				sha256: '8'.repeat(64),
				imageModel: 'chatgpt-gpt-image-2',
				attempt: 1,
				repairReviewSha256: null,
				repairPerceptualAuditSha256: null,
				repairEvidencePath: null,
				finishedAt: '2026-07-21T00:00:00.000Z',
				generationArtifacts: {
					spec: artifact('spec.json'),
					darkPrompt: artifact('dark-prompt.txt'),
					lightPrompt: artifact('light-prompt.txt'),
					darkMaster: artifact('dark-master.webp'),
					lightMaster: artifact('light-master.webp'),
					darkNormalized: artifact('dark.webp'),
					lightNormalized: artifact('light.webp')
				}
			}
		]
	};
}

function makeMultipartLineagePart(index, rowIds, modelVersion) {
	const partId = `part-${String(index).padStart(2, '0')}`;
	const root = `tmp/science-fixture/attempt-01/parts/${partId}`;
	const hash = (offset) => String((index + offset) % 10).repeat(64);
	return {
		partId,
		index,
		start: (index - 1) * 4,
		end: index * 4,
		rowIds,
		inputSha256: hash(0),
		responseSchemaSha256: hash(1),
		promptPath: `${root}/prompt.txt`,
		promptSha256: hash(2),
		requestPath: `${root}/request.json`,
		requestSha256: hash(3),
		eventLogPath: `${root}/events.jsonl`,
		eventLogSha256: hash(4),
		rawOutputPath: `${root}/last-message.json`,
		rawOutputSha256: hash(5),
		rawCandidateSha256: hash(6),
		thoughtsPath: `${root}/thoughts.txt`,
		thoughtsSha256: hash(7),
		resultMetadataPath: `${root}/result-metadata.json`,
		resultMetadataSha256: hash(8),
		runSummaryPath: `${root}/run-summary.json`,
		runSummarySha256: hash(9),
		status: 'passed',
		responseMode: 'structured-json',
		transportVersion: 'science-challenge-llm-direct-json/v1',
		providerSchemaApplied: true,
		provider: 'chatgpt',
		model: 'chatgpt-gpt-5.6-sol',
		modelVersion,
		thinkingLevel: 'max',
		usage: { promptTokens: 40, responseTokens: 20 },
		costUsd: 0.01
	};
}

function rebindMultipartSalvageSourceSelection(salvage) {
	const previous = salvage.sourceSelection?.eligibleSources?.[0];
	const eligibleSource = {
		attempt: salvage.sourceAttempt.attempt,
		runSummarySha256: salvage.sourceAttempt.runSummarySha256,
		sourceValidationSha256: salvage.sourceAttempt.validationSha256,
		sourceCandidateSha256: salvage.sourceAttempt.candidateSha256,
		salvagePathway: salvage.salvagePathway,
		salvageSourceSha256: salvage.salvageSourceSha256,
		correctionsSha256: canonicalHash(salvage.corrections),
		recoveredCandidateSha256: salvage.candidateSha256,
		deterministicValidationSha256: previous?.deterministicValidationSha256 ?? 'e'.repeat(64),
		repairValidationSha256: previous?.repairValidationSha256 ?? 'f'.repeat(64)
	};
	salvage.sourceSelection = {
		schemaVersion: 'science-challenge-multipart-plan-salvage-source-selection/v1',
		policy: 'sole-helper-approved-source',
		eligibleSources: [eligibleSource],
		eligibleSourcesSha256: canonicalHash([eligibleSource]),
		selectedAttempt: eligibleSource.attempt,
		selectedCandidateSha256: salvage.candidateSha256,
		approval: null
	};
	salvage.sourceSelectionSha256 = canonicalHash(salvage.sourceSelection);
}

function bindCandidateEffectiveCohort(
	release,
	{
		basePlanSha256,
		effectivePlanSha256,
		remapManifestSetSha256,
		difficultyAdjustmentCount,
		difficultyAdjustmentManifestSetSha256,
		recoverySetSha256
	}
) {
	release.lineage.effectiveCohort = {
		manifestSha256: '3'.repeat(64),
		basePlanSha256,
		effectivePlanSha256,
		candidateSetSha256: '4'.repeat(64),
		candidateCount: release.challenges.length,
		remapManifestSetSha256,
		difficultyAdjustmentCount,
		difficultyAdjustmentManifestSetSha256,
		recoverySetSha256
	};
	Object.assign(release.release, {
		basePlanSha256,
		effectivePlanSha256,
		effectiveCohortManifestSha256: release.lineage.effectiveCohort.manifestSha256,
		effectiveCohortCandidateSetSha256: release.lineage.effectiveCohort.candidateSetSha256,
		recoverySetSha256
	});
}

function makeReviewRebaseParentChain() {
	return {
		kind: 'review-rebase-successor',
		reviewRebaseManifestSha256: '0'.repeat(64),
		reviewRebaseId: '1'.repeat(64),
		parentVerificationSha256: '2'.repeat(64),
		parentRepairSha256: '3'.repeat(64),
		reviewRebasePlanSha256: '4'.repeat(64),
		reviewRebaseCandidateSetSha256: '5'.repeat(64),
		reviewRebaseCollectionValidationSha256: '6'.repeat(64),
		reviewRebaseCollectionRemediationSetSha256: '7'.repeat(64),
		reviewRebaseCollectionRemediationTargetSetSha256: '8'.repeat(64),
		firstVerificationSha256: '9'.repeat(64),
		mutableTargetSetSha256: 'a'.repeat(64),
		successorObjectiveId: 'b'.repeat(64),
		successorExecutionId: 'c'.repeat(64)
	};
}

function bindReviewRebaseLineage(release, { includeSource = false } = {}) {
	bindCandidateEffectiveCohort(release, {
		basePlanSha256: 'd'.repeat(64),
		effectivePlanSha256: 'e'.repeat(64),
		remapManifestSetSha256: 'f'.repeat(64),
		difficultyAdjustmentCount: 0,
		difficultyAdjustmentManifestSetSha256: '0'.repeat(64),
		recoverySetSha256: '1'.repeat(64)
	});
	const parentChain = makeReviewRebaseParentChain();
	release.lineage.effectiveCohort.parentChain = parentChain;
	if (includeSource) {
		const shard = release.lineage.content[0];
		const sourceCandidateSha256 = '2'.repeat(64);
		const sourceValidationSha256 = '3'.repeat(64);
		shard.runSummaries = [];
		shard.reviewRebaseSource = {
			kind: 'review-rebase-selection',
			reviewRebaseManifestSha256: parentChain.reviewRebaseManifestSha256,
			reviewRebaseId: parentChain.reviewRebaseId,
			selectionSha256: '4'.repeat(64),
			sourceCandidateSha256,
			sourceValidationSha256,
			rowOverrideSetSha256: '5'.repeat(64),
			mutationSetSha256: '6'.repeat(64),
			outputCandidateSha256: shard.candidateSha256,
			outputValidationSha256: shard.validationSha256,
			parentVerificationSha256: parentChain.parentVerificationSha256,
			parentRepairSha256: parentChain.parentRepairSha256,
			shardId: shard.shardId,
			sourceValidations: [
				{
					challengeId: null,
					candidatePath: 'tmp/science-fixture/review-rebase/source-candidate.json',
					candidateSha256: sourceCandidateSha256,
					validationPath: 'tmp/science-fixture/review-rebase/source-validation.json',
					validationSha256: sourceValidationSha256,
					thinkingLevel: 'high'
				}
			]
		};
	}
	rebindReleaseLineage(release);
	return parentChain;
}

function makeRelease(challenges, status = 'candidate') {
	const coverage = {
		schemaVersion: 'science-challenge-coverage/v2',
		existingRounds: 1,
		generatedRounds: challenges.length,
		generatedQuestionContexts: challenges.length * 2,
		finalRounds: challenges.length + 1,
		finalQuestionContexts: (challenges.length + 1) * 2,
		dimensions: Object.fromEntries(
			[
				'subject',
				'chapterId',
				'curriculumComponentId',
				'difficulty',
				'taskShape',
				'arc',
				'mechanic'
			].map((dimension) => [dimension, { fixture: challenges.length }])
		)
	};
	const lineage = {
		schemaVersion: 'science-challenge-release-lineage/v1',
		content: [
			{
				shardId: 'science-fixture-001',
				candidatePath: 'tmp/science-fixture/candidate.json',
				candidateSha256: '5'.repeat(64),
				validationPath: 'tmp/science-fixture/validation.json',
				validationSha256: '6'.repeat(64),
				runSummaries: [
						{
							kind: 'generation',
							transport: 'codex-sdk',
						attempt: 1,
						path: 'tmp/science-fixture/attempt-01/run-summary.json',
						sha256: '7'.repeat(64),
						eventLogPath: 'tmp/science-fixture/attempt-01/events.jsonl',
						eventLogSha256: '2'.repeat(64),
						lastMessagePath: 'tmp/science-fixture/attempt-01/last-message.json',
						lastMessageSha256: '1'.repeat(64),
						promptPath: 'tmp/science-fixture/prompt-attempt-1.txt',
						promptSha256: '3'.repeat(64),
						candidatePath: 'tmp/science-fixture/attempt-01/candidate.json',
						candidateSha256: '5'.repeat(64),
						validationPath: 'tmp/science-fixture/attempt-01/validation.json',
						validationSha256: '6'.repeat(64),
						validationStatus: 'passed',
						inputSha256: '4'.repeat(64),
						rawCandidateSha256: '9'.repeat(64),
						normalizationVersion: 'science-challenge-output-normalization/v1',
						model: 'gpt-5.6-sol',
						thinkingLevel: 'max',
						status: 'passed',
						toolFree: true,
						repairEvidence: null
					}
				]
			}
		],
		art: []
	};
	return {
		schemaVersion: SCIENCE_CHALLENGE_RELEASE_SCHEMA,
		release: {
			id: 'science-fixture-v1',
			status,
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			model: 'gpt-5.6-sol',
			thinkingLevel: 'max',
			planSha256: 'a'.repeat(64),
			sourceSnapshotSha256: 'b'.repeat(64),
			curriculumEvidenceSha256: 'c'.repeat(64),
			contentVerificationSha256: status === 'accepted' ? 'd'.repeat(64) : null,
			artManifestSha256: 'e'.repeat(64),
			artReviewSha256: status === 'accepted' ? 'f'.repeat(64) : null,
			artPerceptualAuditSha256: status === 'accepted' ? '9'.repeat(64) : null,
			artDeliveryManifestSha256: status === 'accepted' ? '0'.repeat(64) : null,
			runtimeSha256: status === 'accepted' ? '6'.repeat(64) : null,
			shortRecallBundleSha256: status === 'accepted' ? '4'.repeat(64) : null,
			shortRecallReviewSha256: status === 'accepted' ? '5'.repeat(64) : null,
			verifierDispatchLedgerSha256: status === 'accepted' ? '8'.repeat(64) : null,
			coverageSha256: canonicalHash(coverage),
			lineageSha256: canonicalHash(lineage),
			contentGenerationLineageSha256: canonicalHash(lineage.content),
			artGenerationLineageSha256: status === 'accepted' ? canonicalHash(lineage.art) : null,
			provenanceArchiveSha256: status === 'accepted' ? '7'.repeat(64) : null,
			materializedAt: '2026-07-21T00:00:00.000Z'
		},
		coverage,
		lineage,
		challenges
	};
}

function rebindReleaseLineage(release) {
	release.release.lineageSha256 = canonicalHash(release.lineage);
	release.release.contentGenerationLineageSha256 = canonicalHash(release.lineage.content);
}

function makeArtManifest(entry) {
	return {
		schemaVersion: SCIENCE_QUESTION_ART_MANIFEST_SCHEMA,
		releaseId: 'science-fixture-v1',
		width: 960,
		height: 540,
		specs: ['opening', 'transfer'].map((context) => {
			const spec = entry.art[context];
			return {
				...spec,
				challengeId: entry.definition.id,
				subject: entry.definition.subject,
				question:
					context === 'opening'
						? entry.definition.previewQuestion
						: entry.definition.transferPromptLead,
				output: {
					darkPath: scienceQuestionArtLocalPath('science-fixture-v1', spec.id, 'dark'),
					lightPath: scienceQuestionArtLocalPath('science-fixture-v1', spec.id, 'light')
				}
			};
		})
	};
}
