import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
	exactExistingChainContextSnapshotEvidenceMatches,
	existingChainContextSnapshotDerivation
} from '../../../scripts/lib/existing-chain-context-evidence.mjs';
import {
	collectConsistentIncomingChainDefinitions,
	sharedChainReuseIsSafe
} from '../../../scripts/lib/shared-chain-replacement-policy.mjs';
import { exactSupportingDocumentMetadataMatches } from '../../../scripts/lib/supporting-document-metadata.mjs';
import { OCR_J351_JUNE_2024_ORIGINAL_INVENTORIES } from '../../../scripts/lib/ocr-j351-june-2024-inventory.mjs';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('production import integrity policy', () => {
	it('requires unchanged shared-chain definitions even for reuse_existing alone', () => {
		expect(
			sharedChainReuseIsSafe({
				actions: ['reuse_existing'],
				definitionUnchanged: true
			})
		).toBe(true);
		expect(
			sharedChainReuseIsSafe({
				actions: ['reuse_existing'],
				definitionUnchanged: false
			})
		).toBe(false);
		expect(
			sharedChainReuseIsSafe({
				actions: ['reuse_existing', 'update_existing'],
				definitionUnchanged: true
			})
		).toBe(true);
		expect(
			sharedChainReuseIsSafe({
				actions: ['create_new'],
				definitionUnchanged: true
			})
		).toBe(false);
	});

	it('allows repeated incoming chain ids only when their normalized definitions are identical', () => {
		const base = {
			title: 'Describe   the process',
			canonicalChainText: 'cue → idea',
			summary: 'A reusable chain',
			steps: [
				{
					stepText: 'State the cue',
					stepRole: 'identify',
					explanation: 'Use the source.',
					commonOmission: 'Missing cue'
				}
			]
		};
		const definitions = collectConsistentIncomingChainDefinitions([
			{ chainId: 'shared-chain', definition: base, source: 'paper-a:01.1' },
			{
				chainId: 'shared-chain',
				definition: {
					...base,
					title: ' Describe the process ',
					steps: [{ ...base.steps[0], step_text: 'State the cue', stepText: undefined }]
				},
				source: 'paper-b:02.1'
			}
		]);
		expect(definitions.size).toBe(1);
		expect(definitions.get('shared-chain')?.title).toBe('Describe the process');
	});

	it('rejects a divergent repeated incoming chain id before replacement safety can be evaluated', () => {
		expect(() =>
			collectConsistentIncomingChainDefinitions([
				{
					chainId: 'shared-chain',
					definition: {
						title: 'Describe the process',
						canonicalChainText: 'cue → idea',
						summary: 'A reusable chain',
						steps: [{ stepText: 'State the cue', explanation: 'Use the source.' }]
					},
					source: 'paper-a:01.1'
				},
				{
					chainId: 'shared-chain',
					definition: {
						title: 'Describe the process',
						canonicalChainText: 'cue → idea',
						summary: 'A reusable chain',
						steps: [{ stepText: 'State a different cue', explanation: 'Use the source.' }]
					},
					source: 'paper-b:02.1'
				}
			])
		).toThrow(/shared-chain.*divergent.*paper-a:01\.1 versus paper-b:02\.1/i);
	});

	it('rejects divergent duplicate chain ids before dry-run or write can reach D1', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'shared-chain-import-'));
		roots.push(root);
		const inputPath = path.join(root, 'paper.json');
		writeImportPaper(inputPath, false);
		const accepted = runImportPaper(root, ['--dry-run']);
		expect(accepted.status, accepted.stderr).toBe(0);

		writeImportPaper(inputPath, true);
		for (const flags of [['--dry-run'], []]) {
			const rejected = runImportPaper(root, flags);
			expect(rejected.status).not.toBe(0);
			expect(rejected.stderr).toMatch(/shared-chain.*divergent learner-visible definitions/i);
			expect(rejected.stderr).not.toMatch(/D1 query failed|fetch failed/i);
		}
	});

	it('matches supporting-document metadata only as the exact ordered lock record', () => {
		const expected = [
			{ documentType: 'examiner_report', filename: 'paper-er.pdf' },
			{ documentType: 'insert', filename: 'paper-ins.pdf' }
		];
		expect(exactSupportingDocumentMetadataMatches(structuredClone(expected), expected)).toBe(true);
		expect(
			exactSupportingDocumentMetadataMatches(
				[{ documentType: 'supporting_document', filename: 'paper-er.pdf' }, expected[1]],
				expected
			)
		).toBe(false);
		expect(exactSupportingDocumentMetadataMatches([expected[0]], expected)).toBe(false);
		expect(exactSupportingDocumentMetadataMatches(expected.toReversed(), expected)).toBe(false);
		expect(
			exactSupportingDocumentMetadataMatches(
				expected.map((entry) => ({ ...entry, historicalGuess: true })),
				expected
			)
		).toBe(false);
	});

	it('rejects omitted or mutated existing-chain model snapshot evidence', () => {
		const source = {
			path: 'tmp/run/codex-chains/existing-chain-context-source.json',
			sha256: 'a'.repeat(64),
			canonicalJsonSha256: 'b'.repeat(64)
		};
		const snapshot = {
			...source,
			path: 'tmp/run/codex-chains/existing-chain-context.json'
		};
		const generation = {
			schemaVersion: 'existing-chain-context-input-root-v1',
			inputRoot: 'tmp/import-ready',
			generatedAt: '2026-07-16T12:00:00.000Z'
		};
		const derivation = existingChainContextSnapshotDerivation({
			source,
			snapshot,
			generation
		});
		expect(
			exactExistingChainContextSnapshotEvidenceMatches({
				source,
				snapshot,
				derivation,
				generation
			})
		).toBe(true);
		expect(
			exactExistingChainContextSnapshotEvidenceMatches({
				source,
				snapshot: { ...snapshot, sha256: 'c'.repeat(64) },
				derivation,
				generation
			})
		).toBe(false);
		expect(
			exactExistingChainContextSnapshotEvidenceMatches({
				source,
				snapshot,
				derivation: { ...derivation, snapshot: undefined },
				generation
			})
		).toBe(false);
	});

	it('rebuilds input-root chain context to identical bytes and detects source mutation', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'chain-context-rebuild-'));
		roots.push(root);
		const inputRoot = path.join(root, 'papers');
		mkdirSync(inputRoot, { recursive: true });
		const inputPath = path.join(inputRoot, 'paper.json');
		const generatedAt = '2026-07-16T12:00:00.000Z';
		const outputA = path.join(root, 'context-a.json');
		const outputB = path.join(root, 'context-b.json');
		const outputMutated = path.join(root, 'context-mutated.json');
		writeChainPaper(inputPath, 'Unchanged chain');
		runExistingChainContextBuilder({ inputRoot, output: outputA, generatedAt });
		runExistingChainContextBuilder({ inputRoot, output: outputB, generatedAt });
		expect(readFileSync(outputB)).toEqual(readFileSync(outputA));

		writeChainPaper(inputPath, 'Changed chain');
		runExistingChainContextBuilder({ inputRoot, output: outputMutated, generatedAt });
		expect(readFileSync(outputMutated)).not.toEqual(readFileSync(outputA));
	});

	it.each([
		[['--skip-solvability'], /current Codex solvability/],
		[['--run-legacy-solvability'], /current Codex solvability/],
		[['--skip-r2-upload'], /R2 upload/],
		[
			['--allow-unpublishable-source-drops'],
			/limited to the three reviewed OCR June 2024 copyright-subset papers/
		],
		[['--allow-dropped-questions'], /cannot use --allow-dropped-questions/]
	])('rejects unsafe write flags even during --dry-run: %j', (flags, expectedError) => {
		const root = mkdtempSync(path.join(tmpdir(), 'production-import-policy-'));
		roots.push(root);
		const questionPaper = path.join(root, 'question-paper.pdf');
		const markScheme = path.join(root, 'mark-scheme.pdf');
		writeFileSync(questionPaper, 'question paper');
		writeFileSync(markScheme, 'mark scheme');
		const result = spawnSync(
			process.execPath,
			[
				'scripts/run-codex-production-import-pipeline.mjs',
				`--question-paper=${questionPaper}`,
				`--mark-scheme=${markScheme}`,
				`--source-document-id=integrity-policy-fixture`,
				'--import',
				'--dry-run',
				...flags
			],
			{ cwd: process.cwd(), encoding: 'utf8' }
		);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toMatch(expectedError);
	});

	it('allows the source-drop flag through CLI planning only for an exact locked OCR paper', () => {
		const result = spawnSync(
			process.execPath,
			[
				'scripts/run-codex-production-import-pipeline.mjs',
				'--question-paper=data/ocr-gcse-english-language/question-papers/OCR-J351-01-QP-JUN24.PDF',
				'--mark-scheme=data/ocr-gcse-english-language/mark-schemes/OCR-J351-01-MS-JUN24.PDF',
				'--source-document-id=ocr-j351-01-qp-jun24',
				'--supporting-document=data/ocr-gcse-english-language/examiner-reports/OCR-J351-01-ER-JUN24.PDF',
				'--supporting-document=data/ocr-gcse-english-language/supporting-documents/OCR-J351-01-INSERT-JUN24.PDF',
				'--allow-unpublishable-source-drops',
				'--import',
				'--skip-chain-illustrations',
				'--dry-run'
			],
			{ cwd: process.cwd(), encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(0);
		const planned = JSON.parse(result.stdout);
		expect(planned.plan.cohortLock.path).toBe('data/release/selective-paper-cohort-lock.json');
		expect(planned.plan.allowUnpublishableSourceDrops).toBe(true);
		expect(planned.commands[0]).toContain('--allow-unpublishable-source-drops');
	});

	it('rejects widened OCR copyright rows through the no-model extraction CLI', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'ocr-copyright-drop-cli-'));
		roots.push(root);
		const questionPaper = path.join(root, 'question-paper.pdf');
		const markScheme = path.join(root, 'mark-scheme.pdf');
		writeFileSync(questionPaper, 'diagnostic question paper fixture');
		writeFileSync(markScheme, 'diagnostic mark scheme fixture');

		const exactWorkDir = path.join(root, 'exact');
		writeOcrCopyrightExtractionFixture(exactWorkDir, false);
		const exact = runOcrCopyrightExtraction({
			workDir: exactWorkDir,
			questionPaper,
			markScheme
		});
		expect(exact.status, exact.stderr).toBe(0);

		const widenedWorkDir = path.join(root, 'widened');
		writeOcrCopyrightExtractionFixture(widenedWorkDir, true);
		const widened = runOcrCopyrightExtraction({
			workDir: widenedWorkDir,
			questionPaper,
			markScheme
		});
		expect(widened.status).not.toBe(0);
		expect(widened.stderr).toMatch(/does not match the exact reviewed OCR June 2024/);
	});
});

function runOcrCopyrightExtraction({
	workDir,
	questionPaper,
	markScheme
}: {
	workDir: string;
	questionPaper: string;
	markScheme: string;
}) {
	return spawnSync(
		process.execPath,
		[
			'scripts/run-codex-pdf-extraction.mjs',
			`--question-paper=${questionPaper}`,
			`--mark-scheme=${markScheme}`,
			'--source-document-id=ocr-j351-01-qp-jun24',
			`--work-dir=${workDir}`,
			`--output=${path.join(workDir, 'output.json')}`,
			`--summary=${path.join(workDir, 'summary.json')}`,
			'--expected-marks=120',
			'--expected-questions=8',
			'--allow-unpublishable-source-drops',
			'--reuse-existing-extraction'
		],
		{ cwd: process.cwd(), encoding: 'utf8' }
	);
}

function writeOcrCopyrightExtractionFixture(workDir: string, widenDrops: boolean) {
	mkdirSync(workDir, { recursive: true });
	const inventory = OCR_J351_JUNE_2024_ORIGINAL_INVENTORIES['ocr-j351-01-qp-jun24'];
	const canonicalDropRefs = new Set(['02.0', '03.0', '04.0']);
	const questions = inventory.questions.map((row, index) => {
		const heldOut =
			canonicalDropRefs.has(row.sourceQuestionRef) ||
			(widenDrops && row.sourceQuestionRef === '05.0');
		const promptText = `Respond to source question ${row.sourceQuestionRef}.`;
		return {
			sourceQuestionRef: row.sourceQuestionRef,
			promptText,
			selfContainedPromptText: promptText,
			...(heldOut
				? {
						selfContainment: {
							status: 'source_missing',
							requiresContext: true,
							requiresAssets: true,
							requiredAssetLabels: ['Complete official reading source'],
							requiredSourceCount: 1,
							completeSourceBundle: false
						}
					}
				: {}),
			marks: row.marks,
			pageStart: index + 2,
			pageEnd: index + 2,
			needsHumanReview: heldOut,
			reviewNotes: heldOut
				? [
						'BLOCKED SOURCE DEFECT: the complete learner passage is withheld for third-party copyright and the public source body contains no recoverable complete extract.'
					]
				: ['Complete diagnostic source fixture.'],
			response: {
				kind: 'lines',
				lineCount: Math.max(1, Math.min(row.marks, 20))
			},
			markSchemeItems: [
				{
					itemType: 'mark',
					text: 'Awards the complete response.',
					marks: row.marks
				}
			],
			markChecklist: [
				{
					text: 'Provides a complete supported response.',
					markSchemeItemIndexes: [0],
					required: true
				}
			],
			modelAnswer: {
				answerText: heldOut
					? 'Withheld until the complete official learner source is available.'
					: 'A complete supported diagnostic response.',
				confidence: heldOut ? 0.5 : 1,
				needsHumanReview: heldOut
			}
		};
	});
	writeFileSync(
		path.join(workDir, 'normalized-extraction.json'),
		`${JSON.stringify(
			{
				sourceDocument: {
					id: 'ocr-j351-01-qp-jun24',
					docType: 'question_paper',
					board: 'OCR',
					qualification: 'GCSE',
					subject: 'English Language',
					subjectArea: 'English Language',
					componentCode: 'J351/01',
					pageCount: 16
				},
				markSchemeDocument: {
					id: 'ocr-j351-01-ms-jun24',
					docType: 'mark_scheme',
					pageCount: 22
				},
				questions
			},
			null,
			2
		)}\n`
	);
}

function writeChainPaper(filePath: string, title: string) {
	writeFileSync(
		filePath,
		`${JSON.stringify(
			{
				sourceDocument: { id: 'paper-1', subjectArea: 'Biology' },
				questions: [
					{
						sourceQuestionRef: '01.1',
						marks: 2,
						topicPath: ['Cells'],
						answerChain: {
							id: 'bio-chain-1',
							title,
							canonicalChainText: 'cue -> idea',
							summary: 'Memory cue',
							steps: []
						}
					}
				]
			},
			null,
			2
		)}\n`
	);
}

function writeImportPaper(filePath: string, divergent: boolean) {
	const chain = {
		id: 'shared-chain',
		title: 'Evidence to conclusion',
		canonicalChainText:
			'Identify the relevant evidence, explain why it matters, and state the supported conclusion.',
		summary: 'A reusable evidence-to-conclusion chain.',
		broadTopic: 'Computer Science',
		chainFamilyId: 'evidence-to-conclusion',
		steps: [
			{
				stepText: 'Identify the relevant evidence.',
				stepRole: 'identify',
				explanation: 'Select evidence that answers the exact prompt.',
				commonOmission: 'Using an unrelated detail.',
				markSchemeItemIndexes: [0]
			}
		],
		confidence: 0.95,
		needsHumanReview: false,
		reviewNotes: []
	};
	writeFileSync(
		filePath,
		`${JSON.stringify(
			{
				sourceDocument: {
					id: 'shared-chain-test-paper',
					docType: 'question_paper',
					subject: 'Computer Science',
					subjectArea: 'Computer Science',
					title: 'Shared-chain test paper',
					pageCount: 4
				},
				markSchemeDocument: {
					id: 'shared-chain-test-ms',
					docType: 'mark_scheme',
					subject: 'Computer Science',
					subjectArea: 'Computer Science',
					title: 'Shared-chain test mark scheme',
					pageCount: 4
				},
				questions: [
					{
						sourceQuestionRef: '01.1',
						displayOrder: 1,
						promptText: 'State one purpose of a register.',
						selfContainedPromptText: 'State one purpose of a register.',
						marks: 1,
						pageStart: 2,
						pageEnd: 2,
						topicPath: ['Computer systems'],
						response: {
							kind: 'lines',
							count: 2,
							lineCountEvidence: 'Rendered crop shows 2 ruled lines.'
						},
						markSchemeItems: [
							{ itemType: 'mark', marks: 1, text: 'Stores data currently being used.' }
						],
						markChecklist: [
							{
								text: 'States a valid register purpose.',
								required: true,
								markSchemeItemIndexes: [0]
							}
						],
						modelAnswer: {
							answerText: 'A register stores data currently being used by the CPU.',
							confidence: 0.95,
							needsHumanReview: false
						},
						answerChain: chain,
						needsHumanReview: false
					},
					{
						sourceQuestionRef: '02.1',
						displayOrder: 2,
						promptText: 'Explain one benefit of using hexadecimal.',
						selfContainedPromptText: 'Explain one benefit of using hexadecimal.',
						marks: 2,
						pageStart: 3,
						pageEnd: 3,
						topicPath: ['Data representation'],
						response: {
							kind: 'lines',
							count: 3,
							lineCountEvidence: 'Rendered crop shows 3 ruled lines.'
						},
						markSchemeItems: [
							{ itemType: 'mark', marks: 1, text: 'Hexadecimal is shorter than binary.' },
							{
								itemType: 'mark',
								marks: 1,
								text: 'It is easier for humans to read or transcribe.'
							}
						],
						markChecklist: [
							{
								text: 'Identifies that hexadecimal is shorter.',
								required: true,
								markSchemeItemIndexes: [0]
							},
							{
								text: 'Links this to human readability.',
								required: true,
								markSchemeItemIndexes: [1]
							}
						],
						modelAnswer: {
							answerText:
								'Hexadecimal is shorter than binary, so long values are easier for humans to read.',
							confidence: 0.95,
							needsHumanReview: false
						},
						answerChain: {
							...chain,
							title: ' Evidence   to conclusion ',
							steps: [
								{
									...chain.steps[0],
									stepText: divergent
										? 'Identify different evidence.'
										: ' Identify the relevant evidence. '
								}
							]
						},
						needsHumanReview: false
					}
				]
			},
			null,
			2
		)}\n`
	);
}

function runImportPaper(inputRoot: string, flags: string[]) {
	return spawnSync(
		process.execPath,
		[
			'scripts/import-physics-vision.mjs',
			`--input-root=${inputRoot}`,
			'--paper=shared-chain-test-paper',
			...flags
		],
		{
			cwd: process.cwd(),
			encoding: 'utf8',
			env: {
				...process.env,
				CLOUDFLARE_ACCOUNT_ID: 'shared-chain-test-account',
				CLOUDFLARE_API_TOKEN: 'shared-chain-test-token',
				QUESTION_DB_DATABASE_ID: 'shared-chain-test-database'
			}
		}
	);
}

function runExistingChainContextBuilder({
	inputRoot,
	output,
	generatedAt
}: {
	inputRoot: string;
	output: string;
	generatedAt: string;
}) {
	const result = spawnSync(
		process.execPath,
		[
			'scripts/build-existing-chain-context.mjs',
			`--input-root=${inputRoot}`,
			`--output=${output}`,
			`--generated-at=${generatedAt}`
		],
		{ cwd: process.cwd(), encoding: 'utf8' }
	);
	expect(result.status, result.stderr).toBe(0);
}
