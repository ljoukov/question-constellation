/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- This release helper validates intentionally untyped external JSON at runtime.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const EXTRACTION_INPUT_DISPOSITION_SCHEMA =
	'selective-paper-extraction-input-disposition-v1';
export const RECOVERED_EXTRACTION_INPUT_SCHEMA = 'codex-recovered-extraction-inputs-v1';
export const RECOVERED_EXTRACTION_INPUT_ARTIFACT_SCHEMA =
	'codex-recovered-extraction-input-recovery-v1';
export const RECOVERED_EXTRACTION_INPUT_ROW_SCHEMA = 'codex-recovered-extraction-input-row-v1';
export const VERIFIED_SOURCE_SNAPSHOT_ATTESTATION_SCHEMA =
	'verified-source-snapshot-attestation-v1';
export const RECOVERED_EXTRACTION_INPUT_ARTIFACT_PATH =
	'docs/release-evidence/recovered-selective-paper-extraction-input-recovery.json';
export const EXPECTED_RECOVERED_EXTRACTION_PAPERS = 8;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function extractionInputsFromSources(sources) {
	return {
		questionPaper: sourceArtifact(sources?.questionPaper),
		markScheme: sourceArtifact(sources?.markScheme),
		supportingDocuments: Array.isArray(sources?.supportingDocuments)
			? sources.supportingDocuments.map(sourceArtifact)
			: []
	};
}

export function auditExtractionInputEvidence({
	rootDir,
	sourceDocumentId,
	extractionPhase,
	expectedInputs,
	verifyLocalFiles = true,
	requireVerifiedModelInputSnapshots = false
}) {
	const issues = [];
	const normalizedExpected = normalizeInputs(expectedInputs, 'expected inputs', issues);
	if (normalizedExpected && verifyLocalFiles) {
		verifyLocalInputFiles(rootDir, normalizedExpected, issues);
	}

	const localPhaseArtifacts = extractionPhase?.phaseArtifacts;
	const recoveredAttestation = extractionPhase?.inputAttestation;
	let mode = 'missing';

	if (localPhaseArtifacts != null) {
		mode = 'preserved-phase-artifacts-v1';
		if (localPhaseArtifacts.schemaVersion !== 'codex-phase-artifacts-v1') {
			issues.push('Local extraction phase-artifact schema is not codex-phase-artifacts-v1.');
		}
		const actual = normalizeInputs(localPhaseArtifacts.inputs, 'local phase inputs', issues);
		if (normalizedExpected && actual && stableJson(actual) !== stableJson(normalizedExpected)) {
			issues.push('Local extraction phase inputs differ from the locked source inputs.');
		}
		const snapshotAttestation = localPhaseArtifacts.inputs?.verifiedModelInputSnapshots ?? null;
		const snapshotAttestationRequired =
			requireVerifiedModelInputSnapshots ||
			extractionPhase?.requireVerifiedModelInputSnapshots === true ||
			Boolean(extractionPhase?.plan?.expectedSourceHashes);
		if (snapshotAttestationRequired && snapshotAttestation == null) {
			issues.push('Pinned extraction inputs have no verified model-input snapshot attestation.');
		}
		if (snapshotAttestation != null) {
			auditVerifiedSourceSnapshotAttestation({
				attestation: snapshotAttestation,
				expectedInputs: normalizedExpected,
				sourceDocumentId,
				issues
			});
		}
		if (recoveredAttestation != null) {
			issues.push('An extraction phase cannot use both local and recovered input evidence.');
		}
	} else if (recoveredAttestation != null) {
		mode = 'recovered-command-attestation-v1';
		auditRecoveredAttestation({
			rootDir,
			sourceDocumentId,
			extractionPhase,
			expectedInputs: normalizedExpected,
			attestation: recoveredAttestation,
			issues
		});
	} else {
		issues.push('Extraction has neither local phase inputs nor a recovered input attestation.');
	}

	return {
		schemaVersion: EXTRACTION_INPUT_DISPOSITION_SCHEMA,
		status: issues.length === 0 ? 'passed' : 'failed',
		mode,
		issues
	};
}

function auditVerifiedSourceSnapshotAttestation({
	attestation,
	expectedInputs,
	sourceDocumentId,
	issues
}) {
	if (
		Object.keys(attestation ?? {})
			.sort()
			.join(',') !== 'schemaVersion,snapshots,sourceDocumentId' ||
		attestation.schemaVersion !== VERIFIED_SOURCE_SNAPSHOT_ATTESTATION_SCHEMA ||
		attestation.sourceDocumentId !== sourceDocumentId
	) {
		issues.push('Verified model-input snapshot attestation identity or schema is invalid.');
		return;
	}
	const snapshots = normalizeInputs(
		attestation.snapshots,
		'verified model-input snapshots',
		issues
	);
	if (
		snapshots &&
		expectedInputs &&
		stableJson(inputHashes(snapshots)) !== stableJson(inputHashes(expectedInputs))
	) {
		issues.push('Verified model-input snapshot hashes differ from the locked source inputs.');
	}
}

function inputHashes(inputs) {
	return {
		questionPaper: inputs.questionPaper.sha256,
		markScheme: inputs.markScheme.sha256,
		supportingDocuments: inputs.supportingDocuments.map((document) => document.sha256)
	};
}

function auditRecoveredAttestation({
	rootDir,
	sourceDocumentId,
	extractionPhase,
	expectedInputs,
	attestation,
	issues
}) {
	if (
		attestation.schemaVersion !== RECOVERED_EXTRACTION_INPUT_SCHEMA ||
		attestation.status !== 'passed' ||
		attestation.sourceDocumentId !== sourceDocumentId
	) {
		issues.push('Recovered extraction input attestation identity or status is invalid.');
	}
	if (
		!validSha256(attestation.rollout?.sha256) ||
		attestation.rollout?.sessionId !== extractionPhase?.run?.threadId ||
		attestation.rollout?.sessionId !== extractionPhase?.rollout?.sessionId ||
		attestation.rollout?.sha256 !== extractionPhase?.rollout?.sha256
	) {
		issues.push('Recovered input attestation is not bound to the extraction rollout.');
	}
	const attestedInputs = normalizeInputs(
		attestation.inputs,
		'recovered attestation inputs',
		issues
	);
	if (
		expectedInputs &&
		attestedInputs &&
		stableJson(attestedInputs) !== stableJson(expectedInputs)
	) {
		issues.push('Recovered attestation inputs differ from the locked source inputs.');
	}

	const artifactRecord = attestation.recoveryArtifact;
	if (
		artifactRecord?.path !== RECOVERED_EXTRACTION_INPUT_ARTIFACT_PATH ||
		!validSha256(artifactRecord?.sha256)
	) {
		issues.push('Recovered input attestation does not reference the exact tracked artifact.');
		return;
	}
	const artifactPath = safeReleasePath(rootDir, artifactRecord.path);
	if (!artifactPath || !existsSync(artifactPath)) {
		issues.push('Tracked recovered extraction input artifact is missing.');
		return;
	}
	const artifactBytes = readFileSync(artifactPath);
	if (sha256(artifactBytes) !== artifactRecord.sha256) {
		issues.push('Tracked recovered extraction input artifact SHA-256 differs.');
		return;
	}
	let artifact;
	try {
		artifact = JSON.parse(artifactBytes.toString('utf8'));
	} catch {
		issues.push('Tracked recovered extraction input artifact is not valid JSON.');
		return;
	}
	auditRecoveryArtifact({
		artifact,
		sourceDocumentId,
		extractionPhase,
		expectedInputs,
		issues
	});
}

function auditRecoveryArtifact({
	artifact,
	sourceDocumentId,
	extractionPhase,
	expectedInputs,
	issues
}) {
	const papers = Array.isArray(artifact?.papers) ? artifact.papers : [];
	const uniqueIds = new Set(papers.map((paper) => paper?.sourceDocumentId));
	const supportingDocumentCount = papers.reduce(
		(total, paper) => total + Number(paper?.inputs?.supportingDocuments?.length ?? 0),
		0
	);
	if (
		artifact?.schemaVersion !== RECOVERED_EXTRACTION_INPUT_ARTIFACT_SCHEMA ||
		artifact?.status !== 'passed' ||
		papers.length !== EXPECTED_RECOVERED_EXTRACTION_PAPERS ||
		uniqueIds.size !== papers.length ||
		artifact?.counts?.papers !== papers.length ||
		artifact?.counts?.questionPapers !== papers.length ||
		artifact?.counts?.markSchemes !== papers.length ||
		artifact?.counts?.supportingDocuments !== supportingDocumentCount
	) {
		issues.push('Tracked recovered extraction input artifact inventory is invalid.');
	}
	for (const paper of papers) auditRecoveryRow(paper, issues);

	const rows = papers.filter((paper) => paper?.sourceDocumentId === sourceDocumentId);
	if (rows.length !== 1) {
		issues.push('Tracked recovered extraction artifact lacks one exact paper row.');
		return;
	}
	const row = rows[0];
	const rowInputs = normalizeInputs(row.inputs, 'recovered artifact row inputs', issues);
	if (expectedInputs && rowInputs && stableJson(rowInputs) !== stableJson(expectedInputs)) {
		issues.push('Recovered artifact row inputs differ from the locked source inputs.');
	}
	if (
		row.extractionRollout?.sessionId !== extractionPhase?.rollout?.sessionId ||
		row.extractionRollout?.sha256 !== extractionPhase?.rollout?.sha256
	) {
		issues.push('Recovered artifact row is not bound to the extraction rollout.');
	}
}

function auditRecoveryRow(row, issues) {
	const rowIssues = [];
	const inputs = normalizeInputs(row?.inputs, 'recovered artifact row inputs', rowIssues);
	const expectedFlags = inputs
		? [
				`--source-document-id=${row.sourceDocumentId}`,
				`--question-paper=${inputs.questionPaper.path}`,
				`--mark-scheme=${inputs.markScheme.path}`,
				...inputs.supportingDocuments.map((document) => `--supporting-document=${document.path}`)
			]
		: [];
	const evidence = row?.commandEvidence;
	const invariants = row?.invariants;
	if (
		row?.schemaVersion !== RECOVERED_EXTRACTION_INPUT_ROW_SCHEMA ||
		row?.status !== 'passed' ||
		!String(row?.sourceDocumentId ?? '').trim() ||
		!validRollout(row?.extractionRollout) ||
		!validRollout(row?.parentOperatorRollout) ||
		!Number.isInteger(Number(evidence?.observation?.lineNumber)) ||
		Number(evidence?.observation?.lineNumber) <= 0 ||
		!String(evidence?.observation?.timestamp ?? '').trim() ||
		![
			'custom_tool_call',
			'function_call',
			'custom_tool_call_output',
			'function_call_output'
		].includes(evidence?.observation?.payloadType) ||
		!String(evidence?.observation?.jsonPath ?? '').trim() ||
		!String(evidence?.observedCommand ?? '').trim() ||
		sha256(Buffer.from(String(evidence?.observedCommand ?? ''))) !==
			evidence?.observedCommandSha256 ||
		!Number.isInteger(Number(evidence?.matchingObservationCount)) ||
		Number(evidence?.matchingObservationCount) <= 0 ||
		!Number.isInteger(Number(evidence?.maximalObservationCount)) ||
		Number(evidence?.maximalObservationCount) <= 0 ||
		Number(evidence?.matchingObservationCount) < Number(evidence?.maximalObservationCount) ||
		Number(evidence?.maximumSupportDocumentCount) !==
			Number(inputs?.supportingDocuments.length ?? -1) ||
		stableJson(evidence?.canonicalInputFlags) !== stableJson(expectedFlags) ||
		sha256(Buffer.from(expectedFlags.join('\n'))) !== evidence?.canonicalInputFlagsSha256 ||
		expectedFlags.some((flag) => !commandContainsCanonicalFlag(evidence?.observedCommand, flag)) ||
		!exactTrueInvariants(invariants)
	) {
		rowIssues.push('Recovered command row evidence or invariants are invalid.');
	}
	if (rowIssues.length > 0) {
		issues.push(`${row?.sourceDocumentId ?? 'unknown recovered paper'}: ${rowIssues.join(' ')}`);
	}
}

function normalizeInputs(value, label, issues) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		issues.push(`${label} are missing.`);
		return null;
	}
	const questionPaper = normalizeArtifact(value.questionPaper);
	const markScheme = normalizeArtifact(value.markScheme);
	const supportingDocuments = Array.isArray(value.supportingDocuments)
		? value.supportingDocuments.map(normalizeArtifact)
		: null;
	if (
		!questionPaper ||
		!markScheme ||
		!supportingDocuments ||
		supportingDocuments.some((document) => document == null) ||
		new Set(supportingDocuments.map((document) => document.path)).size !==
			supportingDocuments.length
	) {
		issues.push(`${label} are not exact path/SHA-256 records.`);
		return null;
	}
	return { questionPaper, markScheme, supportingDocuments };
}

function normalizeArtifact(value) {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		Object.keys(value).sort().join(',') !== 'path,sha256' ||
		!safeRelativePath(value.path) ||
		!validSha256(value.sha256)
	) {
		return null;
	}
	return { path: value.path, sha256: value.sha256 };
}

function verifyLocalInputFiles(rootDir, inputs, issues) {
	for (const artifact of [inputs.questionPaper, inputs.markScheme, ...inputs.supportingDocuments]) {
		const filePath = safeReleasePath(rootDir, artifact.path);
		if (
			!filePath ||
			!existsSync(filePath) ||
			path.extname(filePath).toLowerCase() !== '.pdf' ||
			sha256(readFileSync(filePath)) !== artifact.sha256
		) {
			issues.push(`Locked extraction input is missing or drifted: ${artifact.path}.`);
		}
	}
}

function sourceArtifact(source) {
	return {
		path: source?.localPath ?? null,
		sha256: source?.sha256 ?? null
	};
}

function validRollout(value) {
	return (
		Boolean(String(value?.sessionId ?? '').trim()) &&
		Boolean(String(value?.fileName ?? '').trim()) &&
		validSha256(value?.sha256)
	);
}

function exactTrueInvariants(value) {
	const keys = [
		'allInputFilesExist',
		'allInputHashesPresent',
		'extractionRolloutLinked',
		'markSchemeCountExact',
		'maximalInputSignaturesAgree',
		'parentOperatorRolloutLinked',
		'questionPaperCountExact',
		'sourceDocumentIdExact',
		'supportingDocumentsDeduplicated',
		'uniquePaperRow'
	];
	return (
		value &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		stableJson(Object.keys(value).sort()) === stableJson(keys) &&
		keys.every((key) => value[key] === true)
	);
}

function commandContainsCanonicalFlag(command, flag) {
	const [name, expectedValue] = flag.split(/=(.*)/s);
	const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = String(command ?? '').match(new RegExp(`${escapedName}=([^\\s]+)`));
	if (!match) return false;
	const observedValue = match[1];
	if (name === '--source-document-id') return observedValue === expectedValue;
	return observedValue === expectedValue || observedValue.endsWith(`/${expectedValue}`);
}

function safeReleasePath(rootDir, relativePath) {
	if (!safeRelativePath(relativePath)) return null;
	const root = path.resolve(rootDir);
	const resolved = path.resolve(root, relativePath);
	return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

function safeRelativePath(value) {
	if (!String(value ?? '').trim() || path.isAbsolute(value)) return false;
	const normalized = path.posix.normalize(String(value).replaceAll(path.sep, '/'));
	return normalized === value && normalized !== '..' && !normalized.startsWith('../');
}

function validSha256(value) {
	return SHA256_PATTERN.test(String(value ?? ''));
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	return `{${Object.keys(value)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
		.join(',')}}`;
}
