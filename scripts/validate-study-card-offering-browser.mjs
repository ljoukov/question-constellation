#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- This operator harness validates generic browser and D1 evidence at runtime.

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
	DEV_AUTH_CLEANUP_CONFIRMATION,
	DISPOSABLE_DEV_AUTH_USER_ID,
	analyticsCleanupStatements,
	devAuthCleanupInventory,
	personalCleanupStatements
} from './cleanup-dev-auth-data.mjs';
import { d1Batch, d1Rows, loadD1Env } from './lib/d1-rest.mjs';
import { validateStudyCardBundle } from './lib/study-card-artifact.mjs';
import { studyCardRuntimeCatalogQuery } from '../src/lib/server/studyCardCatalogQuery.ts';
import {
	CdpClient,
	VIEWPORTS,
	captureScreenshot,
	collectDomSummary,
	collectLayoutEvidence,
	delay,
	evaluate,
	forceTheme,
	launchChrome,
	safeUrl,
	sanitizeText,
	settlePageAssets,
	tracksForIdle,
	waitForDocumentReady,
	waitForNetworkIdle,
	waitUntil
} from './validate-release-browser.mjs';

const DEFAULT_OUTPUT = 'docs/release-evidence/study-card-offering-browser-validation';
const CATALOG_PATH = 'data/curricula/curriculum-catalog.json';
const RECALL_PROMPT_PREFIX = 'recall-prompt-';
const PROFILE_SUBJECTS = Object.freeze([
	'Biology',
	'Chemistry',
	'Physics',
	'Computer Science',
	'Geography',
	'History',
	'English Language',
	'English Literature'
]);

export const EXPECTED_STUDY_CARD_OFFERING_IDS = Object.freeze([
	'aqa-gcse-biology-8461-v1.0:foundation',
	'aqa-gcse-biology-8461-v1.0:higher',
	'aqa-gcse-chemistry-8462-v1.1:foundation',
	'aqa-gcse-chemistry-8462-v1.1:higher',
	'aqa-gcse-physics-8463-v1.1:foundation',
	'aqa-gcse-physics-8463-v1.1:higher',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:biology:foundation',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:biology:higher',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:chemistry:foundation',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:chemistry:higher',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:physics:foundation',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:physics:higher',
	'aqa-gcse-computer-science-8525-v1.3-2027:higher',
	'aqa-gcse-geography-8035-v1.1:higher',
	'aqa-gcse-history-8145-v1.3:higher',
	'ocr-gcse-english-language-j351-v2.0:higher',
	'ocr-gcse-english-literature-j352-v3.0:higher'
]);

export const LITERATURE_BROWSER_SELECTION_IDS = Object.freeze([
	'ocr-gcse-english-literature-j352-v3.0:01-modern-an-inspector-calls',
	'ocr-gcse-english-literature-j352-v3.0:01-nineteenth-century-the-strange-case-of-dr-jekyll-and-mr-hyde',
	'ocr-gcse-english-literature-j352-v3.0:02-poetry-conflict',
	'ocr-gcse-english-literature-j352-v3.0:02-shakespeare-macbeth'
]);

const usage = `Usage:
node scripts/validate-study-card-offering-browser.mjs [options]

Default behavior is a read-only preflight. It reads the tracked curriculum catalog and remote
Question/Personal/Analytics D1 metadata, but does not launch Chrome, mutate a learner profile,
write evidence, submit a recall review, or call a model.

Options:
  --base-url=http://127.0.0.1:5173
  --output=${DEFAULT_OUTPUT}
  --chrome-bin=/usr/bin/google-chrome
  --settle-ms=750
  --timeout-ms=30000
  --execute-offering-matrix
  --confirm=${DEV_AUTH_CLEANUP_CONFIRMATION}
  --no-screenshots
  --help

Execution is locked to DEV_AUTH_USER_ID=${DISPOSABLE_DEV_AUTH_USER_ID}, a credential-free loopback
HTTP origin, and the exact confirmation above. It cleans the fixed disposable user, configures one
exact offering at a time, opens and reveals one standard flashcard from all 17 offerings, proves
the browser card's stored content identity and curriculum scope, rejects every non-Analytics API
write, verifies that no recall review or model run was stored, and cleans the disposable user again.`;

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	await main();
}

async function main() {
	const options = parseStudyCardOfferingBrowserArgs(process.argv.slice(2));
	if (options.help) {
		console.log(usage);
		return;
	}
	const rootDir = process.cwd();
	loadD1Env(rootDir);
	const preflight = await collectPreflight({ rootDir, options });
	if (!options.executeOfferingMatrix) {
		const report = {
			schemaVersion: 'study-card-offering-browser-preflight-v1',
			mode: 'read-only',
			status: preflight.ready ? 'ready' : 'blocked',
			writePerformed: false,
			...preflight
		};
		console.log(JSON.stringify(report, null, 2));
		if (!preflight.ready) process.exitCode = 1;
		return;
	}
	if (!preflight.ready) {
		throw new Error(`Offering browser preflight blocked: ${preflight.issues.join('; ')}`);
	}

	const outputDir = path.resolve(rootDir, options.output);
	const screenshotDir = path.join(outputDir, 'screenshots');
	await mkdir(outputDir, { recursive: true });
	if (options.screenshots) await mkdir(screenshotDir, { recursive: true });

	const startedAt = new Date().toISOString();
	let chrome = null;
	let cleanupBefore = null;
	let cleanupAfter = null;
	let cleanupRequired = false;
	let fatalError = null;
	const cases = [];

	try {
		cleanupRequired = true;
		cleanupBefore = await cleanDisposableUser();
		chrome = await launchChrome(options);
		for (const plan of preflight.offerings) {
			const result = await executeOfferingCase({
				rootDir,
				plan,
				preflightDeck: preflight.decks.find((deck) => deck.offeringId === plan.id),
				chrome,
				options,
				outputDir,
				screenshotDir
			});
			cases.push(result);
			console.log(
				`${result.status.toUpperCase()} ${plan.id} ${result.cardCount ?? 0} card(s) ${result.issues.length} issue(s)`
			);
		}
	} catch (error) {
		fatalError = redactHarnessText(error instanceof Error ? error.stack || error.message : error);
		console.error(fatalError);
	} finally {
		if (chrome) await chrome.close().catch(() => undefined);
		if (cleanupRequired) {
			try {
				cleanupAfter = await cleanDisposableUser();
			} catch (error) {
				const message = redactHarnessText(
					error instanceof Error ? error.stack || error.message : error
				);
				fatalError = fatalError
					? `${fatalError}\nPost-run cleanup failed: ${message}`
					: `Post-run cleanup failed: ${message}`;
			}
		}
	}

	const failedCases = cases.filter((row) => row.status !== 'passed');
	const report = {
		schemaVersion: 'study-card-offering-browser-real-chrome-v1',
		status:
			fatalError ||
			cases.length !== EXPECTED_STUDY_CARD_OFFERING_IDS.length ||
			failedCases.length > 0
				? 'failed'
				: 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		baseUrl: safeUrl(options.baseUrl),
		writePerformed: true,
		chrome: chrome ? { binary: chrome.binary, version: chrome.version, headless: true } : null,
		configuration: {
			expectedOfferingIds: EXPECTED_STUDY_CARD_OFFERING_IDS,
			disposableUserToken: evidenceToken(DISPOSABLE_DEV_AUTH_USER_ID),
			viewport: { name: 'laptop', ...VIEWPORTS.laptop },
			theme: 'light',
			activity: 'flashcards',
			interaction: 'Reveal the first exact standard card only; never review or advance.',
			cleanupPolicy:
				'All Personal and directly traceable development Analytics rows for the fixed disposable uid are deleted before and after the matrix.'
		},
		preflight,
		cleanup: { before: cleanupBefore, after: cleanupAfter },
		summary: {
			caseCount: cases.length,
			passedCaseCount: cases.length - failedCases.length,
			failedCaseCount: failedCases.length,
			recallReviewRequestCount: cases.reduce(
				(sum, row) => sum + row.network.recallReviewRequests.length,
				0
			),
			unexpectedApiWriteCount: cases.reduce(
				(sum, row) => sum + row.network.unexpectedApiWrites.length,
				0
			),
			storedRecallReviewCount: cases.reduce(
				(sum, row) => sum + Number(row.persistence.recallReviews ?? 0),
				0
			),
			storedModelRunCount: cases.reduce(
				(sum, row) => sum + Number(row.persistence.modelRuns ?? 0),
				0
			)
		},
		fatalError,
		cases
	};
	await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
	await writeFile(path.join(outputDir, 'summary.md'), markdownSummary(report));
	console.log(`Evidence: ${path.relative(rootDir, path.join(outputDir, 'report.json'))}`);
	if (report.status !== 'passed') process.exitCode = 1;
}

export function parseStudyCardOfferingBrowserArgs(argv) {
	const options = {
		baseUrl: 'http://127.0.0.1:5173',
		output: DEFAULT_OUTPUT,
		chromeBin: '/usr/bin/google-chrome',
		settleMs: 750,
		timeoutMs: 30_000,
		executeOfferingMatrix: false,
		confirm: null,
		screenshots: true,
		help: false
	};
	for (const argument of argv) {
		if (argument === '--help' || argument === '-h') options.help = true;
		else if (argument === '--no-screenshots') options.screenshots = false;
		else if (argument === '--execute-offering-matrix') options.executeOfferingMatrix = true;
		else if (argument.startsWith('--base-url=')) {
			options.baseUrl = optionValue(argument).replace(/\/+$/, '');
		} else if (argument.startsWith('--output=')) options.output = optionValue(argument);
		else if (argument.startsWith('--chrome-bin=')) options.chromeBin = optionValue(argument);
		else if (argument.startsWith('--settle-ms=')) {
			options.settleMs = positiveInteger(optionValue(argument), argument);
		} else if (argument.startsWith('--timeout-ms=')) {
			options.timeoutMs = positiveInteger(optionValue(argument), argument);
		} else if (argument.startsWith('--confirm=')) options.confirm = optionValue(argument);
		else throw new Error(`Unknown option: ${argument}\n\n${usage}`);
	}
	if (options.confirm && !options.executeOfferingMatrix) {
		throw new Error('--confirm is only valid together with --execute-offering-matrix.');
	}
	if (options.executeOfferingMatrix && options.confirm !== DEV_AUTH_CLEANUP_CONFIRMATION) {
		throw new Error(
			`Offering matrix execution requires --confirm=${DEV_AUTH_CLEANUP_CONFIRMATION}.`
		);
	}
	new URL(options.baseUrl);
	return options;
}

async function collectPreflight({ rootDir, options }) {
	const issues = [];
	const loopbackHttpOnly = isSafeLoopbackOrigin(`${options.baseUrl}/`);
	const configuredUserMatches = process.env.DEV_AUTH_USER_ID === DISPOSABLE_DEV_AUTH_USER_ID;
	const analyticsEnvironmentSafe =
		!process.env.ANALYTICS_ENVIRONMENT || process.env.ANALYTICS_ENVIRONMENT === 'development';
	if (!loopbackHttpOnly) issues.push('base URL is not a credential-free loopback HTTP origin');
	if (!configuredUserMatches) issues.push('DEV_AUTH_USER_ID is not the fixed disposable uid');
	if (!analyticsEnvironmentSafe) issues.push('ANALYTICS_ENVIRONMENT is not development');

	let migrations = { questionPending: [], personalPending: [] };
	try {
		const [questionFiles, personalFiles, questionRows, personalRows] = await Promise.all([
			migrationFiles(path.join(rootDir, 'migrations')),
			migrationFiles(path.join(rootDir, 'migrations', 'personal')),
			d1Rows('SELECT name FROM d1_migrations ORDER BY id', [], { binding: 'QUESTION_DB' }),
			d1Rows('SELECT name FROM d1_migrations ORDER BY id', [], { binding: 'PERSONAL_DB' })
		]);
		const questionApplied = new Set(questionRows.map((row) => row.name));
		const personalApplied = new Set(personalRows.map((row) => row.name));
		migrations = {
			questionPending: questionFiles.filter((name) => !questionApplied.has(name)),
			personalPending: personalFiles.filter((name) => !personalApplied.has(name))
		};
		if (migrations.questionPending.length > 0) issues.push('Question D1 has pending migrations');
		if (migrations.personalPending.length > 0) issues.push('Personal D1 has pending migrations');
	} catch (error) {
		issues.push(`migration preflight failed: ${redactHarnessText(error)}`);
	}

	let cleanupInventory = {
		personalSchemaExact: false,
		analyticsSchemaExact: false,
		analyticsSafeToDelete: false,
		personalRowCount: null,
		analyticsRowCount: null
	};
	try {
		const inventory = await devAuthCleanupInventory(DISPOSABLE_DEV_AUTH_USER_ID);
		cleanupInventory = {
			personalSchemaExact: inventory.schema.personalExact,
			analyticsSchemaExact: inventory.schema.analyticsExact,
			analyticsSafeToDelete: inventory.analytics.safeToDelete,
			personalRowCount: inventory.personal.total ?? null,
			analyticsRowCount: inventory.analytics.total ?? null
		};
		if (!inventory.schema.personalExact || !inventory.schema.analyticsExact) {
			issues.push('disposable-user cleanup table inventory has drifted');
		}
		if (!inventory.analytics.safeToDelete) {
			issues.push('disposable uid has production or environment-less Analytics rows');
		}
	} catch (error) {
		issues.push(`cleanup inventory preflight failed: ${redactHarnessText(error)}`);
	}

	let offerings = [];
	let localArtifacts = null;
	try {
		const catalog = JSON.parse(await readFile(path.join(rootDir, CATALOG_PATH), 'utf8'));
		offerings = validateExactOfferingCatalog(catalog);
		localArtifacts = await auditLocalStudyCardArtifacts(rootDir, offerings);
	} catch (error) {
		issues.push(`local offering/artifact lock failed: ${redactHarnessText(error)}`);
	}

	let remoteScopes = null;
	if (offerings.length === EXPECTED_STUDY_CARD_OFFERING_IDS.length) {
		try {
			remoteScopes = await auditRemoteOfferingScopes(offerings);
		} catch (error) {
			issues.push(`remote offering/scope lock failed: ${redactHarnessText(error)}`);
		}
	}

	const deckReports = [];
	const runtimeCardsById = new Map();
	if (offerings.length === EXPECTED_STUDY_CARD_OFFERING_IDS.length) {
		const results = await mapLimit(offerings, 4, async (plan) => {
			try {
				const deck = await loadAndValidateOfferingDeck(
					plan,
					localArtifacts?.cardsByOffering.get(plan.id) ?? null
				);
				return { ok: true, plan, deck };
			} catch (error) {
				return { ok: false, plan, error: redactHarnessText(error) };
			}
		});
		for (const result of results) {
			if (!result.ok) {
				issues.push(`${result.plan.id} runtime deck failed: ${result.error}`);
				deckReports.push({ offeringId: result.plan.id, status: 'blocked', error: result.error });
				continue;
			}
			for (const card of result.deck.cards) {
				const existing = runtimeCardsById.get(card.id);
				if (existing && existing.choiceCount !== card.choiceCount) {
					issues.push(`${card.id} has inconsistent runtime choice counts across offerings`);
				} else {
					runtimeCardsById.set(card.id, card);
				}
			}
			deckReports.push(publicDeckReport(result.deck));
		}
	}
	const threeChoiceCards = [...runtimeCardsById.values()].filter((card) => card.choiceCount === 3);
	const fourChoiceCards = [...runtimeCardsById.values()].filter((card) => card.choiceCount === 4);
	if (runtimeCardsById.size > 0 && threeChoiceCards.length === 0) {
		issues.push('runtime offering union contains no three-choice standard card');
	}
	if (runtimeCardsById.size > 0 && fourChoiceCards.length === 0) {
		issues.push('runtime offering union contains no four-choice standard card');
	}

	return {
		ready: issues.length === 0,
		issues,
		safety: {
			loopbackHttpOnly,
			configuredUserMatches,
			analyticsEnvironmentSafe,
			executionFlagPresent: options.executeOfferingMatrix,
			confirmationMatches:
				options.executeOfferingMatrix && options.confirm === DEV_AUTH_CLEANUP_CONFIRMATION,
			disposableUserToken: evidenceToken(DISPOSABLE_DEV_AUTH_USER_ID)
		},
		topologyAudit: {
			finalVerifierCoverage:
				'verify-final-release-data proves the accepted local union, exact 17-offering representation, 1,401 offering/component pairs, 152 deck scopes, and byte-for-byte remote study-card child rows.',
			remainingRuntimeGap:
				'The final verifier does not execute the runtime catalog SQL through an exact learner profile or hydrate a real recall session.',
			thisHarness:
				'Runs the runtime SQL for each locked offering and, in explicit execution mode, proves one exact stored standard card per offering in real Chrome.',
			separateResponsiveGate:
				'This bounded laptop/light offering matrix does not replace the final mobile/iPad/laptop and light/dark release-browser screenshot gate.'
		},
		migrations,
		cleanupInventory,
		localArtifacts: localArtifacts?.report ?? null,
		remoteScopes,
		offerings,
		decks: deckReports,
		runtimeChoiceDistribution: {
			uniqueCardCount: runtimeCardsById.size,
			threeChoiceCardCount: threeChoiceCards.length,
			fourChoiceCardCount: fourChoiceCards.length,
			threeChoiceSampleId: threeChoiceCards[0]?.id ?? null,
			fourChoiceSampleId: fourChoiceCards[0]?.id ?? null
		}
	};
}

export function validateExactOfferingCatalog(catalog) {
	if (!catalog || !Array.isArray(catalog.offerings) || !Array.isArray(catalog.specifications)) {
		throw new Error('Curriculum catalog is missing offerings or specifications.');
	}
	const actualIds = catalog.offerings.map((offering) => offering.id);
	if (new Set(actualIds).size !== actualIds.length) {
		throw new Error('Curriculum catalog contains duplicate offering ids.');
	}
	if (JSON.stringify(actualIds) !== JSON.stringify(EXPECTED_STUDY_CARD_OFFERING_IDS)) {
		throw new Error('Curriculum catalog does not contain the exact ordered 17-offering lock.');
	}
	const specificationById = new Map(catalog.specifications.map((row) => [row.id, row]));
	const tupleSet = new Set();
	return catalog.offerings.map((offering) => {
		const specification = specificationById.get(offering.specificationId);
		if (!specification) throw new Error(`${offering.id} has no exact specification.`);
		if (
			!offering.id ||
			!offering.board ||
			!offering.qualification ||
			!offering.profileSubject ||
			!offering.course ||
			!offering.tier ||
			!Array.isArray(offering.selectableComponentIds) ||
			offering.selectableComponentIds.length === 0
		) {
			throw new Error(`${offering.id ?? '<unknown>'} is not a complete curriculum offering.`);
		}
		const tuple = [
			offering.board,
			offering.qualification,
			offering.profileSubject,
			offering.course,
			offering.tier
		].join('\u0000');
		if (tupleSet.has(tuple)) throw new Error(`${offering.id} duplicates an offering lookup tuple.`);
		tupleSet.add(tuple);
		if (
			specification.board !== offering.board ||
			specification.qualification !== offering.qualification ||
			!specification.profileSubjects?.includes(offering.profileSubject)
		) {
			throw new Error(`${offering.id} disagrees with its specification identity.`);
		}
		const componentById = new Map(specification.components.map((row) => [row.id, row]));
		for (const id of offering.selectableComponentIds) {
			if (!componentById.get(id)?.selectable) {
				throw new Error(`${offering.id} contains a non-selectable topic ${id}.`);
			}
		}
		let literatureSelection = null;
		let browserTopicIds = null;
		if (offering.profileSubject === 'English Literature') {
			const selected = LITERATURE_BROWSER_SELECTION_IDS.map((id) => componentById.get(id));
			if (selected.some((row) => !row?.selectable)) {
				throw new Error('The locked Literature browser selection is missing or not selectable.');
			}
			literatureSelection = {
				modernText: selected[0].title,
				nineteenthCenturyNovel: selected[1].title,
				poetryCluster: selected[2].title,
				shakespearePlay: selected[3].title
			};
			browserTopicIds = [...LITERATURE_BROWSER_SELECTION_IDS];
		}
		return {
			id: offering.id,
			board: offering.board,
			qualification: offering.qualification,
			profileSubject: offering.profileSubject,
			course: offering.course,
			tier: offering.tier,
			specificationId: offering.specificationId,
			specificationCode: specification.specificationCode,
			specificationVersion: specification.version,
			officialSourceUrl: specification.landingUrl,
			selectableComponentIds: [...offering.selectableComponentIds],
			browserTopicIds,
			literatureSelection
		};
	});
}

async function auditLocalStudyCardArtifacts(rootDir, plans) {
	const releasesDir = path.join(rootDir, 'data/study-cards/releases');
	const entries = (await readdir(releasesDir, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.sort((left, right) => left.name.localeCompare(right.name));
	const bundles = [];
	for (const entry of entries) {
		const artifactPath = path.join(releasesDir, entry.name, 'accepted-study-cards.json');
		try {
			bundles.push(validateStudyCardBundle(JSON.parse(await readFile(artifactPath, 'utf8'))));
		} catch (error) {
			if (error?.code === 'ENOENT') continue;
			throw new Error(`${path.relative(rootDir, artifactPath)}: ${redactHarnessText(error)}`, {
				cause: error
			});
		}
	}
	if (bundles.length !== 63) {
		throw new Error(`Accepted artifact union contains ${bundles.length}, not 63 releases.`);
	}
	const cards = bundles.flatMap((bundle) => bundle.cards);
	if (cards.length !== 1097) {
		throw new Error(`Accepted artifact union contains ${cards.length}, not 1,097 cards.`);
	}
	if (new Set(cards.map((card) => card.id)).size !== cards.length) {
		throw new Error('Accepted artifact union contains duplicate card ids.');
	}
	const planById = new Map(plans.map((plan) => [plan.id, plan]));
	const expectedScopes = exactScopePairs(plans);
	const coverageScopes = new Set();
	const readyScopes = new Set();
	const cardsByOffering = new Map(plans.map((plan) => [plan.id, []]));
	for (const bundle of bundles) {
		for (const coverage of bundle.coverage) {
			const key = `${coverage.offeringId}\n${coverage.topicComponentId}`;
			if (!expectedScopes.has(key)) {
				throw new Error(`Accepted artifact coverage contains an unexpected scope ${key}.`);
			}
			coverageScopes.add(key);
			if (coverage.status === 'ready') readyScopes.add(key);
		}
		for (const card of bundle.cards) {
			const targetOfferings = [...new Set(card.targets.map((target) => target.offeringId))];
			for (const offeringId of targetOfferings) {
				const plan = planById.get(offeringId);
				if (!plan) throw new Error(`${card.id} targets an unlocked offering ${offeringId}.`);
				const targets = card.targets
					.filter((target) => target.offeringId === offeringId)
					.sort(compareTargetPreference);
				const target = targets[0];
				if (!plan.selectableComponentIds.includes(target.topicComponentId)) {
					throw new Error(`${card.id} targets a non-selectable scope in ${offeringId}.`);
				}
				cardsByOffering.get(offeringId).push({
					id: card.id,
					releaseId: bundle.release.id,
					offeringId,
					topicComponentId: target.topicComponentId,
					curriculumComponentId: target.curriculumComponentId,
					contentRevision: card.contentRevision,
					contentHash: card.contentHash,
					choiceCount: card.choices.length
				});
			}
		}
	}
	if (!sameSet(coverageScopes, expectedScopes)) {
		throw new Error(
			`Accepted artifact coverage union contains ${coverageScopes.size}, not the exact ${expectedScopes.size} selectable offering scopes.`
		);
	}
	if (!sameSet(readyScopes, expectedScopes)) {
		throw new Error(
			`Accepted artifacts provide a ready deck for ${readyScopes.size}, not all ${expectedScopes.size} selectable offering scopes.`
		);
	}
	for (const plan of plans) {
		const offeringCards = cardsByOffering.get(plan.id);
		if (!offeringCards?.length) throw new Error(`${plan.id} has zero accepted local cards.`);
	}
	return {
		cardsByOffering,
		report: {
			status: 'exact',
			releaseCount: bundles.length,
			cardCount: cards.length,
			offeringCount: cardsByOffering.size,
			selectableScopeCount: coverageScopes.size,
			readySelectableScopeCount: readyScopes.size,
			offeringCardCounts: Object.fromEntries(
				plans.map((plan) => [plan.id, cardsByOffering.get(plan.id).length])
			)
		}
	};
}

async function auditRemoteOfferingScopes(plans) {
	const [offeringRows, coverageRows] = await Promise.all([
		d1Rows(
			`SELECT offering.id, offering.board, offering.qualification,
			        offering.profile_subject, offering.course, offering.tier,
			        offering.specification_id, offering.selectable_component_ids_json,
			        offering.enabled, specification.specification_code,
			        specification.version AS specification_version,
			        specification.landing_url
			 FROM curriculum_offerings offering
			 JOIN curriculum_specifications specification
			   ON specification.id = offering.specification_id
			 ORDER BY offering.id`,
			[],
			{ binding: 'QUESTION_DB' }
		),
		d1Rows(
			`SELECT DISTINCT offering_id, topic_component_id
			 FROM study_deck_coverage
			 WHERE status = 'ready' AND reviewed = 1
			   AND import_owner = 'study-card-import/v1'
			 ORDER BY offering_id, topic_component_id`,
			[],
			{ binding: 'QUESTION_DB' }
		)
	]);
	if (offeringRows.length !== plans.length) {
		throw new Error(`Question D1 contains ${offeringRows.length}, not 17 curriculum offerings.`);
	}
	const rowById = new Map(offeringRows.map((row) => [row.id, row]));
	for (const plan of plans) {
		const row = rowById.get(plan.id);
		let selectable;
		try {
			selectable = JSON.parse(row?.selectable_component_ids_json ?? 'null');
		} catch {
			selectable = null;
		}
		if (
			!row ||
			Number(row.enabled) !== 1 ||
			row.board !== plan.board ||
			row.qualification !== plan.qualification ||
			row.profile_subject !== plan.profileSubject ||
			row.course !== plan.course ||
			row.tier !== plan.tier ||
			row.specification_id !== plan.specificationId ||
			row.specification_code !== plan.specificationCode ||
			row.specification_version !== plan.specificationVersion ||
			row.landing_url !== plan.officialSourceUrl ||
			JSON.stringify(selectable) !== JSON.stringify(plan.selectableComponentIds)
		) {
			throw new Error(`${plan.id} remote curriculum identity/selectable scope drifted.`);
		}
	}
	const expectedScopes = exactScopePairs(plans);
	const actualScopes = new Set(
		coverageRows.map((row) => `${row.offering_id}\n${row.topic_component_id}`)
	);
	if (!sameSet(actualScopes, expectedScopes)) {
		throw new Error(
			`Question D1 exposes ${actualScopes.size}, not the exact ${expectedScopes.size} ready selectable scopes.`
		);
	}
	return {
		status: 'exact',
		offeringCount: offeringRows.length,
		readySelectableScopeCount: actualScopes.size
	};
}

function exactScopePairs(plans) {
	return new Set(
		plans.flatMap((plan) => plan.selectableComponentIds.map((topicId) => `${plan.id}\n${topicId}`))
	);
}

function compareTargetPreference(left, right) {
	return (
		Number(right.isPrimary) - Number(left.isPrimary) ||
		Number(right.confidence) - Number(left.confidence) ||
		left.topicComponentId.localeCompare(right.topicComponentId) ||
		left.curriculumComponentId.localeCompare(right.curriculumComponentId)
	);
}

function compareCardIdentity(left, right) {
	return left.id.localeCompare(right.id);
}

function sameSet(left, right) {
	return left.size === right.size && [...left].every((value) => right.has(value));
}

async function loadAndValidateOfferingDeck(plan, expectedLocalCards = null) {
	const rows = await d1Rows(
		studyCardRuntimeCatalogQuery,
		[plan.board, plan.profileSubject, plan.id, null],
		{ binding: 'QUESTION_DB' }
	);
	return validateOfferingDeckRows(plan, rows, expectedLocalCards);
}

/** @param {any} plan @param {any[]} rows @param {any[] | null} [expectedLocalCards] */
export function validateOfferingDeckRows(plan, rows, expectedLocalCards = null) {
	if (!Array.isArray(rows) || rows.length === 0) {
		throw new Error('Runtime study-card query returned zero cards.');
	}
	const allowedTopics = new Set(plan.selectableComponentIds);
	const seenIds = new Set();
	const cards = [];
	for (const row of rows) {
		if (
			typeof row.id !== 'string' ||
			!row.id ||
			row.board !== plan.board ||
			row.qualification !== plan.qualification ||
			row.subject !== plan.profileSubject ||
			row.offering_id !== plan.id ||
			!allowedTopics.has(row.topic_component_id) ||
			typeof row.front !== 'string' ||
			!row.front.trim() ||
			typeof row.back !== 'string' ||
			!row.back.trim() ||
			!Number.isInteger(Number(row.content_revision)) ||
			!/^[a-f0-9]{64}$/i.test(String(row.content_hash ?? ''))
		) {
			throw new Error(`Runtime row ${row.id ?? '<unknown>'} has a wrong or incomplete scope.`);
		}
		if (seenIds.has(row.id)) throw new Error(`Runtime query returned duplicate card ${row.id}.`);
		seenIds.add(row.id);
		const choices = parseChoices(row.choices_json);
		if (!choices) throw new Error(`Runtime card ${row.id} has invalid canonical choices.`);
		cards.push({
			id: row.id,
			releaseId: row.release_id,
			offeringId: row.offering_id,
			topicComponentId: row.topic_component_id,
			curriculumComponentId: row.curriculum_component_id,
			contentRevision: Number(row.content_revision),
			contentHash: row.content_hash,
			front: row.front,
			back: row.back,
			choiceCount: choices.length
		});
	}
	const browserTopicIds = plan.browserTopicIds ? new Set(plan.browserTopicIds) : null;
	const browserCards = browserTopicIds
		? cards.filter((card) => browserTopicIds.has(card.topicComponentId))
		: cards;
	if (browserCards.length === 0) {
		throw new Error('The exact learner scope would hydrate zero standard cards.');
	}
	if (expectedLocalCards) {
		const expected = [...expectedLocalCards].sort(compareCardIdentity);
		const actual = [...cards].sort(compareCardIdentity);
		if (
			expected.length !== actual.length ||
			expected.some((card, index) =>
				[
					'id',
					'offeringId',
					'topicComponentId',
					'curriculumComponentId',
					'contentRevision',
					'contentHash',
					'choiceCount'
				].some((key) => card[key] !== actual[index]?.[key])
			)
		) {
			throw new Error(
				'Runtime study-card identities differ from the accepted local artifact union.'
			);
		}
	}
	return {
		offeringId: plan.id,
		cards,
		browserCards,
		cardSetHash: sha256(
			cards
				.map((card) =>
					[
						card.id,
						card.offeringId,
						card.topicComponentId,
						card.curriculumComponentId,
						card.contentRevision,
						card.contentHash
					].join('\u0000')
				)
				.join('\n')
		)
	};
}

function parseChoices(value) {
	try {
		const parsed = typeof value === 'string' ? JSON.parse(value) : value;
		if (!Array.isArray(parsed) || ![3, 4].includes(parsed.length)) return null;
		if (parsed.filter((row) => row?.isCorrect === true).length !== 1) return null;
		if (
			parsed.some(
				(row) =>
					!row ||
					typeof row.key !== 'string' ||
					typeof row.text !== 'string' ||
					typeof row.feedback !== 'string'
			)
		) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function publicDeckReport(deck) {
	return {
		offeringId: deck.offeringId,
		status: 'ready',
		cardCount: deck.cards.length,
		browserScopeCardCount: deck.browserCards.length,
		cardSetHash: deck.cardSetHash,
		cardIds: deck.cards.map((card) => card.id),
		browserFirstCard: publicCardIdentity(deck.browserCards[0])
	};
}

async function executeOfferingCase({
	rootDir,
	plan,
	preflightDeck,
	chrome,
	options,
	outputDir,
	screenshotDir
}) {
	const startedAt = new Date().toISOString();
	const issues = [];
	let deck = null;
	let profile = null;
	let browser = emptyBrowserResult();
	let persistence = { recallReviews: null, recallEvidence: null, modelRuns: null };
	try {
		// This query is intentionally repeated immediately before each profile/browser
		// session so the exact card set cannot drift after the global preflight.
		deck = await loadAndValidateOfferingDeck(plan);
		if (
			preflightDeck?.status !== 'ready' ||
			deck.cardSetHash !== preflightDeck.cardSetHash ||
			JSON.stringify(deck.cards.map((card) => card.id)) !== JSON.stringify(preflightDeck.cardIds)
		) {
			throw new Error(`${plan.id} runtime card set drifted after the read-only preflight.`);
		}
		await d1Batch(buildOfferingProfileStatements(plan), {
			rootDir,
			binding: 'PERSONAL_DB'
		});
		profile = await verifyOfferingProfile(plan);
		browser = await runOfferingBrowser({
			plan,
			deck,
			chrome,
			options,
			outputDir,
			screenshotDir
		});
		issues.push(...browser.issues);
		persistence = await readForbiddenPersistence();
		if (persistence.recallReviews !== 0) issues.push('a recall review row was stored');
		if (persistence.recallEvidence !== 0) issues.push('recall learning evidence was stored');
		if (persistence.modelRuns !== 0) issues.push('a model run was stored for the disposable uid');
	} catch (error) {
		issues.push(redactHarnessText(error));
	}
	return {
		status: issues.length === 0 ? 'passed' : 'failed',
		startedAt,
		finishedAt: new Date().toISOString(),
		offering: {
			id: plan.id,
			board: plan.board,
			qualification: plan.qualification,
			subject: plan.profileSubject,
			course: plan.course,
			tier: plan.tier
		},
		cardCount: deck?.cards.length ?? null,
		browserScopeCardCount: deck?.browserCards.length ?? null,
		cardSetHash: deck?.cardSetHash ?? null,
		expectedCardIds: deck?.cards.map((card) => card.id) ?? [],
		expectedFirstCard: deck ? publicCardIdentity(deck.browserCards[0]) : null,
		profile,
		browser,
		network: browser.network,
		persistence,
		issues
	};
}

export function buildOfferingProfileStatements(plan) {
	const uid = DISPOSABLE_DEV_AUTH_USER_ID;
	const email = process.env.DEV_AUTH_EMAIL?.trim().toLowerCase() || `${uid}@example.test`;
	const name = process.env.DEV_AUTH_NAME?.trim() || 'Study-card offering validator';
	const statements = [
		{
			sql: `INSERT INTO user_profiles (
			       uid, email, name, photo_url, selected_board, selected_qualification,
			       selected_subject, selected_tier, theme_preference
			     ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'light')
			     ON CONFLICT(uid) DO UPDATE SET
			       email = excluded.email,
			       name = excluded.name,
			       photo_url = NULL,
			       selected_board = excluded.selected_board,
			       selected_qualification = excluded.selected_qualification,
			       selected_subject = excluded.selected_subject,
			       selected_tier = excluded.selected_tier,
			       theme_preference = 'light',
			       updated_at = CURRENT_TIMESTAMP,
			       last_seen_at = CURRENT_TIMESTAMP`,
			params: [uid, email, name, plan.board, plan.qualification, plan.profileSubject, plan.tier]
		},
		{ sql: 'DELETE FROM user_subject_curriculum_scopes WHERE user_id = ?', params: [uid] },
		{ sql: 'DELETE FROM user_english_literature_selections WHERE user_id = ?', params: [uid] },
		{ sql: 'DELETE FROM user_profile_subjects WHERE user_id = ?', params: [uid] },
		{
			sql: `INSERT INTO user_profile_subjects (
			       user_id, subject, board, qualification, course, tier, enabled
			     ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
			params: [uid, plan.profileSubject, plan.board, plan.qualification, plan.course, plan.tier]
		}
	];
	for (const subject of PROFILE_SUBJECTS.filter((subject) => subject !== plan.profileSubject)) {
		const english = subject.startsWith('English ');
		const science = ['Biology', 'Chemistry', 'Physics'].includes(subject);
		statements.push({
			sql: `INSERT INTO user_profile_subjects (
			       user_id, subject, board, qualification, course, tier, enabled
			     ) VALUES (?, ?, ?, 'GCSE', ?, 'Higher', 0)`,
			params: [uid, subject, english ? 'OCR' : 'AQA', science ? 'Combined Science' : 'GCSE Subject']
		});
	}
	if (plan.profileSubject === 'English Literature') {
		if (!plan.literatureSelection)
			throw new Error('Literature offering has no exact text selection.');
		statements.push({
			sql: `INSERT INTO user_english_literature_selections (
			       user_id, board, specification_code, modern_text,
			       nineteenth_century_novel, poetry_cluster, shakespeare_play
			     ) VALUES (?, 'OCR', 'J352', ?, ?, ?, ?)`,
			params: [
				uid,
				plan.literatureSelection.modernText,
				plan.literatureSelection.nineteenthCenturyNovel,
				plan.literatureSelection.poetryCluster,
				plan.literatureSelection.shakespearePlay
			]
		});
	} else {
		statements.push({
			sql: `INSERT INTO user_subject_curriculum_scopes (
			       user_id, subject, board, qualification, course, tier,
			       specification_code, specification_version, official_source_url,
			       scope_mode, selected_component_ids_json
			     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'all', '[]')`,
			params: [
				uid,
				plan.profileSubject,
				plan.board,
				plan.qualification,
				plan.course,
				plan.tier,
				plan.specificationCode,
				plan.specificationVersion,
				plan.officialSourceUrl
			]
		});
	}
	return statements;
}

async function verifyOfferingProfile(plan) {
	const uid = DISPOSABLE_DEV_AUTH_USER_ID;
	const [profiles, subjects, scopes, literature] = await Promise.all([
		d1Rows(
			`SELECT selected_board, selected_qualification, selected_subject, selected_tier
			 FROM user_profiles WHERE uid = ?`,
			[uid],
			{ binding: 'PERSONAL_DB' }
		),
		d1Rows(
			`SELECT subject, board, qualification, course, tier, enabled
			 FROM user_profile_subjects WHERE user_id = ? ORDER BY subject`,
			[uid],
			{ binding: 'PERSONAL_DB' }
		),
		d1Rows(
			`SELECT subject, board, qualification, course, tier, specification_code,
			        specification_version, official_source_url, scope_mode,
			        selected_component_ids_json
			 FROM user_subject_curriculum_scopes WHERE user_id = ? ORDER BY subject`,
			[uid],
			{ binding: 'PERSONAL_DB' }
		),
		d1Rows(
			`SELECT board, specification_code, modern_text, nineteenth_century_novel,
			        poetry_cluster, shakespeare_play
			 FROM user_english_literature_selections WHERE user_id = ?`,
			[uid],
			{ binding: 'PERSONAL_DB' }
		)
	]);
	return validateOfferingProfileSnapshot(plan, { profiles, subjects, scopes, literature });
}

export function validateOfferingProfileSnapshot(plan, snapshot) {
	const profile = snapshot.profiles?.[0];
	const subject = snapshot.subjects?.find((row) => row.subject === plan.profileSubject);
	const enabledSubjects = snapshot.subjects?.filter((row) => Number(row.enabled) === 1) ?? [];
	if (
		snapshot.profiles?.length !== 1 ||
		profile.selected_board !== plan.board ||
		profile.selected_qualification !== plan.qualification ||
		profile.selected_subject !== plan.profileSubject ||
		profile.selected_tier !== plan.tier ||
		snapshot.subjects?.length !== PROFILE_SUBJECTS.length ||
		enabledSubjects.length !== 1 ||
		!subject ||
		subject.subject !== plan.profileSubject ||
		subject.board !== plan.board ||
		subject.qualification !== plan.qualification ||
		subject.course !== plan.course ||
		subject.tier !== plan.tier ||
		Number(subject.enabled) !== 1
	) {
		throw new Error(`${plan.id} Personal profile does not match the exact offering.`);
	}
	if (plan.profileSubject === 'English Literature') {
		const selection = snapshot.literature?.[0];
		if (
			snapshot.scopes?.length !== 0 ||
			snapshot.literature?.length !== 1 ||
			selection.board !== 'OCR' ||
			selection.specification_code !== 'J352' ||
			selection.modern_text !== plan.literatureSelection?.modernText ||
			selection.nineteenth_century_novel !== plan.literatureSelection?.nineteenthCenturyNovel ||
			selection.poetry_cluster !== plan.literatureSelection?.poetryCluster ||
			selection.shakespeare_play !== plan.literatureSelection?.shakespearePlay
		) {
			throw new Error('Literature Personal text scope differs from the exact locked selection.');
		}
	} else {
		const scope = snapshot.scopes?.[0];
		if (
			snapshot.scopes?.length !== 1 ||
			snapshot.literature?.length !== 0 ||
			scope.subject !== plan.profileSubject ||
			scope.board !== plan.board ||
			scope.qualification !== plan.qualification ||
			scope.course !== plan.course ||
			scope.tier !== plan.tier ||
			scope.specification_code !== plan.specificationCode ||
			scope.specification_version !== plan.specificationVersion ||
			scope.official_source_url !== plan.officialSourceUrl ||
			scope.scope_mode !== 'all' ||
			scope.selected_component_ids_json !== '[]'
		) {
			throw new Error(`${plan.id} Personal curriculum scope is not exact.`);
		}
	}
	return {
		status: 'exact',
		subject: plan.profileSubject,
		board: plan.board,
		course: plan.course,
		tier: plan.tier,
		scopeMode: plan.profileSubject === 'English Literature' ? 'four-locked-texts' : 'all'
	};
}

async function runOfferingBrowser({ plan, deck, chrome, options, outputDir, screenshotDir }) {
	const expected = deck.browserCards[0];
	const target = await chrome.newTarget();
	const cdp = await CdpClient.connect(target.webSocketDebuggerUrl, options.timeoutMs);
	const requestIds = new Set();
	const network = {
		requests: [],
		recallReviewRequests: [],
		unexpectedApiWrites: [],
		failedRequests: [],
		errorResponses: []
	};
	const consoleErrors = [];
	const pageExceptions = [];
	let documentResponse = null;
	let screenshot = null;
	try {
		cdp.on('Network.requestWillBeSent', (event) => {
			const request = {
				method: event.request?.method ?? 'GET',
				url: safeUrl(event.request?.url ?? '')
			};
			network.requests.push(request);
			if (tracksForIdle(event.type, event.request?.url)) requestIds.add(event.requestId);
			const unsafe = classifyUnexpectedApiWrite(request, options.baseUrl);
			if (unsafe) {
				network.unexpectedApiWrites.push({ ...request, kind: unsafe });
				if (unsafe === 'recall-review') network.recallReviewRequests.push(request);
			}
		});
		cdp.on('Network.loadingFinished', (event) => requestIds.delete(event.requestId));
		cdp.on('Network.loadingFailed', (event) => {
			requestIds.delete(event.requestId);
			if (!event.canceled) {
				network.failedRequests.push({ errorText: sanitizeText(event.errorText ?? 'failed') });
			}
		});
		cdp.on('Network.responseReceived', (event) => {
			if (event.type === 'Document') {
				documentResponse = {
					status: event.response?.status ?? null,
					url: safeUrl(event.response?.url ?? '')
				};
			}
			if (
				(event.response?.status ?? 0) >= 400 &&
				sameOrigin(event.response?.url ?? '', options.baseUrl)
			) {
				network.errorResponses.push({
					status: event.response.status,
					url: safeUrl(event.response.url)
				});
			}
		});
		cdp.on('Runtime.consoleAPICalled', (event) => {
			if (event.type !== 'error') return;
			consoleErrors.push(
				sanitizeText((event.args ?? []).map((arg) => arg.value ?? arg.description).join(' '))
			);
		});
		cdp.on('Runtime.exceptionThrown', (event) => {
			pageExceptions.push(
				sanitizeText(
					event.exceptionDetails?.exception?.description ??
						event.exceptionDetails?.text ??
						'Unhandled page exception'
				)
			);
		});

		await Promise.all([
			cdp.send('Page.enable'),
			cdp.send('Runtime.enable'),
			cdp.send('Log.enable'),
			cdp.send('Network.enable')
		]);
		await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
		await cdp.send('Emulation.setDeviceMetricsOverride', {
			...VIEWPORTS.laptop,
			screenWidth: VIEWPORTS.laptop.width,
			screenHeight: VIEWPORTS.laptop.height,
			dontSetVisibleSize: false
		});
		await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
			source: `try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('question-constellation-theme', 'light'); } catch {}`
		});

		const url = new URL('/recall', `${options.baseUrl}/`);
		url.searchParams.set('subject', plan.profileSubject);
		url.searchParams.set('activity', 'flashcards');
		url.searchParams.set('size', '5');
		url.searchParams.set('start', '1');
		const load = cdp.waitFor('Page.loadEventFired', options.timeoutMs);
		await cdp.send('Page.navigate', { url: url.toString() });
		await load;
		await waitForDocumentReady(cdp, options.timeoutMs);
		await waitForNetworkIdle(requestIds, options.timeoutMs, options.settleMs);
		await settlePageAssets(cdp, options.timeoutMs);
		await forceTheme(cdp, 'light');
		await waitUntil(
			() => evaluate(cdp, () => Boolean(document.querySelector('.stack-card.active'))),
			options.timeoutMs,
			100
		);

		const beforeReveal = await activeCardIdentity(cdp);
		const reveal = await evaluate(cdp, () => {
			const button = document.querySelector('button.card-reveal-hitbox');
			if (!(button instanceof HTMLButtonElement)) return false;
			button.click();
			return true;
		});
		if (reveal) {
			await waitUntil(
				() =>
					evaluate(cdp, () =>
						Boolean(document.querySelector('.stack-card.active.revealed .card-face.back'))
					),
				options.timeoutMs,
				50
			);
		}
		await delay(200);
		const afterReveal = await activeCardIdentity(cdp);
		const dom = await collectDomSummary(cdp);
		const layout = await collectLayoutEvidence(cdp);
		if (options.screenshots) {
			const filename = `${safeFilename(plan.id)}.jpg`;
			await captureScreenshot(cdp, path.join(screenshotDir, filename), 'viewport');
			screenshot = path.relative(outputDir, path.join(screenshotDir, filename));
		}

		const issues = [];
		if (!documentResponse || documentResponse.status < 200 || documentResponse.status >= 400) {
			issues.push(`document returned HTTP ${documentResponse?.status ?? 'unknown'}`);
		}
		if (!dom.signedIn) issues.push('signed-in account control was absent');
		if (dom.theme !== 'light') issues.push(`active theme was ${dom.theme ?? 'unset'}`);
		if (layout.documentHorizontalOverflow) issues.push('document has horizontal overflow');
		if (consoleErrors.length > 0) issues.push('browser console emitted an error');
		if (pageExceptions.length > 0) issues.push('page emitted an unhandled exception');
		if (network.failedRequests.length > 0) issues.push('a network request failed');
		if (network.errorResponses.length > 0)
			issues.push('a same-origin response returned HTTP 4xx/5xx');
		if (network.unexpectedApiWrites.length > 0)
			issues.push('an unexpected non-Analytics API write occurred');
		if (!reveal || !afterReveal.revealed || afterReveal.answerTextLength < 1) {
			issues.push('the exact flashcard answer was not revealed');
		}
		for (const [phase, actual] of [
			['before reveal', beforeReveal],
			['after reveal', afterReveal]
		]) {
			if (
				actual.cardId !== expected.id ||
				actual.offeringId !== plan.id ||
				actual.topicComponentId !== expected.topicComponentId ||
				actual.contentRevision !== expected.contentRevision ||
				actual.contentHash !== expected.contentHash ||
				actual.promptId !== `${RECALL_PROMPT_PREFIX}${expected.id}`
			) {
				issues.push(`${phase} card identity differed from the immediate exact D1 query`);
			}
		}

		return {
			status: issues.length === 0 ? 'passed' : 'failed',
			url: safeUrl(dom.url),
			documentResponse,
			beforeReveal,
			afterReveal,
			dom,
			layout,
			network: {
				recallReviewRequests: network.recallReviewRequests,
				unexpectedApiWrites: network.unexpectedApiWrites,
				failedRequests: network.failedRequests,
				errorResponses: network.errorResponses
			},
			consoleErrors,
			pageExceptions,
			screenshot,
			issues
		};
	} finally {
		cdp.close();
		await chrome.closeTarget(target.id).catch(() => undefined);
	}
}

async function activeCardIdentity(cdp) {
	return evaluate(cdp, () => {
		const card = document.querySelector('.stack-card.active');
		const prompt = card?.querySelector('[id^="recall-prompt-"]');
		return {
			cardId: card?.getAttribute('data-recall-card-id') ?? null,
			offeringId: card?.getAttribute('data-recall-offering-id') ?? null,
			topicComponentId: card?.getAttribute('data-recall-topic-component-id') ?? null,
			contentRevision: Number(card?.getAttribute('data-recall-content-revision') ?? NaN),
			contentHash: card?.getAttribute('data-recall-content-hash') ?? null,
			promptId: prompt?.id ?? null,
			promptTextLength: prompt?.textContent?.replace(/\s+/g, ' ').trim().length ?? 0,
			answerTextLength:
				card?.querySelector('.card-face.back')?.textContent?.replace(/\s+/g, ' ').trim().length ??
				0,
			revealed: card?.classList.contains('revealed') ?? false
		};
	});
}

export function classifyUnexpectedApiWrite(request, baseUrl) {
	if (!request || ['GET', 'HEAD', 'OPTIONS'].includes(String(request.method).toUpperCase())) {
		return null;
	}
	let requestUrl;
	let origin;
	try {
		requestUrl = new URL(request.url);
		origin = new URL(baseUrl).origin;
	} catch {
		return 'malformed-write-url';
	}
	if (requestUrl.origin !== origin || !requestUrl.pathname.startsWith('/api/')) return null;
	if (requestUrl.pathname === '/api/analytics/events') return null;
	if (requestUrl.pathname === '/api/recall/review') return 'recall-review';
	if (/grade|model|check|summary/i.test(requestUrl.pathname)) return 'learner-model-or-grade';
	return 'unexpected-api-write';
}

async function readForbiddenPersistence() {
	const uid = DISPOSABLE_DEV_AUTH_USER_ID;
	const [personalRows, inventory] = await Promise.all([
		d1Rows(
			`SELECT
			   (SELECT COUNT(*) FROM user_recall_card_reviews WHERE user_id = ?) AS recall_reviews,
			   (SELECT COUNT(*) FROM user_learning_evidence
			     WHERE user_id = ? AND component_kind = 'recall_card') AS recall_evidence`,
			[uid, uid],
			{ binding: 'PERSONAL_DB' }
		),
		devAuthCleanupInventory(uid)
	]);
	return {
		recallReviews: Number(personalRows[0]?.recall_reviews ?? 0),
		recallEvidence: Number(personalRows[0]?.recall_evidence ?? 0),
		modelRuns: Number(inventory.analytics.counts.analytics_model_runs ?? 0)
	};
}

async function cleanDisposableUser() {
	const before = await devAuthCleanupInventory(DISPOSABLE_DEV_AUTH_USER_ID);
	if (!before.schema.personalExact || !before.schema.analyticsExact) {
		throw new Error('Disposable-user cleanup schema inventory drifted.');
	}
	if (!before.analytics.safeToDelete) {
		throw new Error('Disposable-user cleanup found non-development Analytics data.');
	}
	const failures = [];
	try {
		await d1Batch(analyticsCleanupStatements(DISPOSABLE_DEV_AUTH_USER_ID), {
			binding: 'ANALYTICS_DB'
		});
	} catch (error) {
		failures.push(`Analytics cleanup: ${redactHarnessText(error)}`);
	}
	try {
		await d1Batch(personalCleanupStatements(DISPOSABLE_DEV_AUTH_USER_ID), {
			binding: 'PERSONAL_DB'
		});
	} catch (error) {
		failures.push(`Personal cleanup: ${redactHarnessText(error)}`);
	}
	const after = await devAuthCleanupInventory(DISPOSABLE_DEV_AUTH_USER_ID);
	if (after.personal.total !== 0 || after.analytics.total !== 0) {
		failures.push('cleanup verification found remaining directly traceable rows');
	}
	if (failures.length > 0) throw new Error(failures.join('; '));
	return {
		personalRowsRemoved: before.personal.total,
		analyticsDirectRowsRemoved: before.analytics.total,
		verifiedPersonalRowsRemaining: after.personal.total,
		verifiedAnalyticsDirectRowsRemaining: after.analytics.total
	};
}

async function migrationFiles(directory) {
	return (await readdir(directory, { withFileTypes: true }))
		.filter((entry) => entry.isFile() && /^\d+_.+\.sql$/.test(entry.name))
		.map((entry) => entry.name)
		.sort();
}

async function mapLimit(values, concurrency, worker) {
	const results = new Array(values.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, values.length) }, async () => {
			while (next < values.length) {
				const index = next++;
				results[index] = await worker(values[index], index);
			}
		})
	);
	return results;
}

function publicCardIdentity(card) {
	return {
		id: card.id,
		offeringId: card.offeringId,
		topicComponentId: card.topicComponentId,
		curriculumComponentId: card.curriculumComponentId,
		contentRevision: card.contentRevision,
		contentHash: card.contentHash
	};
}

function emptyBrowserResult() {
	return {
		status: 'not-run',
		network: { recallReviewRequests: [], unexpectedApiWrites: [] },
		issues: []
	};
}

export function isSafeLoopbackOrigin(rawUrl) {
	try {
		const url = new URL(rawUrl);
		return (
			url.protocol === 'http:' &&
			['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
			url.username === '' &&
			url.password === '' &&
			url.pathname === '/' &&
			url.search === '' &&
			url.hash === ''
		);
	} catch {
		return false;
	}
}

function optionValue(argument) {
	return argument.slice(argument.indexOf('=') + 1);
}

function positiveInteger(value, argument) {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		throw new Error(`Expected a positive integer: ${argument}`);
	}
	return parsed;
}

function sameOrigin(rawUrl, baseUrl) {
	try {
		return new URL(rawUrl).origin === new URL(baseUrl).origin;
	} catch {
		return false;
	}
}

function safeFilename(value) {
	return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'offering';
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function evidenceToken(value) {
	return value ? sha256(String(value)).slice(0, 16) : null;
}

function redactHarnessText(value) {
	return sanitizeText(String(value)).replaceAll(
		DISPOSABLE_DEV_AUTH_USER_ID,
		'<disposable-dev-user>'
	);
}

function markdownSummary(report) {
	const rows = report.cases
		.map(
			(row) =>
				`| ${row.offering.id} | ${row.offering.course} | ${row.offering.tier} | ${row.cardCount ?? '-'} | ${row.expectedFirstCard?.id ?? '-'} | ${row.status} |`
		)
		.join('\n');
	return `# Study-card offering browser validation

- Status: **${report.status}**
- Exact offerings: **${report.summary.passedCaseCount}/${EXPECTED_STUDY_CARD_OFFERING_IDS.length} passed**
- Recall review requests: **${report.summary.recallReviewRequestCount}**
- Unexpected API writes: **${report.summary.unexpectedApiWriteCount}**
- Stored recall reviews: **${report.summary.storedRecallReviewCount}**
- Stored model runs: **${report.summary.storedModelRunCount}**
- Personal rows after cleanup: **${report.cleanup.after?.verifiedPersonalRowsRemaining ?? 'unknown'}**
- Direct Analytics rows after cleanup: **${report.cleanup.after?.verifiedAnalyticsDirectRowsRemaining ?? 'unknown'}**

| Offering | Course | Tier | Exact cards | Browser card | Status |
| --- | --- | --- | ---: | --- | --- |
${rows}

Each browser case re-queried the production runtime study-card SQL immediately before configuring
the exact disposable learner profile. Real Chrome then opened a flashcard session and revealed the
first card without advancing or reviewing it. The active DOM identity was matched to the exact D1
card id, offering id, topic component, content revision, and content hash.
`;
}
