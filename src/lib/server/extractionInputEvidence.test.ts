import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
	auditExtractionInputEvidence,
	RECOVERED_EXTRACTION_INPUT_ARTIFACT_PATH
} from '../../../scripts/lib/extraction-input-evidence.mjs';
import {
	assertExactOcrEnglishCopyrightSubsetDrops,
	exactOcrEnglishCopyrightSubsetExtractionEvidence,
	exactOcrEnglishCopyrightSubsetDrops,
	expectedOcrEnglishCopyrightSubsetDrops,
	OCR_ENGLISH_JUNE_2024_COPYRIGHT_DROPPED_MARK_TOTAL,
	OCR_ENGLISH_JUNE_2024_COPYRIGHT_DROPPED_QUESTION_COUNT,
	OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_SOURCE_IDS
} from '../../../scripts/lib/ocr-english-copyright-subsets.mjs';
import {
	auditOcrEnglishJune2024OriginalInventory,
	OCR_ENGLISH_JUNE_2024_ORIGINAL_INVENTORIES
} from '../../../scripts/lib/ocr-j351-june-2024-inventory.mjs';

const roots: string[] = [];
type CopyrightSubsetRow = {
	sourceQuestionRef: string;
	marks: number;
	deterministicReason?: string;
	reasons?: string[];
};

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('selective-paper extraction input evidence', () => {
	it('accepts exact local phase inputs and fails after a source byte changes', () => {
		const fixture = sourceFixture();
		const phase = {
			phaseArtifacts: {
				schemaVersion: 'codex-phase-artifacts-v1',
				inputs: fixture.inputs,
				outputs: {}
			}
		};

		expect(
			auditExtractionInputEvidence({
				rootDir: fixture.root,
				sourceDocumentId: 'paper-local',
				extractionPhase: phase,
				expectedInputs: fixture.inputs
			})
		).toMatchObject({ status: 'passed', mode: 'preserved-phase-artifacts-v1', issues: [] });

		writeFileSync(path.join(fixture.root, fixture.inputs.questionPaper.path), 'changed');
		expect(
			auditExtractionInputEvidence({
				rootDir: fixture.root,
				sourceDocumentId: 'paper-local',
				extractionPhase: phase,
				expectedInputs: fixture.inputs
			}).status
		).toBe('failed');
		expect(
			auditExtractionInputEvidence({
				rootDir: fixture.root,
				sourceDocumentId: 'paper-local',
				extractionPhase: phase,
				expectedInputs: fixture.inputs,
				verifyLocalFiles: false
			})
		).toMatchObject({ status: 'passed', mode: 'preserved-phase-artifacts-v1', issues: [] });
	});

	it('accepts only an explicit hash-bound model snapshot mapping', () => {
		const fixture = sourceFixture();
		const snapshotAttestation = {
			schemaVersion: 'verified-source-snapshot-attestation-v1',
			sourceDocumentId: 'paper-local',
			snapshots: {
				questionPaper: {
					path: 'tmp/run/codex-extraction/question-paper.pdf',
					sha256: fixture.inputs.questionPaper.sha256
				},
				markScheme: {
					path: 'tmp/run/codex-extraction/mark-scheme.pdf',
					sha256: fixture.inputs.markScheme.sha256
				},
				supportingDocuments: []
			}
		};
		const phase = {
			plan: { expectedSourceHashes: { questionPaper: fixture.inputs.questionPaper.sha256 } },
			phaseArtifacts: {
				schemaVersion: 'codex-phase-artifacts-v1',
				inputs: {
					...fixture.inputs,
					verifiedModelInputSnapshots: snapshotAttestation
				},
				outputs: {}
			}
		};

		expect(
			auditExtractionInputEvidence({
				rootDir: fixture.root,
				sourceDocumentId: 'paper-local',
				extractionPhase: phase,
				expectedInputs: fixture.inputs
			})
		).toMatchObject({ status: 'passed', issues: [] });

		snapshotAttestation.snapshots.markScheme.sha256 = digest('wrong snapshot');
		expect(
			auditExtractionInputEvidence({
				rootDir: fixture.root,
				sourceDocumentId: 'paper-local',
				extractionPhase: phase,
				expectedInputs: fixture.inputs
			}).issues
		).toContain('Verified model-input snapshot hashes differ from the locked source inputs.');
	});

	it('keeps the canonical cohort snapshot requirement through the real phase-evidence builder', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'selective-paper-phase-evidence-'));
		roots.push(root);
		const projectRoot = process.cwd();
		const lockPath = path.join(projectRoot, 'data/release/selective-paper-cohort-lock.json');
		const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as SelectivePaperCohortLockFixture;
		const manifestRows = lock.papers.map((paper) => {
			const supportingDocuments = lock.supportingDocumentsBySourceId[paper.sourceDocumentId];
			return {
				board: paper.board,
				qualification: 'GCSE',
				subject: paper.subject,
				subject_area: paper.subject,
				paper: paper.component,
				component: paper.component,
				series: paper.series,
				source_document_id: paper.sourceDocumentId,
				question_paper: {
					filename: `${paper.sourceDocumentId}-qp.pdf`,
					document_type: 'question_paper',
					local_path: `data/__release-phase-evidence-fixture__/${paper.sourceDocumentId}-qp.pdf`,
					sha256: paper.questionPaperSha256
				},
				mark_scheme: {
					filename: `${paper.sourceDocumentId}-ms.pdf`,
					document_type: 'mark_scheme',
					local_path: `data/__release-phase-evidence-fixture__/${paper.sourceDocumentId}-ms.pdf`,
					sha256: paper.markSchemeSha256
				},
				examiner_reports: [],
				supporting_documents: supportingDocuments.map((document) => ({
					document_type: document.documentType,
					filename: document.filename,
					local_path: document.localPath,
					sha256: document.sha256
				}))
			};
		});
		const plan = {
			planned: lock.papers.map((paper) => ({
				sourceDocumentId: paper.sourceDocumentId,
				subject: paper.subject,
				paper: paper.component,
				series: paper.series
			}))
		};
		const manifestPath = path.join(root, 'manifest.json');
		const planPath = path.join(root, 'plan.json');
		const primaryWorkRoot = path.join(root, 'runs');
		const outputPath = path.join(root, 'evidence.json');
		const subsetArtifactRoot = path.join(root, 'subsets');
		writeJson(manifestPath, { rows: manifestRows });
		writeJson(planPath, plan);

		const firstPaper = lock.papers[0];
		const firstManifestRow = manifestRows[0];
		const expectedInputs = {
			questionPaper: {
				path: firstManifestRow.question_paper.local_path,
				sha256: firstPaper.questionPaperSha256
			},
			markScheme: {
				path: firstManifestRow.mark_scheme.local_path,
				sha256: firstPaper.markSchemeSha256
			},
			supportingDocuments: firstManifestRow.supporting_documents.map((document) => ({
				path: document.local_path,
				sha256: document.sha256
			}))
		};
		const extractionSummaryPath = path.join(
			primaryWorkRoot,
			firstPaper.sourceDocumentId,
			'codex-extraction-summary.json'
		);
		const extractionSummary = {
			status: 'passed',
			plan: {
				expectedSourceHashes: {
					questionPaper: firstPaper.questionPaperSha256,
					markScheme: firstPaper.markSchemeSha256,
					supportingDocuments: expectedInputs.supportingDocuments.map((document) => document.sha256)
				},
				canonicalSourcePaths: {
					questionPaper: expectedInputs.questionPaper.path,
					markScheme: expectedInputs.markScheme.path,
					supportingDocuments: expectedInputs.supportingDocuments.map((document) => document.path)
				}
			},
			phaseArtifacts: {
				schemaVersion: 'codex-phase-artifacts-v1',
				inputs: expectedInputs,
				outputs: {}
			}
		};
		writeJson(extractionSummaryPath, extractionSummary);

		runCohortEvidenceBuilder({
			projectRoot,
			manifestPath,
			planPath,
			lockPath,
			primaryWorkRoot,
			outputPath,
			subsetArtifactRoot
		});
		let evidence = JSON.parse(readFileSync(outputPath, 'utf8'));
		let extraction = evidence.papers[0].phases.extraction;
		expect(extraction.requireVerifiedModelInputSnapshots).toBe(true);
		expect(extraction.plan.expectedSourceHashes).toEqual(
			extractionSummary.plan.expectedSourceHashes
		);
		expect(extraction.extractionInputDisposition).toBeUndefined();
		expect(evidence.papers[0].extractionInputDisposition.issues).toContain(
			'Pinned extraction inputs have no verified model-input snapshot attestation.'
		);

		const extractionSummaryWithAttestation = {
			...extractionSummary,
			phaseArtifacts: {
				...extractionSummary.phaseArtifacts,
				inputs: {
					...expectedInputs,
					verifiedModelInputSnapshots: {
						schemaVersion: 'verified-source-snapshot-attestation-v1',
						sourceDocumentId: firstPaper.sourceDocumentId,
						snapshots: {
							questionPaper: {
								path: 'tmp/verified/question-paper.pdf',
								sha256: expectedInputs.questionPaper.sha256
							},
							markScheme: {
								path: 'tmp/verified/mark-scheme.pdf',
								sha256: expectedInputs.markScheme.sha256
							},
							supportingDocuments: expectedInputs.supportingDocuments.map((document, index) => ({
								path: `tmp/verified/supporting-${index + 1}.pdf`,
								sha256: document.sha256
							}))
						}
					}
				}
			}
		};
		writeJson(extractionSummaryPath, extractionSummaryWithAttestation);
		runCohortEvidenceBuilder({
			projectRoot,
			manifestPath,
			planPath,
			lockPath,
			primaryWorkRoot,
			outputPath,
			subsetArtifactRoot
		});
		evidence = JSON.parse(readFileSync(outputPath, 'utf8'));
		extraction = evidence.papers[0].phases.extraction;
		expect(extraction.requireVerifiedModelInputSnapshots).toBe(true);
		expect(evidence.papers[0].extractionInputDisposition.issues).not.toContain(
			'Pinned extraction inputs have no verified model-input snapshot attestation.'
		);
	});

	it('uses the exact locked J351/01 ER identity in extraction metadata planning', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'ocr-support-identity-'));
		roots.push(root);
		const questionPaperPath = path.join(root, 'OCR-J351-01-QP-JUN24.PDF');
		const markSchemePath = path.join(root, 'OCR-J351-01-MS-JUN24.PDF');
		const examinerReportPath = path.join(root, 'OCR-J351-01-ER-JUN24.PDF');
		writeFileSync(questionPaperPath, 'question paper');
		writeFileSync(markSchemePath, 'mark scheme');
		writeFileSync(examinerReportPath, 'examiner report');

		const result = spawnSync(
			process.execPath,
			[
				'scripts/run-codex-pdf-extraction.mjs',
				`--question-paper=${questionPaperPath}`,
				`--mark-scheme=${markSchemePath}`,
				`--supporting-document=${examinerReportPath}`,
				'--source-document-id=ocr-j351-01-qp-jun24',
				`--expected-question-paper-sha256=${digest(readFileSync(questionPaperPath))}`,
				`--expected-mark-scheme-sha256=${digest(readFileSync(markSchemePath))}`,
				`--expected-supporting-document-sha256=${digest(readFileSync(examinerReportPath))}`,
				`--canonical-question-paper=${questionPaperPath}`,
				`--canonical-mark-scheme=${markSchemePath}`,
				`--canonical-supporting-document=${examinerReportPath}`,
				'--supporting-document-type=examiner_report',
				'--supporting-document-filename=OCR-J351-01-ER-JUN24.PDF',
				'--dry-run'
			],
			{ cwd: process.cwd(), encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(0);
		const dryRun = JSON.parse(result.stdout);
		expect(dryRun.plan.supportingDocumentMetadata).toEqual([
			{
				documentType: 'examiner_report',
				filename: 'OCR-J351-01-ER-JUN24.PDF'
			}
		]);
	});

	it('recomputes the tracked eight-paper command artifact and rollout link', () => {
		const fixture = sourceFixture();
		const extractionRollout = {
			sessionId: 'extraction-session-0',
			fileName: 'rollout-extraction-session-0.jsonl',
			sha256: digest('extraction-rollout-0')
		};
		const papers = Array.from({ length: 8 }, (_, index) =>
			recoveryRow({
				index,
				inputs: index === 0 ? fixture.inputs : syntheticInputs(index),
				extractionRollout:
					index === 0
						? extractionRollout
						: {
								sessionId: `extraction-session-${index}`,
								fileName: `rollout-extraction-session-${index}.jsonl`,
								sha256: digest(`extraction-rollout-${index}`)
							}
			})
		);
		const artifact = {
			schemaVersion: 'codex-recovered-extraction-input-recovery-v1',
			status: 'passed',
			basis: 'fixture',
			config: { path: 'fixture.json', sha256: digest('fixture') },
			counts: { papers: 8, questionPapers: 8, markSchemes: 8, supportingDocuments: 0 },
			papers
		};
		const artifactPath = path.join(fixture.root, RECOVERED_EXTRACTION_INPUT_ARTIFACT_PATH);
		mkdirSync(path.dirname(artifactPath), { recursive: true });
		writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
		const artifactSha256 = digest(readFileSync(artifactPath));
		const phase = {
			run: { threadId: extractionRollout.sessionId },
			rollout: extractionRollout,
			inputAttestation: {
				schemaVersion: 'codex-recovered-extraction-inputs-v1',
				status: 'passed',
				sourceDocumentId: 'paper-0',
				rollout: {
					sessionId: extractionRollout.sessionId,
					sha256: extractionRollout.sha256
				},
				recoveryArtifact: {
					path: RECOVERED_EXTRACTION_INPUT_ARTIFACT_PATH,
					sha256: artifactSha256
				},
				inputs: fixture.inputs
			}
		};

		expect(
			auditExtractionInputEvidence({
				rootDir: fixture.root,
				sourceDocumentId: 'paper-0',
				extractionPhase: phase,
				expectedInputs: fixture.inputs
			})
		).toMatchObject({ status: 'passed', mode: 'recovered-command-attestation-v1' });

		phase.rollout.sha256 = digest('different rollout');
		expect(
			auditExtractionInputEvidence({
				rootDir: fixture.root,
				sourceDocumentId: 'paper-0',
				extractionPhase: phase,
				expectedInputs: fixture.inputs
			}).status
		).toBe('failed');
	});
});

describe('OCR English exact copyright subsets', () => {
	it('locks three paper identities and exactly nine rows / 116 marks', () => {
		expect(OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_SOURCE_IDS).toEqual([
			'ocr-j351-01-qp-jun24',
			'ocr-j351-02-qp-jun24',
			'ocr-j352-01-qp-jun24'
		]);
		expect(OCR_ENGLISH_JUNE_2024_COPYRIGHT_DROPPED_QUESTION_COUNT).toBe(9);
		expect(OCR_ENGLISH_JUNE_2024_COPYRIGHT_DROPPED_MARK_TOTAL).toBe(116);
		expect(
			exactOcrEnglishCopyrightSubsetDrops('ocr-j352-01-qp-jun24', [
				{ sourceQuestionRef: '17.1', marks: 40, reasons: ['ignored by projection'] }
			])
		).toBe(true);
		expect(
			exactOcrEnglishCopyrightSubsetDrops('ocr-j352-01-qp-jun24', [
				{ sourceQuestionRef: '17.1', marks: 40 },
				{ sourceQuestionRef: '18.1', marks: 40 }
			])
		).toBe(false);
	});

	it('requires the full locked original inventory before accepting the exact OCR drop rows', () => {
		const sourceDocumentId = 'ocr-j351-01-qp-jun24';
		const originalQuestions = structuredClone(
			OCR_ENGLISH_JUNE_2024_ORIGINAL_INVENTORIES[sourceDocumentId].questions
		);
		const originalInventoryLock = auditOcrEnglishJune2024OriginalInventory({
			sourceDocumentId,
			questions: originalQuestions
		});
		const droppedRows = expectedOcrEnglishCopyrightSubsetDrops(sourceDocumentId);
		expect(() =>
			assertExactOcrEnglishCopyrightSubsetDrops({
				sourceDocumentId,
				originalInventoryLock,
				droppedRows
			})
		).not.toThrow();
		expect(() =>
			assertExactOcrEnglishCopyrightSubsetDrops({
				sourceDocumentId,
				originalInventoryLock: auditOcrEnglishJune2024OriginalInventory({
					sourceDocumentId,
					questions: originalQuestions.slice(1)
				}),
				droppedRows
			})
		).toThrow(/exact reviewed OCR/);
		expect(() =>
			assertExactOcrEnglishCopyrightSubsetDrops({
				sourceDocumentId,
				originalInventoryLock,
				droppedRows: [...droppedRows!, { sourceQuestionRef: '05.0', marks: 40 }]
			})
		).toThrow(/exact reviewed OCR/);
	});

	it('rejects any widened, reordered, or retained-output OCR subset evidence', () => {
		const sourceDocumentId = 'ocr-j351-01-qp-jun24';
		const fixture = exactCopyrightSubsetFixture(sourceDocumentId);
		expect(
			exactOcrEnglishCopyrightSubsetExtractionEvidence({
				sourceDocumentId,
				...fixture
			})
		).toBe(true);

		const widened = structuredClone(fixture);
		widened.extractionSummary.droppedExtractionQuestions.push({
			sourceQuestionRef: '05.0',
			marks: 40,
			deterministicReason: 'known_unresolved_copyright_source',
			reasons: ['known_unresolved_copyright_source']
		});
		expect(
			exactOcrEnglishCopyrightSubsetExtractionEvidence({
				sourceDocumentId,
				...widened
			})
		).toBe(false);

		const reordered = structuredClone(fixture);
		reordered.extractionSummary.droppedExtractionQuestions.reverse();
		reordered.extractionSummary.publishableSubset.dropped.questions.reverse();
		reordered.retainedPaper.extractionRun.droppedUnpublishableSourceQuestions.reverse();
		reordered.retainedPaper.extractionRun.droppedUnpublishableSourceQuestionRefs.reverse();
		expect(
			exactOcrEnglishCopyrightSubsetExtractionEvidence({
				sourceDocumentId,
				...reordered
			})
		).toBe(false);

		const retainedUnexpectedQuestion = structuredClone(fixture);
		const leakedQuestion = retainedUnexpectedQuestion.originalPaper.questions.find(
			(question: { sourceQuestionRef: string }) => question.sourceQuestionRef === '02.0'
		);
		expect(leakedQuestion).toBeDefined();
		retainedUnexpectedQuestion.retainedPaper.questions.push(leakedQuestion!);
		expect(
			exactOcrEnglishCopyrightSubsetExtractionEvidence({
				sourceDocumentId,
				...retainedUnexpectedQuestion
			})
		).toBe(false);
	});
});

function exactCopyrightSubsetFixture(sourceDocumentId: string) {
	const originalQuestions = structuredClone(
		OCR_ENGLISH_JUNE_2024_ORIGINAL_INVENTORIES[sourceDocumentId].questions
	) as CopyrightSubsetRow[];
	const expectedDrops = structuredClone(
		expectedOcrEnglishCopyrightSubsetDrops(sourceDocumentId)!
	) as CopyrightSubsetRow[];
	const droppedRefs = new Set(expectedDrops.map((row) => row.sourceQuestionRef));
	const retainedQuestions = originalQuestions.filter(
		(question) => !droppedRefs.has(question.sourceQuestionRef)
	);
	const droppedRows = expectedDrops.map((row) => ({
		...row,
		deterministicReason: 'known_unresolved_copyright_source',
		reasons: ['known_unresolved_copyright_source']
	}));
	const originalInventoryLock = auditOcrEnglishJune2024OriginalInventory({
		sourceDocumentId,
		questions: originalQuestions
	});
	const originalMarkTotal = originalQuestions.reduce((total, row) => total + row.marks, 0);
	const retainedMarkTotal = retainedQuestions.reduce((total, row) => total + row.marks, 0);
	const droppedMarkTotal = droppedRows.reduce((total, row) => total + row.marks, 0);
	return {
		extractionSummary: {
			originalInventoryLock,
			droppedExtractionQuestions: structuredClone(droppedRows),
			publishableSubset: {
				status: 'passed',
				policy: 'known_unresolved_copyright_source_only_v1',
				original: {
					questionCount: originalQuestions.length,
					markTotal: originalMarkTotal
				},
				retained: {
					questionCount: retainedQuestions.length,
					markTotal: retainedMarkTotal
				},
				dropped: {
					questionCount: droppedRows.length,
					markTotal: droppedMarkTotal,
					questions: structuredClone(droppedRows)
				},
				invariants: {
					questionCountConserved: true,
					markTotalConserved: true,
					onlyKnownUnresolvedCopyrightSource: true
				}
			}
		},
		originalPaper: {
			sourceDocument: { id: sourceDocumentId },
			questions: originalQuestions
		},
		retainedPaper: {
			sourceDocument: { id: sourceDocumentId },
			questions: retainedQuestions,
			extractionRun: {
				publishableSubset: true,
				droppedUnpublishableSourceQuestions: structuredClone(droppedRows),
				droppedUnpublishableSourceQuestionRefs: expectedDrops.map((row) => row.sourceQuestionRef)
			}
		}
	};
}

function sourceFixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'extraction-input-evidence-'));
	roots.push(root);
	const questionPaperPath = 'data/question-paper.pdf';
	const markSchemePath = 'data/mark-scheme.pdf';
	mkdirSync(path.join(root, 'data'), { recursive: true });
	writeFileSync(path.join(root, questionPaperPath), 'question paper bytes');
	writeFileSync(path.join(root, markSchemePath), 'mark scheme bytes');
	return {
		root,
		inputs: {
			questionPaper: {
				path: questionPaperPath,
				sha256: digest(readFileSync(path.join(root, questionPaperPath)))
			},
			markScheme: {
				path: markSchemePath,
				sha256: digest(readFileSync(path.join(root, markSchemePath)))
			},
			supportingDocuments: []
		}
	};
}

function syntheticInputs(index: number) {
	return {
		questionPaper: { path: `data/question-${index}.pdf`, sha256: digest(`question-${index}`) },
		markScheme: { path: `data/mark-${index}.pdf`, sha256: digest(`mark-${index}`) },
		supportingDocuments: []
	};
}

function recoveryRow({
	index,
	inputs,
	extractionRollout
}: {
	index: number;
	inputs: ReturnType<typeof syntheticInputs>;
	extractionRollout: { sessionId: string; fileName: string; sha256: string };
}) {
	const sourceDocumentId = `paper-${index}`;
	const flags = [
		`--source-document-id=${sourceDocumentId}`,
		`--question-paper=${inputs.questionPaper.path}`,
		`--mark-scheme=${inputs.markScheme.path}`
	];
	const observedCommand = `node pipeline.mjs ${flags.join(' ')}`;
	return {
		schemaVersion: 'codex-recovered-extraction-input-row-v1',
		status: 'passed',
		sourceDocumentId,
		extractionRollout,
		parentOperatorRollout: {
			sessionId: 'parent-session',
			fileName: 'rollout-parent-session.jsonl',
			sha256: digest('parent-rollout')
		},
		commandEvidence: {
			observation: {
				lineNumber: index + 1,
				timestamp: '2026-07-16T00:00:00.000Z',
				payloadType: 'custom_tool_call_output',
				jsonPath: '$.output[0].text',
				segmentIndex: 0
			},
			observedCommand,
			observedCommandSha256: digest(observedCommand),
			matchingObservationCount: 1,
			maximalObservationCount: 1,
			maximumSupportDocumentCount: 0,
			canonicalInputFlags: flags,
			canonicalInputFlagsSha256: digest(flags.join('\n'))
		},
		inputs,
		invariants: {
			uniquePaperRow: true,
			sourceDocumentIdExact: true,
			questionPaperCountExact: true,
			markSchemeCountExact: true,
			supportingDocumentsDeduplicated: true,
			maximalInputSignaturesAgree: true,
			allInputFilesExist: true,
			allInputHashesPresent: true,
			extractionRolloutLinked: true,
			parentOperatorRolloutLinked: true
		}
	};
}

function digest(value: string | NodeJS.ArrayBufferView) {
	return createHash('sha256').update(value).digest('hex');
}

type SelectivePaperCohortLockFixture = {
	papers: Array<{
		sourceDocumentId: string;
		board: string;
		subject: string;
		component: string;
		series: string;
		questionPaperSha256: string;
		markSchemeSha256: string;
	}>;
	supportingDocumentsBySourceId: Record<
		string,
		Array<{
			documentType: string;
			filename: string;
			localPath: string;
			sha256: string;
		}>
	>;
};

function writeJson(filePath: string, value: unknown) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runCohortEvidenceBuilder({
	projectRoot,
	manifestPath,
	planPath,
	lockPath,
	primaryWorkRoot,
	outputPath,
	subsetArtifactRoot
}: {
	projectRoot: string;
	manifestPath: string;
	planPath: string;
	lockPath: string;
	primaryWorkRoot: string;
	outputPath: string;
	subsetArtifactRoot: string;
}) {
	const result = spawnSync(
		process.execPath,
		[
			'scripts/build-selective-paper-cohort-evidence.mjs',
			`--manifest=${manifestPath}`,
			`--plan=${planPath}`,
			`--cohort-lock=${lockPath}`,
			`--primary-work-root=${primaryWorkRoot}`,
			`--output=${outputPath}`,
			`--subset-artifact-root=${subsetArtifactRoot}`,
			'--allow-incomplete'
		],
		{ cwd: projectRoot, encoding: 'utf8' }
	);
	expect(result.status, result.stderr).toBe(0);
}
