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

export const CHAIN_ILLUSTRATION_PROVENANCE_VERSION = 'chain-illustration-provenance/v1';

/**
 * Build the auditable record stored inside generation_metadata_json. This records what was
 * actually checked and how the light asset was derived without pretending that a model judge was
 * a human review.
 *
 * @param {IllustrationPublishItem} item
 * @param {{hardChecks: {dark: unknown, light: unknown}, modelVisualAudit?: unknown, humanAudit?: unknown}} options
 */
export function buildIllustrationProvenance(
	item,
	{
		hardChecks,
		modelVisualAudit = { status: 'not_recorded' },
		humanAudit = { status: 'not_recorded' }
	}
) {
	const [dark, light] = illustrationThemePair(item);
	const darkPromptSha256 = verifiedOptionalDigest(
		dark.promptSha256,
		sha256Text(dark.promptText),
		`${item.id} dark prompt`
	);
	const lightPromptSha256 = verifiedOptionalDigest(
		light.promptSha256,
		sha256Text(light.promptText),
		`${item.id} light prompt`
	);
	const darkAssetSha256 = requiredDigest(
		dark.assetSha256 ?? (existsSync(dark.localPath) ? fileSha256(dark.localPath) : null),
		`${item.id} dark asset`
	);
	const lightAssetSha256 = requiredDigest(
		light.assetSha256 ?? (existsSync(light.localPath) ? fileSha256(light.localPath) : null),
		`${item.id} light asset`
	);
	if (light.derivedFromAssetSha256 !== darkAssetSha256) {
		throw new Error(`${item.id} light derivation does not name the verified dark asset.`);
	}
	const normalizedHardChecks = {
		dark: normalizeHardCheck(hardChecks?.dark),
		light: normalizeHardCheck(hardChecks?.light)
	};
	const assetSha256ByTheme = { dark: darkAssetSha256, light: lightAssetSha256 };
	for (const theme of /** @type {const} */ (['dark', 'light'])) {
		const assetSha256 = assetSha256ByTheme[theme];
		const check = normalizedHardChecks[theme];
		if (check.status !== 'passed') {
			throw new Error(`${item.id} ${theme} deterministic hard checks must pass.`);
		}
		if (check.sha256 && check.sha256 !== assetSha256) {
			throw new Error(`${item.id} ${theme} hard-check SHA-256 does not match the asset.`);
		}
	}
	const sourceFingerprint = requiredDigest(item.sourceFingerprint, `${item.id} source fingerprint`);
	const normalizedModelAudit = normalizeAudit(modelVisualAudit, 'model visual audit');
	const normalizedHumanAudit = normalizeAudit(humanAudit, 'human audit');
	return {
		schemaVersion: CHAIN_ILLUSTRATION_PROVENANCE_VERSION,
		sourceFingerprint,
		prompts: {
			dark: { sha256: darkPromptSha256 },
			light: { sha256: lightPromptSha256 }
		},
		assets: {
			darkSha256: darkAssetSha256,
			lightSha256: lightAssetSha256,
			lightDerivedFromDarkAssetSha256: darkAssetSha256,
			darkToLightDerivationSha256: sha256Text(
				[
					'action=edit',
					`dark=${darkAssetSha256}`,
					`lightPrompt=${lightPromptSha256}`,
					`light=${lightAssetSha256}`
				].join('\n')
			)
		},
		deterministicHardChecks: {
			...normalizedHardChecks,
			recordSha256: sha256Text(stableJson(normalizedHardChecks))
		},
		modelVisualAudit: normalizedModelAudit,
		humanAudit: normalizedHumanAudit
	};
}

/**
 * @param {IllustrationPublishItem} item
 * @param {{dark: unknown, light: unknown}} hardChecks
 */
export function assertIllustrationProvenance(item, hardChecks) {
	const metadata = isRecord(item.generationMetadata)
		? /** @type {Record<string, unknown>} */ (item.generationMetadata)
		: null;
	const actual =
		metadata && isRecord(metadata.provenance)
			? /** @type {Record<string, unknown>} */ (metadata.provenance)
			: null;
	if (!actual) throw new Error(`${item.id} generation metadata must contain provenance.`);
	const expected = buildIllustrationProvenance(item, {
		hardChecks,
		modelVisualAudit: actual.modelVisualAudit,
		humanAudit: actual.humanAudit
	});
	if (stableJson(actual) !== stableJson(expected)) {
		throw new Error(`${item.id} generation provenance does not match prompts, assets or checks.`);
	}
	return expected;
}

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
	const provenance = assertIllustrationProvenance(item, {
		dark: darkCheck,
		light: lightCheck
	});
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
	const replacement = skipD1 ? null : await publishD1Row(item, { rootDir });
	return {
		status: 'passed',
		width: darkCheck.width,
		height: darkCheck.height,
		provenance,
		replacement,
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
	const identityRows = await d1Rows(
		`SELECT id, answer_chain_id
		 FROM answer_chain_illustrations
		 WHERE id = ?`,
		[item.id],
		{ rootDir }
	);
	if (identityRows.some((row) => row.answer_chain_id !== item.answerChainId)) {
		throw new Error(`${item.id} is already owned by a different answer chain.`);
	}
	const priorPrimaryRows = await d1Rows(
		`SELECT id, answer_chain_id, is_primary, status, source_fingerprint
		 FROM answer_chain_illustrations
		 WHERE answer_chain_id = ?
		   AND is_primary = 1
		   AND status = 'published'`,
		[item.answerChainId],
		{ rootDir }
	);
	if (priorPrimaryRows.length > 1) {
		throw new Error(`${item.answerChainId} has more than one published primary illustration.`);
	}
	const upsert = illustrationUpsert(item);
	await d1Query(upsert.sql, upsert.params, { rootDir });
	const afterRows = await d1Rows(
		`SELECT id, answer_chain_id, is_primary, status, source_fingerprint,
		        generation_metadata_json
		 FROM answer_chain_illustrations
		 WHERE answer_chain_id = ?
		 ORDER BY created_at, id`,
		[item.answerChainId],
		{ rootDir }
	);
	return validateIllustrationReplacementState(item, priorPrimaryRows, afterRows);
}

/**
 * Verify the existing replacement-trigger semantics after an upsert. A content-addressed ID may
 * change when either asset changes; the new row must become the only published primary and the old
 * primary must remain as a non-primary draft.
 *
 * @param {IllustrationPublishItem} item
 * @param {any[]} priorPrimaryRows
 * @param {any[]} afterRows
 */
export function validateIllustrationReplacementState(item, priorPrimaryRows, afterRows) {
	const primaries = afterRows.filter(
		(row) => Number(row.is_primary) === 1 && row.status === 'published'
	);
	if (primaries.length !== 1 || primaries[0].id !== item.id) {
		throw new Error(`${item.id} did not become the sole published primary illustration.`);
	}
	const current = primaries[0];
	if (current.answer_chain_id !== item.answerChainId) {
		throw new Error(`${item.id} was published against the wrong answer chain.`);
	}
	if (current.source_fingerprint !== item.sourceFingerprint) {
		throw new Error(`${item.id} source fingerprint was not preserved by the D1 upsert.`);
	}
	let storedMetadata;
	try {
		storedMetadata = JSON.parse(current.generation_metadata_json);
	} catch {
		throw new Error(`${item.id} stored generation metadata is not valid JSON.`);
	}
	if (storedMetadata?.provenance?.sourceFingerprint !== item.sourceFingerprint) {
		throw new Error(`${item.id} stored provenance lost its source fingerprint.`);
	}
	const previous = priorPrimaryRows[0] ?? null;
	if (previous && previous.id !== item.id) {
		const retained = afterRows.find((row) => row.id === previous.id);
		if (!retained || Number(retained.is_primary) !== 0 || retained.status !== 'draft') {
			throw new Error(`${item.id} did not safely demote the previous primary ${previous.id}.`);
		}
	}
	return {
		status: 'passed',
		publishedIllustrationId: item.id,
		replacedIllustrationId: previous && previous.id !== item.id ? previous.id : null
	};
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

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** @param {unknown} value */
function normalizeHardCheck(value) {
	const record = /** @type {Record<string, unknown>} */ (isRecord(value) ? value : {});
	return {
		status: record.status === 'passed' ? 'passed' : 'failed',
		width: Number.isInteger(record.width) ? record.width : null,
		height: Number.isInteger(record.height) ? record.height : null,
		format: typeof record.format === 'string' ? record.format : null,
		sha256: typeof record.sha256 === 'string' ? record.sha256 : null,
		issues: Array.isArray(record.issues) ? record.issues.map(String) : []
	};
}

/** @param {unknown} value @param {'model visual audit' | 'human audit'} label */
function normalizeAudit(value, label) {
	const record = /** @type {Record<string, unknown>} */ (isRecord(value) ? value : {});
	const allowedStatuses = new Set(['passed', 'failed', 'not_performed', 'not_recorded']);
	const status = typeof record.status === 'string' ? record.status : 'not_recorded';
	if (!allowedStatuses.has(status)) {
		throw new Error(`${label} status is invalid.`);
	}
	if (label === 'model visual audit') {
		const model = nullableTrimmedString(record.model);
		const outputSha256 = record.outputSha256
			? requiredDigest(record.outputSha256, `${label} output`)
			: null;
		if ((status === 'passed' || status === 'failed') && (!model || !outputSha256)) {
			throw new Error(`${label} ${status} status requires model and outputSha256.`);
		}
		return {
			status,
			model,
			outputSha256,
			notes: nullableTrimmedString(record.notes)
		};
	}
	const reviewer = nullableTrimmedString(record.reviewer);
	const reviewedAt = nullableTrimmedString(record.reviewedAt);
	if ((status === 'passed' || status === 'failed') && (!reviewer || !reviewedAt)) {
		throw new Error(`${label} ${status} status requires reviewer and reviewedAt.`);
	}
	return {
		status,
		reviewer,
		reviewedAt,
		notes: nullableTrimmedString(record.notes),
		checklist: Array.isArray(record.checklist)
			? record.checklist.map((entry /** @type {unknown} */) => String(entry).trim()).filter(Boolean)
			: []
	};
}

/** @param {unknown} value */
function nullableTrimmedString(value) {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** @param {unknown} value @param {string} label */
function requiredDigest(value, label) {
	const digest = typeof value === 'string' ? value.trim() : '';
	if (!/^[a-f0-9]{64}$/.test(digest)) {
		throw new Error(`${label} must be a lowercase SHA-256 digest.`);
	}
	return digest;
}

/** @param {unknown} supplied @param {string} computed @param {string} label */
function verifiedOptionalDigest(supplied, computed, label) {
	if (supplied == null || supplied === '') return computed;
	const digest = requiredDigest(supplied, label);
	if (digest !== computed) throw new Error(`${label} SHA-256 does not match its text.`);
	return digest;
}

/** @param {string} value */
function sha256Text(value) {
	return createHash('sha256').update(value).digest('hex');
}

/** @param {unknown} value */
function stableJson(value) {
	return JSON.stringify(sortRecord(value));
}

/** @param {unknown} value @returns {unknown} */
function sortRecord(value) {
	if (Array.isArray(value)) return value.map(sortRecord);
	if (!isRecord(value)) return value;
	const record = /** @type {Record<string, unknown>} */ (value);
	return Object.fromEntries(
		Object.keys(record)
			.sort()
			.map((key) => [key, sortRecord(record[key])])
	);
}

/** @param {string} rootDir */
function wranglerCommand(rootDir) {
	const local = path.join(rootDir, 'node_modules/.bin/wrangler');
	return existsSync(local) ? local : 'wrangler';
}
