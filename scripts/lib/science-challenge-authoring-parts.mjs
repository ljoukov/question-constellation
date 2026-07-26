import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { SCIENCE_CHALLENGE_BATCH_SCHEMA, canonicalHash } from './science-challenge-release.mjs';

export function buildScienceChallengeAuthoringParts({ rows, inputs, partSize }) {
	if (!Array.isArray(rows) || rows.length === 0) {
		throw new Error('Multipart authoring rows must be a non-empty array.');
	}
	if (!Array.isArray(inputs) || inputs.length !== rows.length) {
		throw new Error('Multipart authoring inputs must align one-to-one with rows.');
	}
	if (!Number.isInteger(partSize) || partSize < 1 || partSize > rows.length) {
		throw new Error(`Multipart authoring partSize must be an integer from 1 to ${rows.length}.`);
	}
	const rowIds = rows.map((row, index) => {
		const id = row?.id;
		if (typeof id !== 'string' || !id.trim()) {
			throw new Error(`Multipart authoring row ${index + 1} has no id.`);
		}
		if (inputs[index]?.plan?.id !== id) {
			throw new Error(`Multipart authoring input ${index + 1} does not bind row ${id}.`);
		}
		return id;
	});
	if (new Set(rowIds).size !== rowIds.length) {
		throw new Error('Multipart authoring rows contain duplicate ids.');
	}
	const partCount = Math.ceil(rows.length / partSize);
	return Array.from({ length: partCount }, (_, index) => {
		const start = index * partSize;
		const end = Math.min(rows.length, start + partSize);
		const partRows = rows.slice(start, end);
		const partInputs = inputs.slice(start, end);
		return {
			partId: `part-${String(index + 1).padStart(2, '0')}`,
			index: index + 1,
			start,
			end,
			rowIds: partRows.map((row) => row.id),
			rows: partRows,
			inputs: partInputs,
			inputSha256: canonicalHash(partInputs)
		};
	});
}

export function mergeScienceChallengeAuthoringPartBatches({ parts, batches }) {
	const issues = [];
	if (!Array.isArray(parts) || parts.length === 0) {
		return failed(['Multipart merge requires ordered part definitions.']);
	}
	if (!Array.isArray(batches) || batches.length !== parts.length) {
		return failed([
			`Multipart merge expected ${parts.length} candidate batches, found ${
				Array.isArray(batches) ? batches.length : 0
			}.`
		]);
	}
	const challenges = [];
	const seenIds = new Set();
	for (const [partIndex, part] of parts.entries()) {
		const batch = batches[partIndex];
		const prefix = part?.partId ?? `part-${partIndex + 1}`;
		if (
			!batch ||
			typeof batch !== 'object' ||
			Array.isArray(batch) ||
			batch.schemaVersion !== SCIENCE_CHALLENGE_BATCH_SCHEMA ||
			!Array.isArray(batch.challenges)
		) {
			issues.push(`${prefix} did not return ${SCIENCE_CHALLENGE_BATCH_SCHEMA}.`);
			continue;
		}
		if (batch.challenges.length !== part.rowIds.length) {
			issues.push(
				`${prefix} expected ${part.rowIds.length} challenges, found ${batch.challenges.length}.`
			);
		}
		for (const [rowIndex, expectedId] of part.rowIds.entries()) {
			const challenge = batch.challenges[rowIndex];
			const actualId = challenge?.definition?.id;
			if (actualId !== expectedId) {
				issues.push(
					`${prefix} row ${rowIndex + 1} expected ${expectedId}, found ${String(actualId)}.`
				);
			}
			if (typeof actualId === 'string' && seenIds.has(actualId)) {
				issues.push(`${prefix} duplicates challenge id ${actualId} across parts.`);
			}
			if (typeof actualId === 'string') seenIds.add(actualId);
			if (challenge) challenges.push(challenge);
		}
	}
	if (issues.length) return failed(issues);
	return {
		status: 'passed',
		issues: [],
		candidate: {
			schemaVersion: SCIENCE_CHALLENGE_BATCH_SCHEMA,
			challenges
		}
	};
}

export function scienceChallengeMultipartPartPaths(partId) {
	if (!/^part-\d{2}$/.test(String(partId))) {
		throw new Error(`Unsafe multipart authoring part id ${String(partId)}.`);
	}
	const root = path.posix.join('parts', partId);
	return {
		prompt: path.posix.join(root, 'prompt.txt'),
		request: path.posix.join(root, 'request.json'),
		events: path.posix.join(root, 'events.jsonl'),
		lastMessage: path.posix.join(root, 'last-message.json'),
		thoughts: path.posix.join(root, 'thoughts.txt'),
		resultMetadata: path.posix.join(root, 'result-metadata.json'),
		runSummary: path.posix.join(root, 'run-summary.json')
	};
}

export function readScienceChallengeDirectMultipartEvidence({ attemptDir, summary }) {
	if (!summary || typeof summary !== 'object' || !Array.isArray(summary.parts)) {
		throw new Error('Multipart run summary has no ordered parts.');
	}
	return {
		parts: summary.parts.map((record, index) => {
			const expectedPartId = `part-${String(index + 1).padStart(2, '0')}`;
			if (record?.partId !== expectedPartId) {
				throw new Error(`Multipart run summary part ${index + 1} must be ${expectedPartId}.`);
			}
			const relativePaths = scienceChallengeMultipartPartPaths(expectedPartId);
			const absolutePaths = Object.fromEntries(
				Object.entries(relativePaths).map(([key, relativePath]) => [
					key,
					path.join(attemptDir, ...relativePath.split('/'))
				])
			);
			const missing = Object.entries(absolutePaths)
				.filter(([, filePath]) => !existsSync(filePath))
				.map(([key]) => key);
			if (missing.length) {
				throw new Error(`${expectedPartId} is missing multipart evidence: ${missing.join(', ')}.`);
			}
			return {
				record,
				relativePaths,
				absolutePaths,
				summary: JSON.parse(readFileSync(absolutePaths.runSummary, 'utf8')),
				promptBytes: readFileSync(absolutePaths.prompt),
				requestBytes: readFileSync(absolutePaths.request),
				eventLogBytes: readFileSync(absolutePaths.events),
				lastMessageBytes: readFileSync(absolutePaths.lastMessage),
				thoughtsBytes: readFileSync(absolutePaths.thoughts),
				resultMetadataBytes: readFileSync(absolutePaths.resultMetadata)
			};
		})
	};
}

function failed(issues) {
	return { status: 'failed', issues, candidate: null };
}
