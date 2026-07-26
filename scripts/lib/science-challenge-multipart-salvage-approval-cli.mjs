import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SHARD_ID = /^science-\d{3}$/u;

/**
 * Read operator-authored selector approvals without normalizing them. The salvage library remains
 * responsible for checking each exact object against its deterministic approval template.
 */
export function readScienceChallengeMultipartSalvageSourceApprovals({
	paths,
	rootDir,
	selectedShardIds,
	rejectedShardIds
}) {
	if (!Array.isArray(paths)) {
		throw new TypeError('Multipart salvage source approval paths must be an array.');
	}
	const selected = new Set(selectedShardIds ?? []);
	const rejected = new Set(rejectedShardIds ?? []);
	const approvalByShard = new Map();
	for (const [index, suppliedPath] of paths.entries()) {
		if (typeof suppliedPath !== 'string' || !suppliedPath.trim()) {
			throw new Error(`Multipart salvage source approval ${index + 1} path is empty.`);
		}
		const filePath = path.resolve(rootDir, suppliedPath);
		if (!existsSync(filePath)) {
			throw new Error(`Multipart salvage source approval does not exist: ${filePath}`);
		}
		let approval;
		try {
			approval = JSON.parse(readFileSync(filePath, 'utf8'));
		} catch (error) {
			throw new Error(
				`Multipart salvage source approval is invalid JSON: ${filePath}: ${
					error instanceof Error ? error.message : String(error)
				}`,
				{ cause: error }
			);
		}
		if (
			approval === null ||
			typeof approval !== 'object' ||
			Array.isArray(approval) ||
			!SHARD_ID.test(String(approval.shardId ?? ''))
		) {
			throw new Error(`${filePath} has no canonical approval.shardId.`);
		}
		if (!selected.has(approval.shardId) || !rejected.has(approval.shardId)) {
			throw new Error(
				`${filePath} targets ${approval.shardId}, which is outside the selected rejected repair cohort.`
			);
		}
		if (approvalByShard.has(approval.shardId)) {
			throw new Error(`Multiple multipart salvage source approvals target ${approval.shardId}.`);
		}
		approvalByShard.set(approval.shardId, approval);
	}
	return approvalByShard;
}

export function assertScienceChallengeMultipartSalvageApprovalsConsumed({
	approvalByShard,
	consumedShardIds
}) {
	const consumed = new Set(consumedShardIds ?? []);
	const unconsumed = [...(approvalByShard?.keys?.() ?? [])].filter(
		(shardId) => !consumed.has(shardId)
	);
	if (unconsumed.length) {
		throw new Error(
			`Multipart salvage source approval was not consumed by its matching exhausted shard: ${unconsumed.join(
				', '
			)}.`
		);
	}
}
