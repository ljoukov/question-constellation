import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { d1Query, d1Rows } from './d1-rest.mjs';

const execFileAsync = promisify(execFile);

export async function imageDimensions(filePath, { rootDir = process.cwd() } = {}) {
	const { stdout } = await execFileAsync('identify', ['-format', '%m %w %h', filePath], {
		cwd: rootDir,
		maxBuffer: 1024 * 1024
	});
	const [format, widthText, heightText] = stdout.trim().split(/\s+/);
	const width = Number(widthText);
	const height = Number(heightText);
	if (!Number.isInteger(width) || !Number.isInteger(height)) {
		throw new Error(`Could not read image dimensions for ${path.relative(rootDir, filePath)}.`);
	}
	return { format: String(format ?? '').toUpperCase(), width, height };
}

export async function hardImageCheck(filePath, options = {}) {
	const { minWidth = 1536, minHeight = 864, rootDir = process.cwd() } = options;
	const issues = [];
	let dimensions = null;
	try {
		dimensions = await imageDimensions(filePath, { rootDir });
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}
	if (dimensions) {
		if (dimensions.format !== 'WEBP')
			issues.push(`Image format is ${dimensions.format}, not WebP.`);
		if (dimensions.width < minWidth || dimensions.height < minHeight) {
			issues.push(`Image is below ${minWidth}x${minHeight}.`);
		}
		if (Math.abs(dimensions.width / dimensions.height - 16 / 9) > 0.015) {
			issues.push('Image is not 16:9 landscape within 1.5%.');
		}
	}
	return {
		status: issues.length ? 'failed' : 'passed',
		width: dimensions?.width ?? null,
		height: dimensions?.height ?? null,
		format: dimensions?.format ?? null,
		sha256: existsSync(filePath) ? fileSha256(filePath) : null,
		issues
	};
}

export async function createIpadPreview(inputPath, outputPath, { rootDir = process.cwd() } = {}) {
	await execFileAsync(
		'convert',
		[inputPath, '-resize', '1024x576!', '-quality', '88', outputPath],
		{ cwd: rootDir, maxBuffer: 4 * 1024 * 1024 }
	);
	return outputPath;
}

export async function assertPublishedIllustrationSource(item, { rootDir = process.cwd() } = {}) {
	const rows = await d1Rows(
		`SELECT ac.id AS answer_chain_id, ac.status AS chain_status,
		        ac.needs_human_review AS chain_review,
		        q.id AS question_id, q.status AS question_status,
		        q.needs_human_review AS question_review,
		        qac.needs_human_review AS membership_review
		 FROM answer_chains ac
		 JOIN questions q ON q.id = ?
		 JOIN question_answer_chains qac
		   ON qac.question_id = q.id AND qac.answer_chain_id = ac.id
		 WHERE ac.id = ?`,
		[item.sourceQuestionId, item.answerChainId],
		{ rootDir }
	);
	const row = rows[0];
	if (
		!row ||
		row.chain_status !== 'published' ||
		row.question_status !== 'published' ||
		Number(row.chain_review) !== 0 ||
		Number(row.question_review) !== 0 ||
		Number(row.membership_review) !== 0
	) {
		throw new Error(`${item.id} must reference a clean published chain and question.`);
	}
}

export async function publishChainIllustration(
	item,
	{
		rootDir = process.cwd(),
		bucketName = 'question-constellation',
		skipR2 = false,
		skipD1 = false,
		verifyR2 = true
	} = {}
) {
	await assertPublishedIllustrationSource(item, { rootDir });
	const hardCheck = await hardImageCheck(item.localPath, { rootDir });
	if (hardCheck.status !== 'passed') {
		throw new Error(`${item.id} failed image checks: ${hardCheck.issues.join(' ')}`);
	}
	if (hardCheck.width !== item.width || hardCheck.height !== item.height) {
		throw new Error(
			`${item.id} dimensions are ${hardCheck.width}x${hardCheck.height}, not ${item.width}x${item.height}.`
		);
	}
	if (!skipR2) {
		await uploadToR2(item, { rootDir, bucketName });
		if (verifyR2)
			await verifyR2Object(item, { rootDir, bucketName, expectedSha256: hardCheck.sha256 });
	}
	if (!skipD1) await publishD1Row(item, { rootDir });
	return { ...hardCheck, r2Key: item.r2Key, publicPath: item.publicPath };
}

export async function uploadToR2(
	item,
	{ rootDir = process.cwd(), bucketName = 'question-constellation' } = {}
) {
	const wrangler = wranglerCommand(rootDir);
	await execFileAsync(
		wrangler,
		[
			'r2',
			'object',
			'put',
			`${bucketName}/${item.r2Key}`,
			'--remote',
			'--file',
			item.localPath,
			'--content-type',
			'image/webp',
			'--cache-control',
			'public, max-age=31536000, immutable',
			'--force'
		],
		{ cwd: rootDir, env: process.env, maxBuffer: 4 * 1024 * 1024 }
	);
}

export async function verifyR2Object(
	item,
	{
		rootDir = process.cwd(),
		bucketName = 'question-constellation',
		expectedSha256 = fileSha256(item.localPath)
	} = {}
) {
	const verifyDir = path.join(os.tmpdir(), 'question-constellation-r2-verify');
	mkdirSync(verifyDir, { recursive: true });
	const verifyPath = path.join(verifyDir, `${process.pid}-${path.basename(item.r2Key)}`);
	try {
		await execFileAsync(
			wranglerCommand(rootDir),
			['r2', 'object', 'get', `${bucketName}/${item.r2Key}`, '--remote', '--file', verifyPath],
			{ cwd: rootDir, env: process.env, maxBuffer: 4 * 1024 * 1024 }
		);
		if (!existsSync(verifyPath) || fileSha256(verifyPath) !== expectedSha256) {
			throw new Error(`R2 verification failed for ${item.r2Key}.`);
		}
	} finally {
		rmSync(verifyPath, { force: true });
	}
}

export async function publishD1Row(item, { rootDir = process.cwd() } = {}) {
	await d1Query(
		`INSERT INTO answer_chain_illustrations (
		   id, answer_chain_id, source_question_id, r2_key, public_path,
		   alt_text, caption, width, height, style_key, prompt_text,
		   generation_metadata_json, source_fingerprint, asset_sha256,
		   generation_model, is_primary, status, needs_human_review,
		   updated_at
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'published', 0, CURRENT_TIMESTAMP)
		 ON CONFLICT(id) DO UPDATE SET
		   answer_chain_id = excluded.answer_chain_id,
		   source_question_id = excluded.source_question_id,
		   r2_key = excluded.r2_key,
		   public_path = excluded.public_path,
		   alt_text = excluded.alt_text,
		   caption = excluded.caption,
		   width = excluded.width,
		   height = excluded.height,
		   style_key = excluded.style_key,
		   prompt_text = excluded.prompt_text,
		   generation_metadata_json = excluded.generation_metadata_json,
		   source_fingerprint = excluded.source_fingerprint,
		   asset_sha256 = excluded.asset_sha256,
		   generation_model = excluded.generation_model,
		   is_primary = 1,
		   status = 'published',
		   needs_human_review = 0,
		   updated_at = CURRENT_TIMESTAMP`,
		[
			item.id,
			item.answerChainId,
			item.sourceQuestionId,
			item.r2Key,
			item.publicPath,
			item.altText,
			item.caption,
			item.width,
			item.height,
			item.styleKey,
			item.promptText,
			JSON.stringify(item.generationMetadata),
			item.sourceFingerprint ?? null,
			item.assetSha256 ?? fileSha256(item.localPath),
			item.generationModel ?? null
		],
		{ rootDir }
	);
}

export function fileSha256(filePath) {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function wranglerCommand(rootDir) {
	const local = path.join(rootDir, 'node_modules/.bin/wrangler');
	return existsSync(local) ? local : 'wrangler';
}
