import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
	ENGLISH_LITERATURE_CUES,
	ENGLISH_LITERATURE_PROMPT_VERSION,
	EnglishLiteratureSourcePlanError,
	buildEnglishLiteraturePostReviewCoverage,
	englishLiteratureCoverageMatrix,
	prepareEnglishLiteratureEvidence,
	validateEnglishLiteratureSourcePlan
} from '../../../scripts/lib/english-literature-study-deck.mjs';
import {
	hashStudyCardArtifact,
	validateStudyCardBundle
} from '../../../scripts/lib/study-card-artifact.mjs';
import { studyCardRuntimeCatalogQuery } from '../server/studyCardCatalogQuery';

const catalog = JSON.parse(readFileSync('data/curricula/curriculum-catalog.json', 'utf8'));
const sourcePlanFixture = JSON.parse(
	readFileSync('data/study-cards/english-literature/ocr-j352-source-plan.json', 'utf8')
);
const deepeningPlanFixture = JSON.parse(
	readFileSync('data/study-cards/english-literature/ocr-j352-deepening-source-plan.json', 'utf8')
);
const deepeningManifestFixture = JSON.parse(
	readFileSync('data/study-cards/english-literature/ocr-j352-deepening-shard-manifest.json', 'utf8')
);
const compilerSource = readFileSync('scripts/generate-english-literature-study-deck.mjs', 'utf8');
const studyCardMigrationSource = readFileSync('migrations/0021_study_card_catalog.sql', 'utf8');
const acceptedArtifactFixture = JSON.parse(
	readFileSync(
		'data/study-cards/releases/ocr-j352-literature-standard-v1/accepted-study-cards.json',
		'utf8'
	)
);

const expectedModesByOption = {
	'Anita and Me': ['plot:ready:2', 'quotation:withheld:0'],
	'Never Let Me Go': ['plot:ready:2', 'quotation:withheld:0'],
	'Animal Farm': ['plot:ready:2', 'quotation:withheld:0'],
	'An Inspector Calls': ['plot:ready:2', 'quotation:withheld:0'],
	'Leave Taking': ['plot:ready:2', 'quotation:withheld:0'],
	DNA: ['plot:ready:2', 'quotation:withheld:0'],
	'Great Expectations': ['plot:ready:2', 'quotation:ready:2'],
	'A Christmas Carol': ['plot:ready:2', 'quotation:ready:2'],
	'Pride and Prejudice': ['plot:ready:2', 'quotation:ready:2'],
	'The War of the Worlds': ['plot:ready:2', 'quotation:ready:2'],
	'The Strange Case of Dr Jekyll and Mr Hyde': ['plot:ready:2', 'quotation:ready:2'],
	'Jane Eyre': ['plot:ready:2', 'quotation:ready:2'],
	'Love and Relationships': ['plot:withheld:0', 'quotation:withheld:2', 'method:ready:3'],
	Conflict: ['plot:withheld:0', 'quotation:withheld:2', 'method:ready:3'],
	'Youth and Age': ['plot:withheld:0', 'quotation:withheld:2', 'method:ready:3'],
	'Romeo and Juliet': ['plot:ready:2', 'quotation:ready:2'],
	'The Merchant of Venice': ['plot:ready:2', 'quotation:ready:2'],
	Macbeth: ['plot:ready:2', 'quotation:ready:2'],
	'Much Ado About Nothing': ['plot:ready:2', 'quotation:ready:2']
};

function freshSourcePlan() {
	return JSON.parse(JSON.stringify(sourcePlanFixture));
}

function syntheticSnapshots(plan: ReturnType<typeof validateEnglishLiteratureSourcePlan>) {
	const snapshots = new Map<string, { body: string; contentType: string }>();
	for (const topic of plan.topics) {
		for (const source of topic.sources) {
			const rows = topic.evidence.filter((row) => row.sourceId === source.id);
			const exactEvidence = [
				...source.verificationAnchors,
				...rows.map((row) => row.anchor ?? row.approvedExcerpt).filter(Boolean)
			];
			snapshots.set(source.id, {
				body: `Verified source snapshot for ${source.title}. ${exactEvidence.join(' Context boundary. ')} End of verified source snapshot.`,
				contentType: 'text/plain'
			});
		}
	}
	return snapshots;
}

describe('OCR J352 English Literature study-deck source plan', () => {
	it('enumerates all 19 selectable options and all 67 evidence rows explicitly', () => {
		const plan = validateEnglishLiteratureSourcePlan(freshSourcePlan(), catalog);
		const matrix = englishLiteratureCoverageMatrix(plan);
		const actualModesByOption = Object.fromEntries(
			plan.topics.map((topic) => [
				topic.title,
				matrix
					.filter((row) => row.topicComponentId === topic.topicComponentId)
					.map(
						(row) =>
							`${row.mode}:${row.status}:${row.status === 'ready' ? row.expectedCardCount : row.partialCardCount}`
					)
			])
		);

		expect(plan.topics).toHaveLength(19);
		expect(plan.topics.flatMap((topic) => topic.sources)).toHaveLength(25);
		expect(plan.topics.flatMap((topic) => topic.evidence)).toHaveLength(67);
		expect(matrix).toHaveLength(41);
		expect(matrix.filter((row) => row.status === 'ready')).toHaveLength(29);
		expect(matrix.filter((row) => row.status === 'withheld')).toHaveLength(12);
		expect(actualModesByOption).toEqual(expectedModesByOption);
		expect(ENGLISH_LITERATURE_PROMPT_VERSION).toBe('ocr-j352-literature-study-deck-compiler-v4');
		expect(ENGLISH_LITERATURE_CUES).not.toContain('📘');
	});

	it('uses the prospective three-or-four choice rule without changing the accepted v2 release', () => {
		expect(compilerSource).toContain('Give three or four unique choices.');
		expect(compilerSource).toContain('use three when a fourth distractor would be contrived');
		expect(compilerSource).toMatch(/minItems:\s*3,\s*maxItems:\s*4/);

		const artifact = validateStudyCardBundle(acceptedArtifactFixture);
		expect(artifact.release.promptVersion).toBe('ocr-j352-literature-study-deck-compiler-v2');
		expect(artifact.cards).toHaveLength(67);
		expect(artifact.coverage).toHaveLength(19);
		expect(artifact.cards.every((card) => [3, 4].includes(card.choices.length))).toBe(true);
		expect(hashStudyCardArtifact(artifact)).toBe(
			'f315f85ca91f288668a3ff54404bc4d52646cd9a7afb647b95df9c08e0fbdb84'
		);
		const repaired = artifact.cards.find(
			(card) => card.id === 'ocr-j352-card-macbeth-plot-murder-sleep'
		);
		expect(repaired?.front).toContain('Act 2 chamber aftermath after Duncan’s killing');
		expect(repaired?.sources[0].sourceExcerpt).toContain('Macbeth does murder sleep');
		expect(repaired?.provenance.supplementalRuns).toEqual(artifact.release.supplementalRuns);
	});

	it('keeps quotation rights fail-closed while retaining lawful partial poetry value', () => {
		const plan = validateEnglishLiteratureSourcePlan(freshSourcePlan(), catalog);
		const modernTitles = new Set([
			'Anita and Me',
			'Never Let Me Go',
			'Animal Farm',
			'An Inspector Calls',
			'Leave Taking',
			'DNA'
		]);
		const poetryTitles = new Set(['Love and Relationships', 'Conflict', 'Youth and Age']);

		for (const topic of plan.topics) {
			const sources = new Map(topic.sources.map((source) => [source.id, source]));
			for (const row of topic.evidence.filter((entry) => entry.mode === 'quotation')) {
				expect(sources.get(row.sourceId)?.retrievalType).toMatch(
					/^public-domain-(?:text|anthology-pdf)$/
				);
				expect(row.requiredAnswer).toBeTruthy();
			}

			if (modernTitles.has(topic.title)) {
				expect(topic.coverage.quotation.status).toBe('withheld');
				expect(topic.evidence.filter((row) => row.mode === 'quotation')).toHaveLength(0);
			}
			if (poetryTitles.has(topic.title)) {
				expect(topic.coverage.plot.status).toBe('withheld');
				expect(topic.coverage.quotation).toMatchObject({
					status: 'withheld',
					partialCardCount: 2
				});
				expect(topic.coverage.method).toMatchObject({ status: 'ready', expectedCardCount: 3 });
				expect(topic.evidence.filter((row) => row.mode === 'method')).toHaveLength(3);
				expect(
					topic.evidence.some((row) => /fifteen poems|1789/iu.test(row.approvedExcerpt ?? ''))
				).toBe(false);
			}
		}
	});

	it('prepares every bounded source row without changing an exact quotation', () => {
		const plan = validateEnglishLiteratureSourcePlan(freshSourcePlan(), catalog);
		const prepared = prepareEnglishLiteratureEvidence(plan, syntheticSnapshots(plan));
		const rows = prepared.topics.flatMap((topic) => topic.evidence);

		expect(rows).toHaveLength(67);
		expect(rows.every((row) => row.excerpt.length > 0 && row.source?.sourceHash)).toBe(true);
		for (const row of rows.filter((entry) => entry.mode === 'quotation')) {
			expect(row.excerpt).toContain(row.requiredAnswer);
		}
	});

	it('allows an attributed licensed web synopsis for plot evidence only', () => {
		const licensed = freshSourcePlan();
		const topic = licensed.topics.find(
			(entry: { title: string }) => entry.title === 'Never Let Me Go'
		);
		topic.sources[0] = {
			id: 'wikipedia-never-let-me-go-plot',
			kind: 'secondary-source',
			retrievalType: 'licensed-web-synopsis',
			url: 'https://en.wikipedia.org/wiki/Never_Let_Me_Go_(novel)',
			title: 'Wikipedia: Never Let Me Go (novel)',
			rightsBasis: 'CC BY-SA 4.0 licensed secondary-source synopsis with attribution.'
		};
		topic.evidence = topic.evidence.map((row: { id: string; mode: string }, index: number) => ({
			id: row.id,
			mode: row.mode,
			sourceId: topic.sources[0].id,
			locator: `Plot synopsis row ${index + 1}`,
			approvedExcerpt:
				index === 0 ? 'The students are raised at Hailsham.' : 'Kathy later becomes Tommy’s carer.'
		}));

		const plan = validateEnglishLiteratureSourcePlan(licensed, catalog);
		const snapshots = syntheticSnapshots(plan);
		snapshots.set(topic.sources[0].id, {
			body: '<html><body>The students are raised at Hailsham. Kathy later becomes Tommy’s carer.</body></html>',
			contentType: 'text/html'
		});
		const prepared = prepareEnglishLiteratureEvidence(plan, snapshots);
		expect(
			prepared.topics.find((entry) => entry.title === 'Never Let Me Go')?.evidence
		).toHaveLength(2);

		const quotationMisuse = freshSourcePlan();
		const quoteTopic = quotationMisuse.topics.find(
			(entry: { title: string }) => entry.title === 'Great Expectations'
		);
		quoteTopic.sources[0].kind = 'secondary-source';
		quoteTopic.sources[0].retrievalType = 'licensed-web-synopsis';
		quoteTopic.evidence[2] = {
			...quoteTopic.evidence[2],
			anchor: undefined,
			requiredAnswer: undefined,
			approvedExcerpt: 'A short licensed synopsis excerpt.'
		};
		expect(() => validateEnglishLiteratureSourcePlan(quotationMisuse, catalog)).toThrow(
			/web synopsis may support plot only/
		);
	});

	it('plans 171 additive plot, quotation and method cards in hash-locked shards', () => {
		const plan = validateEnglishLiteratureSourcePlan(deepeningPlanFixture, catalog);
		const rows = plan.topics.flatMap((topic) =>
			topic.evidence.map((evidence) => ({ ...evidence, topic }))
		);
		const count = (mode: string) => rows.filter((row) => row.mode === mode).length;
		const modernTitles = new Set([
			'Anita and Me',
			'Never Let Me Go',
			'Animal Farm',
			'An Inspector Calls',
			'Leave Taking',
			'DNA'
		]);

		expect(plan.topics).toHaveLength(19);
		expect(plan.topics.flatMap((topic) => topic.sources)).toHaveLength(25);
		expect(rows).toHaveLength(171);
		expect({ plot: count('plot'), quotation: count('quotation'), method: count('method') }).toEqual(
			{ plot: 96, quotation: 72, method: 3 }
		);
		expect(new Set(rows.map((row) => row.id)).size).toBe(171);

		for (const row of rows.filter((entry) => entry.mode === 'quotation')) {
			const source = row.topic.sources.find((candidate) => candidate.id === row.sourceId);
			expect(source?.retrievalType).toMatch(/^public-domain-(?:text|anthology-pdf)$/);
			expect(row.requiredAnswer).toBeTruthy();
		}
		for (const topic of plan.topics.filter((entry) => modernTitles.has(entry.title))) {
			expect(topic.evidence.filter((row) => row.mode === 'plot')).toHaveLength(6);
			expect(topic.evidence.filter((row) => row.mode === 'quotation')).toHaveLength(0);
			expect(topic.coverage.quotation.status).toBe('withheld');
		}
		for (const topic of plan.topics.filter((entry) =>
			['Love and Relationships', 'Conflict', 'Youth and Age'].includes(entry.title)
		)) {
			expect(topic.evidence.filter((row) => row.mode === 'quotation')).toHaveLength(4);
			expect(topic.evidence.filter((row) => row.mode === 'method')).toHaveLength(1);
			expect(topic.coverage.quotation).toMatchObject({
				status: 'withheld',
				partialCardCount: 4
			});
		}
		for (const source of plan.topics.flatMap((topic) => topic.sources)) {
			if (source.retrievalType !== 'licensed-web-synopsis') continue;
			expect(source.kind).toBe('secondary-source');
			expect(source.rightsBasis).toContain('CC BY-SA 4.0');
		}

		expect(deepeningManifestFixture.totalCards).toBe(171);
		expect(deepeningManifestFixture.shards).toHaveLength(13);
		expect(
			deepeningManifestFixture.shards.every(
				(shard: { expectedCardCount: number }) => shard.expectedCardCount <= 20
			)
		).toBe(true);
		for (const shard of deepeningManifestFixture.shards) {
			expect(createHash('sha256').update(readFileSync(shard.sourcePlanPath)).digest('hex')).toBe(
				shard.sourcePlanHash
			);
		}
	});

	it('keeps poetry quotation completeness withheld while making reviewed partial cards runtime-ready', () => {
		const poetryShard = validateEnglishLiteratureSourcePlan(
			JSON.parse(
				readFileSync(
					'data/study-cards/english-literature/deepening-shards/ocr-j352-literature-deepening-13-poetry-public-domain-v1-source-plan.json',
					'utf8'
				)
			),
			catalog
		);
		const independentlyAccepted = poetryShard.topics.flatMap((topic) =>
			topic.evidence.map((row) => ({
				evidenceId: row.id,
				topicComponentId: topic.topicComponentId,
				kind: row.mode
			}))
		);
		const result = buildEnglishLiteraturePostReviewCoverage(poetryShard, independentlyAccepted);
		const poetryTopics = poetryShard.topics.filter((topic) => topic.evidence.length);

		expect(poetryTopics).toHaveLength(3);
		expect(independentlyAccepted).toHaveLength(15);
		expect(result.unexpectedWithheld).toEqual([]);
		expect(result.acceptedCards).toHaveLength(15);
		for (const topic of poetryTopics) {
			expect(
				result.modeMatrix.find(
					(row) => row.topicComponentId === topic.topicComponentId && row.mode === 'quotation'
				)
			).toMatchObject({ status: 'withheld', cardCount: 4 });
			expect(
				result.modeMatrix.find(
					(row) => row.topicComponentId === topic.topicComponentId && row.mode === 'method'
				)
			).toMatchObject({ status: 'ready', cardCount: 1 });
			const standard = result.standardCoverage.find(
				(row) => row.topicComponentId === topic.topicComponentId
			);
			expect(standard).toMatchObject({ status: 'ready', cardCount: 5, reason: null });
			expect(
				result.acceptedCards.filter((card) => card.topicComponentId === topic.topicComponentId)
			).toHaveLength(5);
		}

		expect(compilerSource).toContain("'coverage-mode-matrix.json'");
		expect(studyCardRuntimeCatalogQuery).toContain("coverage.status = 'ready'");
		expect(studyCardMigrationSource).toMatch(
			/coverage\.card_count <> \(\s*SELECT COUNT\(DISTINCT target\.card_id\)/
		);
	});

	it('rejects omitted options, official-source misuse and silently altered quotations', () => {
		const missing = freshSourcePlan();
		missing.topics.pop();
		expect(() => validateEnglishLiteratureSourcePlan(missing, catalog)).toThrow(
			/selectable topic .* is missing/
		);

		const officialMisuse = freshSourcePlan();
		officialMisuse.topics[0].evidence[0].anchor = 'remembered wording';
		expect(() => validateEnglishLiteratureSourcePlan(officialMisuse, catalog)).toThrow(
			/official resource requires approvedExcerpt and forbids anchor\/requiredAnswer/
		);

		const changedQuote = freshSourcePlan();
		const quote = changedQuote.topics
			.flatMap(
				(topic: { evidence: Array<{ mode: string; requiredAnswer?: string }> }) => topic.evidence
			)
			.find((row: { mode: string }) => row.mode === 'quotation');
		quote.requiredAnswer = `${quote.requiredAnswer}!`;
		const changedPlan = validateEnglishLiteratureSourcePlan(changedQuote, catalog);
		expect(() =>
			prepareEnglishLiteratureEvidence(changedPlan, syntheticSnapshots(changedPlan))
		).toThrow(EnglishLiteratureSourcePlanError);
		expect(() =>
			prepareEnglishLiteratureEvidence(changedPlan, syntheticSnapshots(changedPlan))
		).toThrow(/exact quotation answer is absent/);
	});
});
