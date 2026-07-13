import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { d1Query, d1Rows } from './d1-rest.mjs';

const execFileAsync = promisify(execFile);

/** @typedef {'dark' | 'light'} IllustrationTheme */

/**
 * @typedef {object} IllustrationAsset
 * @property {string} localPath
 * @property {string} r2Key
 * @property {string} publicPath
 * @property {number} width
 * @property {number} height
 * @property {string} promptText
 * @property {string | null | undefined} [assetSha256]
 * @property {string | null | undefined} [promptSha256]
 * @property {string | null | undefined} [derivedFromAssetSha256]
 */

/**
 * @typedef {IllustrationAsset & {theme: IllustrationTheme}} IllustrationVariant
 */

/**
 * @typedef {object} IllustrationPublishItem
 * @property {string} id
 * @property {string} answerChainId
 * @property {string} sourceQuestionId
 * @property {IllustrationAsset} dark
 * @property {IllustrationAsset & {derivedFromAssetSha256: string}} light
 * @property {string} altText
 * @property {string | null | undefined} caption
 * @property {string} styleKey
 * @property {unknown} generationMetadata
 * @property {string | null | undefined} [sourceFingerprint]
 * @property {string | null | undefined} [generationModel]
 */

/**
 * @param {string} filePath
 * @param {{rootDir?: string}} [options]
 */
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

/**
 * @param {string} filePath
 * @param {{minWidth?: number, minHeight?: number, rootDir?: string}} [options]
 */
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

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{rootDir?: string}} [options]
 */
export async function createIpadPreview(inputPath, outputPath, { rootDir = process.cwd() } = {}) {
	await execFileAsync(
		'convert',
		[inputPath, '-resize', '1024x576!', '-quality', '88', outputPath],
		{ cwd: rootDir, maxBuffer: 4 * 1024 * 1024 }
	);
	return outputPath;
}

/**
 * @param {IllustrationPublishItem} item
 * @param {{rootDir?: string}} [options]
 */
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

/**
 * @param {IllustrationPublishItem} item
 * @param {{rootDir?: string, bucketName?: string, skipR2?: boolean, skipD1?: boolean, verifyR2?: boolean}} [options]
 */
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
	const pair = illustrationThemePair(item);
	const light = pair[1];
	const [darkCheck, lightCheck] = await Promise.all(
		pair.map((variant) => hardImageCheck(variant.localPath, { rootDir }))
	);
	for (const [index, hardCheck] of [darkCheck, lightCheck].entries()) {
		const variant = pair[index];
		if (hardCheck.status !== 'passed') {
			throw new Error(
				`${item.id} ${variant.theme} image failed checks: ${hardCheck.issues.join(' ')}`
			);
		}
		if (hardCheck.width !== variant.width || hardCheck.height !== variant.height) {
			throw new Error(
				`${item.id} ${variant.theme} image dimensions are ${hardCheck.width}x${hardCheck.height}, not ${variant.width}x${variant.height}.`
			);
		}
		if (variant.assetSha256 && variant.assetSha256 !== hardCheck.sha256) {
			throw new Error(`${item.id} ${variant.theme} asset SHA-256 does not match its local file.`);
		}
	}
	if (darkCheck.width !== lightCheck.width || darkCheck.height !== lightCheck.height) {
		throw new Error(`${item.id} dark and light images must have identical dimensions.`);
	}
	if (light.derivedFromAssetSha256 !== darkCheck.sha256) {
		throw new Error(
			`${item.id} light image must identify the verified dark asset it was edited from.`
		);
	}
	if (!skipR2) {
		for (const [index, variant] of pair.entries()) {
			await uploadToR2(variant, { rootDir, bucketName });
			if (verifyR2) {
				await verifyR2Object(variant, {
					rootDir,
					bucketName,
					expectedSha256: [darkCheck, lightCheck][index].sha256 ?? fileSha256(variant.localPath)
				});
			}
		}
	}
	if (!skipD1) await publishD1Row(item, { rootDir });
	return {
		status: 'passed',
		width: darkCheck.width,
		height: darkCheck.height,
		variants: {
			dark: { ...darkCheck, r2Key: item.dark.r2Key, publicPath: item.dark.publicPath },
			light: {
				...lightCheck,
				r2Key: item.light.r2Key,
				publicPath: item.light.publicPath
			}
		}
	};
}

/**
 * @param {IllustrationPublishItem} item
 * @returns {[IllustrationVariant, IllustrationVariant]}
 */
export function illustrationThemePair(item) {
	const dark = illustrationVariant(item, 'dark', item.dark);
	const light = illustrationVariant(item, 'light', item.light);
	if (dark.localPath === light.localPath) {
		throw new Error(`${item.id} dark and light images must use different local files.`);
	}
	if (dark.r2Key === light.r2Key || dark.publicPath === light.publicPath) {
		throw new Error(`${item.id} dark and light images must use different R2 objects.`);
	}
	if (!light.derivedFromAssetSha256?.trim()) {
		throw new Error(`${item.id} light derivedFromAssetSha256 is required.`);
	}
	if (dark.assetSha256 && light.derivedFromAssetSha256 !== dark.assetSha256) {
		throw new Error(`${item.id} light image must identify the dark asset it was edited from.`);
	}
	return [dark, light];
}

/**
 * @param {IllustrationPublishItem} item
 * @param {IllustrationTheme} theme
 * @param {IllustrationAsset} variant
 * @returns {IllustrationVariant}
 */
function illustrationVariant(item, theme, variant) {
	/** @type {Array<[string, string]>} */
	const requiredFields = [
		['localPath', variant?.localPath],
		['r2Key', variant?.r2Key],
		['publicPath', variant?.publicPath],
		['promptText', variant?.promptText]
	];
	for (const [field, value] of requiredFields) {
		if (typeof value !== 'string' || !value.trim()) {
			throw new Error(`${item.id} ${theme} ${field} is required.`);
		}
	}
	if (!Number.isInteger(variant.width) || variant.width < 1) {
		throw new Error(`${item.id} ${theme} width must be a positive integer.`);
	}
	if (!Number.isInteger(variant.height) || variant.height < 1) {
		throw new Error(`${item.id} ${theme} height must be a positive integer.`);
	}
	return { ...variant, theme };
}

/**
 * @param {IllustrationAsset | IllustrationVariant} item
 * @param {{rootDir?: string, bucketName?: string}} [options]
 */
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

/**
 * @param {IllustrationAsset | IllustrationVariant} item
 * @param {{rootDir?: string, bucketName?: string, expectedSha256?: string}} [options]
 */
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

/**
 * @param {IllustrationPublishItem} item
 * @param {{rootDir?: string}} [options]
 */
export async function publishD1Row(item, { rootDir = process.cwd() } = {}) {
	const upsert = illustrationUpsert(item);
	await d1Query(upsert.sql, upsert.params, { rootDir });
}

/**
 * @param {IllustrationPublishItem} item
 * @returns {{sql: string, params: Array<string | number | boolean | null>}}
 */
export function illustrationUpsert(item) {
	const [dark, light] = illustrationThemePair(item);
	return {
		sql: `INSERT INTO answer_chain_illustrations (
		   id, answer_chain_id, source_question_id, r2_key, public_path,
		   alt_text, caption, width, height, style_key, prompt_text,
		   generation_metadata_json, source_fingerprint, asset_sha256,
		   generation_model, light_r2_key, light_public_path, light_asset_sha256,
		   is_primary, status, needs_human_review,
		   updated_at
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'published', 0, CURRENT_TIMESTAMP)
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
		   light_r2_key = excluded.light_r2_key,
		   light_public_path = excluded.light_public_path,
		   light_asset_sha256 = excluded.light_asset_sha256,
		   is_primary = 1,
		   status = 'published',
		   needs_human_review = 0,
		   updated_at = CURRENT_TIMESTAMP`,
		params: [
			item.id,
			item.answerChainId,
			item.sourceQuestionId,
			dark.r2Key,
			dark.publicPath,
			item.altText,
			item.caption ?? null,
			dark.width,
			dark.height,
			item.styleKey,
			dark.promptText,
			JSON.stringify(item.generationMetadata),
			item.sourceFingerprint ?? null,
			dark.assetSha256 ?? fileSha256(dark.localPath),
			item.generationModel ?? null,
			light.r2Key,
			light.publicPath,
			light.assetSha256 ?? fileSha256(light.localPath)
		]
	};
}

/** @param {string} filePath */
export function fileSha256(filePath) {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** @param {string} rootDir */
function wranglerCommand(rootDir) {
	const local = path.join(rootDir, 'node_modules/.bin/wrangler');
	return existsSync(local) ? local : 'wrangler';
}
